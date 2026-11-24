-- =====================================================================
-- DETEDE — klientská zóna (Supabase)
-- Spustit celé v Supabase → SQL Editor → New query → Run.
-- Skript jde spustit opakovaně (vše je "if not exists" / "or replace").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) KLIENTI — kdo smí do zóny. Účet (e-mail + heslo) se zakládá v
--    Authentication → Users, sem se pak přidá řádek se stejným id.
--    Bez řádku (nebo s active = false) se klient nepřihlásí do zóny.
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key references auth.users(id) on delete cascade,
  company       text not null,
  contact_name  text,
  ico           text,
  phone         text,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct < 100),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Je přihlášený uživatel aktivní klient?
create or replace function public.is_client()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.clients c where c.id = auth.uid() and c.active);
$$;

-- ---------------------------------------------------------------------
-- 2) CENÍK — cena za kus podle kódu sestavy a délky.
--    Kód = model-provedení-montáž-barva bez délky, např. N1-11-S-BL.
--    max_len_cm = horní hranice pásma (100, 150, 200 … 600).
--    Cena pro délku L = řádek s nejmenším max_len_cm >= L.
-- ---------------------------------------------------------------------
create table if not exists public.prices (
  code        text not null,
  max_len_cm  integer not null check (max_len_cm > 0),
  price_czk   numeric(10,2) not null check (price_czk >= 0),
  primary key (code, max_len_cm)
);

-- Cena za kus pro daného klienta (se slevou klienta). NULL = cena na dotaz.
create or replace function public.price_for(p_code text, p_len_cm integer)
returns numeric
language sql stable security definer set search_path = public
as $$
  select round(p.price_czk * (1 - coalesce(c.discount_pct, 0) / 100), 2)
  from public.prices p
  left join public.clients c on c.id = auth.uid()
  where p.code = p_code and p.max_len_cm >= p_len_cm
  order by p.max_len_cm
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 3) OBJEDNÁVKY
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  number         bigint generated always as identity,
  client_id      uuid not null references public.clients(id) on delete restrict,
  status         text not null default 'nova' check (status in ('nova','prijata','vyrizena','zrusena')),
  note           text,
  total_czk      numeric(12,2),           -- NULL, když je některá položka "cena na dotaz"
  email_sent_at  timestamptz,
  premier_id     text,                    -- až se napojí PREMIER
  created_at     timestamptz not null default now()
);

create table if not exists public.order_items (
  id              bigint generated always as identity primary key,
  order_id        uuid not null references public.orders(id) on delete cascade,
  code            text not null,          -- celý kód vč. délky, např. B1-21-S-CE-337
  base_code       text not null,          -- bez délky, podle něj se hledá cena
  model           text not null,
  variant         text,
  color           text,
  mount           text,
  dimension_text  text,
  total_len_cm    integer not null check (total_len_cm > 0),
  quantity        integer not null check (quantity between 1 and 999),
  unit_price_czk  numeric(10,2),          -- NULL = cena na dotaz
  line_total_czk  numeric(12,2),
  data            jsonb not null default '{}'::jsonb   -- celá konfigurace z webu (rozměry, sestava…)
);

create index if not exists orders_client_idx on public.orders(client_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Vytvoření objednávky. Ceny se počítají TADY na serveru (cenám z prohlížeče se nevěří).
-- p_items = pole položek z košíku: { code, base_code, model, variant, color, mount,
--           dimension_text, total_len_cm, quantity, data }
create or replace function public.place_order(p_items jsonb, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order uuid;
  v_item  jsonb;
  v_len   integer;
  v_qty   integer;
  v_unit  numeric;
  v_total numeric := 0;
  v_unknown boolean := false;
begin
  if not public.is_client() then
    raise exception 'Nejste přihlášen jako klient.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Košík je prázdný.';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Příliš mnoho položek v jedné objednávce.';
  end if;

  insert into public.orders (client_id, note) values (auth.uid(), nullif(left(trim(p_note), 2000), ''))
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_len := (v_item->>'total_len_cm')::integer;
    v_qty := (v_item->>'quantity')::integer;
    if v_len is null or v_len <= 0 or v_len > 5000 then raise exception 'Neplatná délka.'; end if;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'Neplatné množství.'; end if;

    v_unit := public.price_for(v_item->>'base_code', v_len);
    if v_unit is null then v_unknown := true; else v_total := v_total + v_unit * v_qty; end if;

    insert into public.order_items (order_id, code, base_code, model, variant, color, mount,
                                    dimension_text, total_len_cm, quantity, unit_price_czk, line_total_czk, data)
    values (v_order,
            left(v_item->>'code', 80), left(v_item->>'base_code', 80), left(v_item->>'model', 80),
            left(v_item->>'variant', 120), left(v_item->>'color', 80), left(v_item->>'mount', 80),
            left(v_item->>'dimension_text', 200), v_len, v_qty,
            v_unit, case when v_unit is null then null else v_unit * v_qty end,
            coalesce(v_item->'data', '{}'::jsonb));
  end loop;

  update public.orders set total_czk = case when v_unknown then null else v_total end where id = v_order;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) BEZPEČNOST (RLS) — klient vidí jen sebe a svoje objednávky,
--    ceník jen aktivní klient. Zápis do objednávek jen přes place_order().
-- ---------------------------------------------------------------------
alter table public.clients     enable row level security;
alter table public.prices      enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "klient vidi sebe" on public.clients;
create policy "klient vidi sebe" on public.clients
  for select to authenticated using (id = auth.uid());

drop policy if exists "klient vidi cenik" on public.prices;
create policy "klient vidi cenik" on public.prices
  for select to authenticated using (public.is_client());

drop policy if exists "klient vidi sve objednavky" on public.orders;
create policy "klient vidi sve objednavky" on public.orders
  for select to authenticated using (client_id = auth.uid() and public.is_client());

drop policy if exists "klient vidi sve polozky" on public.order_items;
create policy "klient vidi sve polozky" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.client_id = auth.uid())
    and public.is_client()
  );

-- Přístup přes API (projekt může mít vypnuté „Grant API access to new tables automatically“).
-- Jen čtení pro přihlášené; co z toho opravdu uvidí, hlídají pravidla výše. Anonym nedostane nic.
grant usage on schema public to anon, authenticated;
revoke all on public.clients, public.prices, public.orders, public.order_items from anon;
grant select on public.clients, public.prices, public.orders, public.order_items to authenticated;

revoke all on function public.place_order(jsonb, text) from public, anon;
grant execute on function public.place_order(jsonb, text) to authenticated;
revoke all on function public.price_for(text, integer) from public, anon;
grant execute on function public.price_for(text, integer) to authenticated;
grant execute on function public.is_client() to authenticated;

-- ---------------------------------------------------------------------
-- 5) KE STAŽENÍ — soukromý bucket "klienti" (ceníky, technické listy, PDF).
--    Soubory nahrávejte v Storage → klienti (můžete i do složek).
--    Číst je smí jen aktivní klient; odkazy na stažení jsou dočasné.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('klienti', 'klienti', false)
on conflict (id) do nothing;

drop policy if exists "klient cte soubory" on storage.objects;
create policy "klient cte soubory" on storage.objects
  for select to authenticated using (bucket_id = 'klienti' and public.is_client());

-- ---------------------------------------------------------------------
-- 7) SPRÁVCE — vidí a spravuje vše ve stránce spravce.html.
--    Účty klientů (e-mail + heslo) zakládá serverová funkce admin-klienti,
--    ta ověří, že ji volá správce. Prvního správce přidá SQL:
--    insert into public.admins (id) select id from auth.users where email = '…';
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where a.id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "spravce vidi sebe" on public.admins;
create policy "spravce vidi sebe" on public.admins
  for select to authenticated using (id = auth.uid());

-- Klienti: správce čte a upravuje všechny (zakládání jen přes funkci, kvůli účtu).
drop policy if exists "spravce cte klienty" on public.clients;
create policy "spravce cte klienty" on public.clients
  for select to authenticated using (public.is_admin());
drop policy if exists "spravce upravuje klienty" on public.clients;
create policy "spravce upravuje klienty" on public.clients
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ceník: správce čte a mění vše.
drop policy if exists "spravce spravuje cenik" on public.prices;
create policy "spravce spravuje cenik" on public.prices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Objednávky: správce vidí všechny a mění stav.
drop policy if exists "spravce cte objednavky" on public.orders;
create policy "spravce cte objednavky" on public.orders
  for select to authenticated using (public.is_admin());
drop policy if exists "spravce meni objednavky" on public.orders;
create policy "spravce meni objednavky" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "spravce cte polozky" on public.order_items;
create policy "spravce cte polozky" on public.order_items
  for select to authenticated using (public.is_admin());

-- Soubory ke stažení: správce čte, nahrává a maže.
drop policy if exists "spravce cte soubory" on storage.objects;
create policy "spravce cte soubory" on storage.objects
  for select to authenticated using (bucket_id = 'klienti' and public.is_admin());
drop policy if exists "spravce nahrava soubory" on storage.objects;
create policy "spravce nahrava soubory" on storage.objects
  for insert to authenticated with check (bucket_id = 'klienti' and public.is_admin());
drop policy if exists "spravce meni soubory" on storage.objects;
create policy "spravce meni soubory" on storage.objects
  for update to authenticated using (bucket_id = 'klienti' and public.is_admin());
drop policy if exists "spravce maze soubory" on storage.objects;
create policy "spravce maze soubory" on storage.objects
  for delete to authenticated using (bucket_id = 'klienti' and public.is_admin());

-- Práva přes API pro správce (co smí, hlídají pravidla výše).
revoke all on public.admins from anon;
grant select on public.admins to authenticated;
grant update (company, contact_name, ico, phone, discount_pct, active) on public.clients to authenticated;
grant insert, update, delete on public.prices to authenticated;
grant update (status, premier_id) on public.orders to authenticated;

-- Serverové funkce (servisní klíč) potřebují plný přístup k tabulkám.
grant all on public.clients, public.prices, public.orders, public.order_items, public.admins to service_role;
-- Výchozí práva Supabase dávají i TRUNCATE/TRIGGER/REFERENCES — přes API nejdou, ale nepotřebujeme je.
revoke truncate, trigger, references on public.clients, public.prices, public.orders, public.order_items, public.admins from anon, authenticated;

-- Přehled klientů pro správce i s e-mailem a posledním přihlášením (e-maily jsou v auth.users).
create or replace function public.admin_clients()
returns table (id uuid, email text, company text, contact_name text, ico text, phone text,
               discount_pct numeric, active boolean, created_at timestamptz, last_sign_in_at timestamptz, orders bigint)
language sql stable security definer set search_path = public
as $$
  select c.id, u.email::text, c.company, c.contact_name, c.ico, c.phone, c.discount_pct, c.active,
         c.created_at, u.last_sign_in_at, (select count(*) from public.orders o where o.client_id = c.id)
  from public.clients c join auth.users u on u.id = c.id
  where public.is_admin()
  order by c.company;
$$;
revoke all on function public.admin_clients() from public, anon;
grant execute on function public.admin_clients() to authenticated;

-- ---------------------------------------------------------------------
-- 6) UKÁZKOVÝ CENÍK — jediný ceník, který máme ze skutečných podkladů:
--    katalog „Line“, str. 6, sestava N1-11-S-BL (N1 Napoli, jednokolejnička
--    rovná, strop, bílá). Ostatní kódy = "cena na dotaz", dokud se nedoplní.
-- ---------------------------------------------------------------------
insert into public.prices (code, max_len_cm, price_czk) values
  ('N1-11-S-BL', 100, 300), ('N1-11-S-BL', 150, 450), ('N1-11-S-BL', 200, 600),
  ('N1-11-S-BL', 250, 750), ('N1-11-S-BL', 300, 800), ('N1-11-S-BL', 350, 950),
  ('N1-11-S-BL', 400, 1100), ('N1-11-S-BL', 500, 1300), ('N1-11-S-BL', 600, 1500)
on conflict (code, max_len_cm) do update set price_czk = excluded.price_czk;
