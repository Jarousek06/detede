# Jak přegenerovat CSS (Tailwind)

Web už **nepoužívá** Tailwind z CDN (který se kompiloval v prohlížeči).
Místo toho má hotový statický soubor `assets/css/tailwind.css`.

## Kdy je potřeba přegenerovat
Jen když v HTML **přidáš nebo změníš Tailwind třídy** (např. `flex`, `grid-cols-3`,
`text-[13px]`, `md:hidden` …). Když měníš jen texty, obrázky nebo obsah, nic dělat nemusíš.

## Postup (jednorázově je potřeba Node.js)
V této složce (`detede`) spusť:

```bash
npm install tailwindcss@4 @tailwindcss/cli@4
npx @tailwindcss/cli@4 -i assets/css/tailwind.src.css -o assets/css/tailwind.css --minify
```

Tím se `assets/css/tailwind.css` znovu vytvoří podle aktuálních tříd ve všech `*.html`.

## Co se NEnahrává na web
Při nasazení (např. Netlík Drop) nemusíš řešit — ale klidně můžeš smazat, jsou to jen
vývojové soubory:
- `node_modules/` (vytvoří se při `npm install`)
- `package.json`, `package-lock.json`
- `assets/css/tailwind.src.css`
- tento návod

Naopak **musí** zůstat: `assets/css/tailwind.css` a `assets/css/styles.css`.
