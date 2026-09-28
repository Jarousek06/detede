# Příprava katalogu pro napojení na PREMIER — Kolejnice

Cíl: až se zapne automatizace, web pošle do PREMIERu **přijatou objednávku** s řádky.
Každý řádek objednávky v PREMIERu potřebuje:

| Co PREMIER chce | Odkud to vezmeme |
|---|---|
| **kód položky** (skladová karta v PREMIERu) | z **mapy kódů** níže (sloupec „PREMIER kód") |
| **množství** | zadá zákazník na webu (délka v m, počet ks) |
| **MJ** (měrná jednotka) | z mapy kódů (m / ks) |
| **název** | z katalogu |
| cena | **doplní paní** (jedeme bez cen) |

**Jak to funguje:** katalog zůstává čistý (produkt + náš kód). Mapa kódů níže spojuje
**náš kód ↔ PREMIER kód**. Jakmile paní/šéf vyplní sloupec „PREMIER kód" a „MJ",
napojení už jen podle nich zakládá řádky. **Nic se nepřepisuje v katalogu.**

---

## Krok za krokem — co musíme udělat
- [ ] 1. **Doplnit modely** všech řad (N ✓, chybí **T, B, S, E, H**) — viz prázdné tabulky níže.
- [ ] 2. Ke každému modelu: **náš kód, název, rozměr (v×š), MJ** (kolejnice = m), **barvy**.
- [ ] 3. **Doplňky** (jezdci, držáky, koncovky) — náš kód + název + MJ (ks).
- [ ] 4. **Ovládání** jako položky (ruční / motor DT, DT Eco, DT Force) — MJ ks.
- [ ] 5. Vyplnit sloupec **„PREMIER kód"** z PREMIERu (to je ta část se šéfem).
- [ ] 6. (Fáze 2) zapojit API — už jen podle této mapy.

> Legenda MJ: **m** = na metry (kolejnice), **ks** = kusy (doplňky, motory).

---

## N line — HOTOVO (náš kód), čeká na PREMIER kód

### Kolejnice
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód | Sazba DPH |
|---|---|---|---|---|---|
| N1 | N1-Napoli | 16,5 × 16,5 mm | m | _______ | ___ |
| N2 | N2-Nolina | 10,4 × 16 mm | m | _______ | ___ |
| N3 | N3-Nola | 18,5 × 22,5 mm | m | _______ | ___ |

### Barvy / povrchy (varianta ke kolejnici)
| Kód | Název | PREMIER kód |
|---|---|---|
| 9016 | Bílá | _______ |
| 9005 | Černá | _______ |
| BN | Broušený nerez | _______ |
| BH | Broušený hliník | _______ |
| BB | Broušený bronz | _______ |

### Doplňky — jezdci a držáky
| Náš kód | Název | MJ | PREMIER kód |
|---|---|---|---|
| JS-01 | Jezdec standard | ks | _______ |
| JV-01 | Jezdec vyosený | ks | _______ |
| JN-01 | Jezdec nacvakávací s háčkem | ks | _______ |
| JT-01 | Jezdec s teflonem | ks | _______ |
| JT-02 | Jezdec s teflonem a háčkem | ks | _______ |
| JT-03 | Jezdec teflon vyjmutelný | ks | _______ |
| N1-02-BL | Plastový držák | ks | _______ |
| N1-03 | Kovový držák | ks | _______ |
| N3-03 | Kovový držák (N3) | ks | _______ |

### Ovládání (motory)
| Náš kód | Název | MJ | PREMIER kód |
|---|---|---|---|
| — | Ruční (bez motoru) | — | — |
| DT-100 | Motor DT | ks | _______ |
| DT-200 | Motor DT Eco | ks | _______ |
| DT-300 | Motor DT Force | ks | _______ |

---

## T line — K DOPLNĚNÍ
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód |
|---|---|---|---|---|
| T? | _______ | _______ | m | _______ |

*(Doplňky T line:)*
| Náš kód | Název | MJ | PREMIER kód |
|---|---|---|---|
| _______ | _______ | ks | _______ |

---

## B line — K DOPLNĚNÍ
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód |
|---|---|---|---|---|
| B? | _______ | _______ | m | _______ |

---

## S line — K DOPLNĚNÍ
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód |
|---|---|---|---|---|
| S? | _______ | _______ | m | _______ |

---

## E line — K DOPLNĚNÍ
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód |
|---|---|---|---|---|
| E? | _______ | _______ | m | _______ |

---

## H line — K DOPLNĚNÍ
| Náš kód | Název | Rozměr (v×š) | MJ | PREMIER kód |
|---|---|---|---|---|
| H? | _______ | _______ | m | _______ |
