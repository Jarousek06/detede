// Supabase Edge Function: správa klientských účtů pro stránku spravce.html.
// Účty v Supabase Auth smí zakládat jen server (servisní klíč), proto tahle funkce.
// Každé volání ověří, že volající je správce (tabulka public.admins).
//
// Akce (POST JSON):
//   { action: "create", email, company, contact_name?, ico?, phone?, discount_pct? }
//       → založí účet s vygenerovaným heslem + řádek v clients, vrátí { id, email, password }
//   { action: "reset_password", id }  → nové vygenerované heslo, vrátí { password }
// Heslo se nikde neukládá v čitelné podobě — správce ho vidí jen jednou v odpovědi.
//
// SUPABASE_URL, SUPABASE_ANON_KEY a SUPABASE_SERVICE_ROLE_KEY doplní Supabase sám.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Čitelné heslo bez záměnných znaků (0/O, 1/l/I): 3 skupiny po 4 znacích, ~70 bitů náhody.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let s = "";
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    groups.push(s);
  }
  // Zaručit číslici i velké písmeno (některé politiky hesel je vyžadují).
  let pw = groups.join("-");
  if (!/\d/.test(pw)) pw = pw.slice(0, -1) + "7";
  if (!/[A-Z]/.test(pw)) pw = "K" + pw.slice(1);
  return pw;
}

// Klíče: starší projekty mají SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY,
// nové SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (JSON). Bereme, co je k dispozici.
const firstKey = (v?: string) => {
  if (!v) return "";
  try {
    const j = JSON.parse(v);
    if (Array.isArray(j)) return String(j[0] ?? "");
    if (j && typeof j === "object") return String((j as Record<string, string>).default ?? Object.values(j)[0] ?? "");
  } catch { /* obyčejný řetězec */ }
  return v;
};
const anonKey = () => Deno.env.get("SUPABASE_ANON_KEY") || firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || firstKey(Deno.env.get("SUPABASE_SECRET_KEYS"));

const clean = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = anonKey();
  const service = serviceKey();
  if (!anon || !service) return json({ error: "Funkce nemá přístupové klíče projektu." }, 500);

  // 1) Kdo volá? (token přihlášeného uživatele z prohlížeče)
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Nejste přihlášen." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: isAdmin } = await admin.from("admins").select("id").eq("id", user.id).maybeSingle();
  if (!isAdmin) return json({ error: "Tuto akci smí provést jen správce." }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* prázdné tělo */ }

  // 2) Nový klient
  if (body.action === "create") {
    const email = clean(body.email, 254)?.toLowerCase();
    const company = clean(body.company, 200);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Zadejte platný e-mail." }, 400);
    if (!company) return json({ error: "Zadejte název firmy." }, 400);
    const discount = Number(body.discount_pct ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount >= 100) return json({ error: "Sleva musí být 0–99 %." }, 400);

    const password = generatePassword();
    const { data: created, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr || !created.user) {
      const msg = /already|exists|registered/i.test(authErr?.message ?? "")
        ? "Účet s tímto e-mailem už existuje. Použijte u něj „Nové heslo“."
        : "Účet se nepodařilo založit.";
      return json({ error: msg, detail: authErr?.message }, 400);
    }

    const { error: rowErr } = await admin.from("clients").insert({
      id: created.user.id, company,
      contact_name: clean(body.contact_name), ico: clean(body.ico, 20), phone: clean(body.phone, 40),
      discount_pct: Math.round(discount * 100) / 100,
    });
    if (rowErr) {
      await admin.auth.admin.deleteUser(created.user.id); // nenechat účet bez klienta
      return json({ error: "Klienta se nepodařilo uložit.", detail: rowErr.message }, 500);
    }
    return json({ id: created.user.id, email, password });
  }

  // 3) Nové heslo pro existujícího klienta
  if (body.action === "reset_password") {
    const id = clean(body.id, 36);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Chybí klient." }, 400);
    const { data: row } = await admin.from("clients").select("id").eq("id", id).maybeSingle();
    if (!row) return json({ error: "Klient nenalezen." }, 404);
    const password = generatePassword();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: "Heslo se nepodařilo změnit.", detail: error.message }, 500);
    return json({ password });
  }

  return json({ error: "Neznámá akce." }, 400);
});
