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
