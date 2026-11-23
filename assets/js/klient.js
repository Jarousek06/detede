'use strict';
/* Klientská zóna Detede — přihlášení (Supabase Auth), košík, ceny a objednávky.
   Stránky mluví jen s window.Klient. Bez konfigurace nebo knihovny je Klient.enabled = false
   a web běží jako dřív (nezávazná poptávka). */

(() => {
  const cfg = window.DETEDE_KLIENT || {};
  const enabled = !!(cfg.url && cfg.key && window.supabase && window.supabase.createClient);
  // Odkaz z pozvánky nebo z „Zapomněli jste heslo?“ nese v adrese type=invite / type=recovery.
  // Zachytit to dřív, než knihovna adresu vyčistí → stránka nabídne nastavení hesla.
  let fromLink = /[#&?]type=(invite|recovery)\b/.test(location.hash + location.search);
  const sb = enabled ? window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'detede.auth' }
  }) : null;

  let user = null, client = null, admin = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(state()); } catch (e) { console.error(e); } });
  const state = () => ({ enabled, user, client, admin, cartCount: cart.count() });

  // ---- Košík: v prohlížeči, zvlášť pro každého klienta -------------------------------
  const cartKey = () => user ? `detede.cart.${user.id}` : null;
  const readCart = () => {
    const k = cartKey(); if (!k) return [];
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  };
  const writeCart = items => {
    const k = cartKey(); if (!k) return;
    try { items.length ? localStorage.setItem(k, JSON.stringify(items)) : localStorage.removeItem(k); } catch (e) { }
    emit();
  };
  const cart = {
    list: () => readCart(),
    count: () => readCart().reduce((n, it) => n + (it.quantity || 1), 0),
    add(item) {
      const items = readCart();
      // Stejná konfigurace (kód vč. délky) se stejnou poznámkou se jen přičte; jiná poznámka (jiný pokoj) = nový řádek.
      const same = items.find(it => it.code === item.code && (it.note || '') === (item.note || ''));
      if (same) { same.quantity = Math.min(999, same.quantity + item.quantity); same.addedAt = Date.now(); }
      else items.push({ ...item, addedAt: Date.now() });
      writeCart(items);
    },
    setQty(index, qty) {
      const items = readCart();
      if (!items[index]) return;
      items[index].quantity = Math.max(1, Math.min(999, parseInt(qty, 10) || 1));
      writeCart(items);
    },
    setNote(index, note) {
      const items = readCart();
      if (!items[index]) return;
      items[index].note = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      writeCart(items);
    },
    remove(index) { const items = readCart(); items.splice(index, 1); writeCart(items); },
    clear() { writeCart([]); }
  };

  // ---- Přihlášení -------------------------------------------------------------------
  async function loadClient() {
    client = null; admin = false;
    if (!user) return;
    const [{ data }, { data: isAdmin }] = await Promise.all([
      sb.from('clients').select('company, contact_name, ico, phone, discount_pct, active').eq('id', user.id).maybeSingle(),
      sb.rpc('is_admin')
    ]);
    client = data && data.active ? data : null;
    admin = isAdmin === true;
  }

  let readyResolve;
  const ready = new Promise(r => { readyResolve = r; });
  if (!enabled) readyResolve(state());
  else {
    sb.auth.onAuthStateChange((event, session) => {
      // Načtení klienta mimo callback (Supabase doporučuje nevolat API přímo uvnitř).
      setTimeout(async () => {
        user = session ? session.user : null;
        await loadClient().catch(() => { client = null; });
        if (event === 'PASSWORD_RECOVERY' || (fromLink && session)) { recovery = true; fromLink = false; }
        readyResolve(state());
        emit();
      }, 0);
    });
  }
  let recovery = false;

  const czMsg = (error) => {
    const m = (error && (error.message || error.error_description)) || '';
    if (/Invalid login credentials/i.test(m)) return 'Nesprávný e-mail nebo heslo.';
    if (/Email not confirmed/i.test(m)) return 'E-mail ještě není potvrzený. Kontaktujte nás prosím.';
    if (/rate limit|too many/i.test(m)) return 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.';
    if (/Password should be at least/i.test(m)) return 'Heslo musí mít aspoň 8 znaků.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Nepodařilo se spojit se serverem. Zkontrolujte připojení.';
    return m || 'Něco se nepovedlo. Zkuste to prosím znovu.';
  };

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(czMsg(error));
    const { data } = await sb.auth.getUser();
    user = data.user; await loadClient();
    if (!client && !admin) {
      await sb.auth.signOut();
      user = null;
      throw new Error('Tento účet zatím nemá přístup do klientské zóny. Kontaktujte nás prosím.');
    }
    emit();
  }
  async function signOut() { await sb.auth.signOut(); user = null; client = null; admin = false; emit(); }
  async function resetPassword(email) {
    const redirectTo = new URL('klient.html', location.href).href;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw new Error(czMsg(error));
  }
  async function updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(czMsg(error));
    recovery = false;
  }

  // ---- Ceny a objednávky ------------------------------------------------------------
  const priceCache = new Map();
  async function price(baseCode, lenCm) {
    if (!client || !baseCode || !(lenCm > 0)) return null;
    const k = `${baseCode}|${lenCm}`;
    if (!priceCache.has(k)) {
      priceCache.set(k, sb.rpc('price_for', { p_code: baseCode, p_len_cm: Math.round(lenCm) })
        .then(({ data, error }) => { if (error) throw error; return data == null ? null : Number(data); })
        .catch(e => { priceCache.delete(k); throw e; }));
    }
    return priceCache.get(k);
  }

  async function placeOrder(note) {
    const items = cart.list();
    if (!items.length) throw new Error('Košík je prázdný.');
    const payload = items.map(it => ({
      code: it.code, base_code: it.baseCode, model: it.model, variant: it.variant || null,
      color: it.color, mount: it.mount, dimension_text: it.dimensionText,
      total_len_cm: it.totalLenCm, quantity: it.quantity, data: { ...(it.data || {}), note: it.note || '' }
    }));
    const { data: orderId, error } = await sb.rpc('place_order', { p_items: payload, p_note: note || null });
    if (error) throw new Error(czMsg(error));
    cart.clear();
    // E-mail je druhý krok: když selže, objednávka je i tak uložená a uvidí ji v historii.
    let emailOk = false;
    try {
      const { error: fnErr } = await sb.functions.invoke('objednavka-email', { body: { order_id: orderId } });
      emailOk = !fnErr;
    } catch (e) { emailOk = false; }
    return { orderId, emailOk };
  }

  async function orders() {
    const { data, error } = await sb.from('orders')
      .select('id, number, status, note, total_czk, created_at, order_items(id, code, model, variant, color, mount, dimension_text, quantity, unit_price_czk, line_total_czk, data)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(czMsg(error));
    return data || [];
  }

  // ---- Ke stažení (soukromý bucket "klienti") ----------------------------------------
  async function files(prefix = '') {
    const { data, error } = await sb.storage.from('klienti').list(prefix, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(czMsg(error));
    return (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
  }
  async function fileUrl(path) {
    const { data, error } = await sb.storage.from('klienti').createSignedUrl(path, 300, { download: true });
    if (error) throw new Error(czMsg(error));
    return data.signedUrl;
  }

  const czk = n => n == null ? 'Cena na dotaz' : new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);

  // ---- Odkazy v hlavičce: [data-klient-link] (text) a [data-cart-count] (počet) -------
  function paintHeader(s) {
    document.querySelectorAll('[data-klient-label]').forEach(el => {
      el.textContent = s.client ? 'Můj účet' : 'Klientská zóna';
    });
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = s.cartCount;
      el.hidden = !s.client || !s.cartCount;
    });
  }
  listeners.add(paintHeader);
  ready.then(paintHeader);

  // ---- Plovoucí tlačítko „Objednávka“ — vidět na každé stránce i nad okny katalogu ----
  // Jen pro přihlášeného klienta. Stránka může mít vlastní panel (window.openCartDrawer), jinak vede do zóny.
  // Na stránkách se záložkou objednávky (klient.html, spravce.html) se vypne atributem <body data-no-cart-fab>.
  let fab = null, lastCount = null;
  function mountFab() {
    if (fab || document.body.hasAttribute('data-no-cart-fab')) return;
    fab = document.createElement('a');
    fab.href = 'klient.html#kosik';
    fab.className = 'kz-fab';
    fab.hidden = true;
    fab.setAttribute('aria-label', 'Vaše objednávka');
    fab.innerHTML = '<i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span class="kz-fab-label">Vaše objednávka</span><span class="kz-fab-count">0</span>';
    fab.addEventListener('click', e => {
      if (typeof window.openCartDrawer === 'function') { e.preventDefault(); window.openCartDrawer(null); }
    });
    document.body.appendChild(fab);
  }
  function paintFab(s) {
    if (!fab) return;
    fab.hidden = !s.client;
    const n = s.cartCount;
    fab.querySelector('.kz-fab-count').textContent = n;
    fab.classList.toggle('is-empty', !n);
    fab.setAttribute('aria-label', n ? `Vaše objednávka, ${n} ks` : 'Vaše objednávka je prázdná');
    if (lastCount !== null && n > lastCount) { fab.classList.remove('is-bump'); void fab.offsetWidth; fab.classList.add('is-bump'); }
    lastCount = n;
  }
  const startFab = () => { mountFab(); ready.then(paintFab); listeners.add(paintFab); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startFab); else startFab();
  // Změna košíku v jiné záložce prohlížeče se promítne i sem.
  window.addEventListener('storage', e => { if (e.key && e.key.startsWith('detede.cart.')) emit(); });

  window.Klient = {
    enabled, ready, cart, czk, czMsg,
    sb, // přímý přístup pro stránku správce (co smí, hlídá databáze)
    get user() { return user; }, get client() { return client; }, get admin() { return admin; }, get recovery() { return recovery; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    signIn, signOut, resetPassword, updatePassword, price, placeOrder, orders, files, fileUrl
  };
})();
