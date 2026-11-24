# Klientská zóna Detede — jak ji zprovoznit

Zóna je hotová v kódu, ale potřebuje **Supabase** (účty, ceník, objednávky, soubory) a pro e-maily
**Resend**. Dokud v `assets/js/klient-config.js` nejsou vyplněné klíče, web běží jako dřív
(nezávazná poptávka) a `klient.html` ukazuje „Klientská zóna se připravuje“.

## Co klient umí
- Přihlásí se v **klient.html** (e-mail + heslo). Registrace je vypnutá, účty zakládá jen majitel.
- V **katalogu kolejnic** vidí cenu podle svého ceníku a tlačítko **Přidat do košíku**.
- V zóně má **Košík** (množství, mazání, poznámka, odeslání), **Objednávky** (historie)
  a **Ke stažení** (soubory jen pro partnery).
- Objednávka se uloží do databáze a odejde e-mailem na **perlik@detede.cz** (testovací režim
  před napojením na PREMIER).

---

## 1. Supabase projekt (jednorázově, cca 10 minut)
1. Na [supabase.com](https://supabase.com) → **New project**, název `detede`, region **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → vložit celý soubor `supabase/schema.sql` → **Run**.
   Vytvoří tabulky, zabezpečení, bucket „klienti“ a ukázkový ceník N1-11-S-BL.
3. **Authentication → Sign In / Providers**: vypnout **Allow new users to sign up**
   (nikdo cizí si účet nezaloží). Email provider nechat zapnutý.
4. **Authentication → URL Configuration**:
   - Site URL: adresa webu (např. `https://detede.netlify.app`, později `https://www.detede.cz`)
   - Redirect URLs: `https://…/klient.html` a pro testy `http://localhost:5173/klient.html`
   (kvůli odkazu „Zapomněli jste heslo?“).
5. **Project Settings → API**: zkopírovat **Project URL** a **publishable (anon) key**
   do `assets/js/klient-config.js`. *Nikdy tam nedávat secret / service_role klíč.*

## 2. Správce a klienti — stránka **spravce.html**
Klienty, objednávky, ceník i soubory spravuje správce na stránce **Správa** (`spravce.html`):
- **Klienti → Nový klient**: firma, e-mail, kontakt, telefon, IČO, sleva v %. Heslo se **vygeneruje samo**
  a ukáže se **jen jednou** i s hotovou zprávou pro klienta (tlačítko „Kopírovat zprávu pro klienta“).
- **Nové heslo**: vygeneruje klientovi nové (staré přestane platit). **Zablokovat / Odblokovat** přístup.
- **Objednávky**: všechny objednávky, změna stavu (nová → přijatá → vyřízená / zrušená).
- **Ceník**: přidání a úprava cen po pásmech délky, mazání.
- **Soubory**: nahrávání a mazání souborů ke stažení, složky.

Účty zakládá serverová funkce **`admin-klienti`** (Supabase → Edge Functions), ověřuje, že ji volá správce.
U funkcí je vypnuté „Verify JWT with legacy secret“ — přihlášení si funkce kontroluje sama.

**Prvního správce** (jednou): v Supabase **Authentication → Users → Add user → Create new user**
(svůj e-mail + heslo, **Auto Confirm User**), pak v SQL Editoru:
```sql
insert into public.admins (id) select id from auth.users where email = 'vas@email.cz';
```
Správce může být zároveň klient (stačí mu přidat řádek v `clients`).

## 3. Ceník
Tabulka **prices**: `code` = kód sestavy **bez délky** (stejný, jaký web skládá), `max_len_cm` = horní
hranice pásma, `price_czk` = cena za kus. Pro délku se vezme nejbližší vyšší pásmo.
```sql
insert into public.prices (code, max_len_cm, price_czk) values
  ('B1-21-S-BL', 100, 0), ('B1-21-S-BL', 150, 0) -- … doplnit skutečné ceny
on conflict (code, max_len_cm) do update set price_czk = excluded.price_czk;
```
Kódy, které v ceníku nejsou, se zobrazí jako **„Cena na dotaz“** a objednat je jde i tak.
Zatím je vyplněná jen **N1-11-S-BL** z katalogu Line (str. 6). Barvy v kódu: BL bílá, CE černá,
BN, BH, BB, u B1 NE/BE (elox — kódy ověřit).
**Otázka k ověření:** jsou ceny v katalogu s DPH, nebo bez? Web teď DPH neuvádí.

## 4. Ke stažení
**Storage → klienti** → nahrát soubory (jdou i složky). Vidí je jen přihlášení klienti,
odkaz ke stažení platí 5 minut.

## 5. E-mail s objednávkou (Resend)
1. Účet na [resend.com](https://resend.com) → **API Keys → Create**.
   *Bez ověřené domény posílá Resend jen na e-mail, pod kterým je účet založený* — buď účet
   založit na **perlik@detede.cz**, nebo v Resendu ověřit doménu **detede.cz** (DNS záznamy).
2. Supabase → **Edge Functions → Deploy a new function → Via Editor**, název **`objednavka-email`**,
   vložit obsah `supabase/functions/objednavka-email/index.ts` → Deploy.
3. **Edge Functions → Secrets**:
   - `RESEND_API_KEY` = klíč z Resendu
   - `ORDER_EMAIL` = `perlik@detede.cz`
   - `ORDER_FROM` = `Detede objednávky <onboarding@resend.dev>` (po ověření domény např. `objednavky@detede.cz`)

Když e-mail selže, objednávka zůstane uložená (tabulka **orders**, sloupec `email_sent_at` je prázdný).

## 6. Stav objednávky
**Table Editor → orders → status**: `nova` → `prijata` → `vyrizena` (nebo `zrusena`). Klient stav vidí v historii.

## 7. Nasazení (Netlify Drop)
Přibalit `klient.html`, `assets/js/klient.js`, `assets/js/klient-config.js`, `assets/css/klient.css`.
Složku `supabase/` na web nedávat (není potřeba, jen podklad pro Supabase).

## 8. Později: PREMIER
Objednávka má sloupec `premier_id` a každá položka celý kód + kompletní konfiguraci v `data`
(rozměry, montáž, sestava). Napojení pak pošle přijaté objednávky do PREMIERu podle mapy kódů
v `PREMIER-priprava-katalog.md` a e-mail se vypne nebo přesměruje.
