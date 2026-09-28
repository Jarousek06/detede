# DETEDE — web

Statický B2B web (katalog kolejnic/motivů/pohonů). Styl přes Tailwind CLI
(bez CDN, bez bundleru pro JS) — CSS se pregeneruje předem a commitne jako
hotový soubor.

## Struktura

```
detede/
├── index.html, detail.html, motive.html, motor.html, drive.html, kolejnice.html
├── assets/css/tailwind.src.css   zdroj pro Tailwind CLI
├── assets/css/tailwind.css       vygenerovaný CSS (commitovaný, nasazuje se přímo)
├── assets/img/
├── package.json                  jen @tailwindcss/cli jako dev nástroj
└── JAK-PREGENEROVAT-CSS.md       přesný postup přegenerování stylu
```

## Lokální spuštění

```bash
python -m http.server 5183 --directory detede
```

Pak otevřít http://localhost:5183 (v `.claude/launch.json` konfigurace `detede`).

## Přegenerování CSS po úpravě tříd

Postup je popsaný v [`JAK-PREGENEROVAT-CSS.md`](JAK-PREGENEROVAT-CSS.md) — zkráceně:

```bash
npm install
npx @tailwindcss/cli -i assets/css/tailwind.src.css -o assets/css/tailwind.css --minify
```

## Nasazení

[Netlify Drop](https://app.netlify.com/drop) — přetáhnout celou složku `detede/`
(stačí, `tailwind.css` je už vygenerovaný, žádný build krok na Netlify není potřeba).
