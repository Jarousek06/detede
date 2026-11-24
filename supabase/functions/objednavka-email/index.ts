// Supabase Edge Function: pošle e-mail s objednávkou (zatím testovací adresa, později PREMIER).
// Volá ji klientská zóna hned po place_order(). Ověří, že objednávka patří přihlášenému klientovi,
// e-mail pošle jen jednou (email_sent_at) a přes Resend.
//
// Tajné hodnoty (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  — klíč z resend.com
//   ORDER_EMAIL     — kam chodí objednávky (teď perlik@detede.cz)
//   ORDER_FROM      — odesílatel, např. "Detede objednávky <objednavky@detede.cz>"
//                     (bez ověřené domény v Resendu jen "onboarding@resend.dev")
// SUPABASE_URL, SUPABASE_ANON_KEY a SUPABASE_SERVICE_ROLE_KEY doplní Supabase sám.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const czk = (n: number | null) =>
  n == null ? "na dotaz" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Klíče: starší projekty SUPABASE_ANON_KEY / SERVICE_ROLE_KEY, nové SUPABASE_PUBLISHABLE_KEYS / SECRET_KEYS (JSON).
  const firstKey = (v?: string) => {
    if (!v) return "";
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) return String(j[0] ?? "");
      if (j && typeof j === "object") return String((j as Record<string, string>).default ?? Object.values(j)[0] ?? "");
    } catch { /* obyčejný řetězec */ }
    return v;
  };
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || firstKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || firstKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ORDER_EMAIL");
  const from = Deno.env.get("ORDER_FROM") || "Detede objednávky <onboarding@resend.dev>";
  if (!resendKey || !to) return json({ error: "E-mail zatím není nastavený (RESEND_API_KEY / ORDER_EMAIL)." }, 503);

  let orderId = "";
  try { orderId = String((await req.json()).order_id || ""); } catch { /* prázdné tělo */ }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Chybí order_id." }, 400);

  // Jako přihlášený klient: RLS pustí jen jeho vlastní objednávku.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: order, error } = await asUser
    .from("orders")
    .select("id, number, note, total_czk, created_at, email_sent_at, client_id, order_items(*)")
    .eq("id", orderId)
    .single();
  if (error || !order) return json({ error: "Objednávka nenalezena." }, 404);
  if (order.email_sent_at) return json({ ok: true, already: true });

  const { data: client } = await asUser.from("clients").select("company, contact_name, ico, phone").eq("id", order.client_id).single();
  const { data: { user } } = await asUser.auth.getUser();

  const items = (order.order_items || []).sort((a: any, b: any) => a.id - b.id);
  const rows = items.map((it: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7;font-family:monospace">${esc(it.code)}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7">${esc(it.model)}${it.variant ? "<br><small>" + esc(it.variant) + "</small>" : ""}${it.data?.note ? "<br><b>Poznámka: " + esc(it.data.note) + "</b>" : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7">${esc(it.color)}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7">${esc(it.mount)}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7">${esc(it.dimension_text)}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right">${it.quantity} ks</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right">${czk(it.unit_price_czk)}</td>
      <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right">${czk(it.line_total_czk)}</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:Arial,sans-serif;color:#18181b;max-width:900px">
    <h2 style="margin:0 0 4px">Nová objednávka č. ${order.number}</h2>
    <p style="margin:0 0 16px;color:#71717a">${new Date(order.created_at).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} · TESTOVACÍ REŽIM (před napojením na PREMIER)</p>
    <p style="margin:0 0 16px">
      <strong>${esc(client?.company)}</strong>${client?.ico ? " · IČO " + esc(client.ico) : ""}<br>
      ${esc(client?.contact_name)}${client?.phone ? " · " + esc(client.phone) : ""}<br>
      ${esc(user?.email)}
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="background:#f4f4f5;text-align:left">
        <th style="padding:8px">Kód</th><th style="padding:8px">Model</th><th style="padding:8px">Barva</th>
        <th style="padding:8px">Montáž</th><th style="padding:8px">Rozměr</th><th style="padding:8px;text-align:right">Množství</th>
        <th style="padding:8px;text-align:right">Cena/ks</th><th style="padding:8px;text-align:right">Celkem</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:16px 0 0;font-size:16px"><strong>Celkem: ${czk(order.total_czk)}</strong>${order.total_czk == null ? " (některé položky mají cenu na dotaz)" : ""}</p>
    ${order.note ? `<p style="margin:16px 0 0"><strong>Poznámka klienta:</strong><br>${esc(order.note).replace(/\n/g, "<br>")}</p>` : ""}
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to],
      reply_to: user?.email || undefined,
      subject: `Objednávka č. ${order.number} — ${client?.company ?? "klient"}`,
      html,
    }),
  });
  if (!res.ok) return json({ error: "Odeslání e-mailu selhalo.", detail: await res.text() }, 502);

  // Označit jako odeslané (servisním klíčem — klient do objednávek zapisovat nesmí).
  await createClient(url, service).from("orders").update({ email_sent_at: new Date().toISOString() }).eq("id", order.id);
  return json({ ok: true });
});
