// DeTe Detail — shared page behaviour: header scroll state, contact scroll helper, reveal-on-scroll.

function scrollToContact() {
  const contactSection = document.getElementById('contact');
  if (contactSection) {
    contactSection.scrollIntoView({ behavior: 'smooth' });
  }
}

window.addEventListener('scroll', () => {
  const header = document.querySelector('header');
  if (!header) return;
  if (window.scrollY > 50) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
});

const detedeRevealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-shown'); });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => detedeRevealObserver.observe(el));

// Mobile hamburger menu — the desktop <nav> is hidden below the md breakpoint,
// so this is its replacement rather than a duplicate of it.
document.querySelectorAll('.mobile-menu-btn').forEach(btn => {
  const menu = document.getElementById(btn.getAttribute('aria-controls'));
  if (!menu) return;
  const icon = btn.querySelector('i');

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
    if (icon) icon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  }

  btn.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) setOpen(false); });
});

// "Právě přijímáme zakázky" badge — only shown during real business hours
// (Po–Pá 7:00–15:30, per the footer's "Provozní doba"), checked in the
// company's own timezone so it's correct no matter where the visitor is.
function isDetedeOpenNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const weekdayIndex = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[map.weekday];
  const minutesNow = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  const isWeekday = weekdayIndex >= 1 && weekdayIndex <= 5;
  return isWeekday && minutesNow >= 7 * 60 && minutesNow < 15 * 60 + 30;
}

document.querySelectorAll('.business-hours-badge').forEach(el => {
  el.style.display = isDetedeOpenNow() ? 'flex' : 'none';
});

// Smart Home ukázka (jen index.html) — telefon (Home-style dlaždice) ovládá
// motorizované stínění. Poloha 0–100 % je jediný zdroj pravdy pro závěsy,
// světlo v místnosti i displej. Táhni/ťukni na dlaždici, nebo šipky na klávesnici.
(function () {
  const room = document.getElementById('shRoom');
  if (!room) return;
  const L = document.getElementById('shDrapeL');
  const R = document.getElementById('shDrapeR');
  const glow = document.getElementById('shGlow');
  const tile = document.getElementById('shTile');
  const fill = document.getElementById('shFill');
  const pctEl = document.getElementById('shPct');
  const stateEl = document.getElementById('shState');
  let open = 60, dragging = false;

  function render() {
    open = Math.max(0, Math.min(100, Math.round(open)));
    var k = 1 - 0.84 * (open / 100);
    L.style.transform = 'scaleX(' + k + ')';
    R.style.transform = 'scaleX(' + k + ')';
    glow.style.opacity = (open / 100 * 0.7).toFixed(2);
    fill.style.height = (100 - open) + '%';
    pctEl.textContent = open;
    stateEl.textContent = open === 0 ? 'Zataženo' : open === 100 ? 'Otevřeno' : 'Otevřeno';
    tile.setAttribute('aria-valuenow', open);
  }
  function setFromY(clientY) {
    const r = tile.getBoundingClientRect();
    const closed = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    open = (1 - closed) * 100;
    render();
  }

  tile.addEventListener('pointerdown', e => { dragging = true; try { tile.setPointerCapture(e.pointerId); } catch (_) {} setFromY(e.clientY); });
  tile.addEventListener('pointermove', e => { if (dragging) setFromY(e.clientY); });
  tile.addEventListener('pointerup', () => { dragging = false; });
  tile.addEventListener('pointercancel', () => { dragging = false; });
  tile.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { open += 5; render(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { open -= 5; render(); e.preventDefault(); }
    else if (e.key === 'Home') { open = 0; render(); e.preventDefault(); }
    else if (e.key === 'End') { open = 100; render(); e.preventDefault(); }
  });

  render();
})();

// Smart Home „Váš den“ (jen index.html) — časová osa 4 automatizací. Každý okamžik
// nastaví nebe, slunce/měsíc, polohu závěsů, telefon (hodiny, notifikace, zvýrazněná
// automatizace) i popisek. Sám se přehrává, jen když je sekce vidět; klik na čas
// přehrávání na chvíli pozastaví.
(function () {
  const root = document.getElementById('sdDay');
  if (!root) return;
  const MOMENTS = [
    { time: '6:30',  h: 6.5,  icon: 'fa-sun',        name: 'Dobré ráno',        open: 100, sky: 0, orb: [20, 64],
      text: 'Závěsy se pomalu roztáhnou. Budí vás denní světlo, ne budík.',
      notif: 'Závěsy se otevírají.' },
    { time: '13:00', h: 13,   icon: 'fa-temperature-half', name: 'Polední slunce', open: 50, sky: 1, orb: [52, 22],
      text: 'Když slunce praží nejvíc, závěsy se zatáhnou napůl. Uvnitř zůstane příjemný chládek a nábytek nevybledne.',
      notif: 'Stínění na 50 % proti slunci.' },
    { time: '19:30', h: 19.5, icon: 'fa-house-lock', name: 'Večerní soukromí',   open: 0, sky: 2, orb: [80, 70],
      text: 'S prvním šerem se závěsy zavřou. Rozsvítíte a nikdo z ulice vám neuvidí do obýváku.',
      notif: 'Závěsy se zavírají. Užijte si večer.' },
    { time: '23:00', h: 23,   icon: 'fa-moon',       name: 'Dobrou noc',        open: 0, sky: 3, orb: [70, 26], night: true,
      text: 'Před spaním vše zkontroluje za vás. Všechna okna v domě jsou zatažená, nemusíte vstávat z postele.',
      notif: 'Všechna okna jsou zatažená. Dobrou noc.' }
  ];

  const $ = id => document.getElementById(id);
  const scene = $('sdScene'), orb = $('sdOrb'), L = $('sdDrapeL'), R = $('sdDrapeR');
  const dim = $('sdDim'), lamp = $('sdLamp'), list = $('sdList'), track = $('sdTrack');
  const skies = root.querySelectorAll('.sd-sky');
  const caption = root.querySelector('.sd-caption');
  const notif = $('sdNotif');

  list.innerHTML = MOMENTS.map(m =>
    '<li class="sd-item"><span class="sd-item-icon"><i class="fa-solid ' + m.icon + '"></i></span>' +
    '<span class="sd-item-main"><span class="sd-item-time" style="display:block">' + m.time + '</span>' +
    '<span class="sd-item-name" style="display:block">' + m.name + '</span></span><span class="sd-toggle" aria-hidden="true"></span></li>'
  ).join('');
  const items = list.querySelectorAll('.sd-item');

  // časová osa: pozice podle hodin (osa 5:00–24:00)
  const pos = h => ((h - 5) / 19) * 100;
  MOMENTS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sd-stop'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', m.time + ' ' + m.name);
    b.style.left = pos(m.h) + '%';
    b.innerHTML = '<span class="sd-dot"><i class="fa-solid ' + m.icon + '"></i></span><span class="sd-stop-label">' + m.time + '</span>';
    b.addEventListener('click', () => { go(i); pause(); });
    track.appendChild(b);
  });
  const stops = track.querySelectorAll('.sd-stop');

  let cur = -1, notifTimer, visible = false, seen = false;
  function go(i) {
    if (i === cur) return;
    cur = i;
    const m = MOMENTS[i];
    skies.forEach((s, k) => s.classList.toggle('is-on', k === m.sky));
    scene.classList.toggle('is-night', !!m.night);
    orb.style.left = m.orb[0] + '%'; orb.style.top = m.orb[1] + '%';
    const k = 1 - 0.84 * (m.open / 100);
    L.style.transform = R.style.transform = 'scaleX(' + k + ')';
    dim.style.opacity = m.sky === 3 ? 0.55 : m.sky === 2 ? 0.2 : 0;
    lamp.style.opacity = m.sky >= 2 ? 1 : 0;
    $('sdTime').textContent = $('sdClock').textContent = m.time;
    $('sdPct').textContent = m.open;
    $('sdState').textContent = m.open === 0 ? 'Zataženo' : m.open === 100 ? 'Otevřeno' : 'Přivřeno';
    $('sdCapTitle').textContent = m.name;
    $('sdCapText').textContent = m.text;
    caption.classList.remove('is-swap'); void caption.offsetWidth; caption.classList.add('is-swap');
    $('sdLineFill').style.width = pos(m.h) + '%';
    items.forEach((el, k) => el.classList.toggle('is-active', k === i));
    stops.forEach((el, k) => {
      el.classList.toggle('is-active', k === i);
      el.classList.toggle('is-past', k < i);
      el.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    if (visible) showNotif(m);
  }
  // notifikace: vyjede, chvíli zůstane, zajede
  function showNotif(m) {
    notif.classList.remove('is-in');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
      $('sdNotifTitle').textContent = m.name;
      $('sdNotifBody').textContent = m.notif;
      notif.classList.add('is-in');
      notifTimer = setTimeout(() => notif.classList.remove('is-in'), 3200);
    }, 450);
  }

  // automatické přehrávání jen ve viditelné oblasti
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null, pausedUntil = 0;
  function tick() { if (Date.now() >= pausedUntil) go((cur + 1) % MOMENTS.length); }
  function start() { if (!timer && !reduce) timer = setInterval(tick, 5200); }
  function stop() { clearInterval(timer); timer = null; }
  function pause() { pausedUntil = Date.now() + 15000; }
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting;
    if (visible) { if (!seen) { seen = true; showNotif(MOMENTS[cur]); } start(); } else stop();
  }), { threshold: 0.3 }).observe(scene);
  go(0);
})();
