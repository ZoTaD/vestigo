# Fórmulas del modding de Warframe — casos de prueba (27/10/2026)

Fuentes leídas: wiki oficial (wiki.warframe.com), notas de parche oficiales
(warframe.com/patch-notes), guía oficial de mods (warframe.com/news/mods-guide)
y el Public Export bajado en `games/warframe/raw/` (27/10). Todas las fórmulas de
abajo se probaron en Python contra los números **publicados** por la fuente:
53/53 casos de armas, Warframes y drenaje coinciden, y 40/40 extremos de Riven.
Script: `C:/Users/Zotad/AppData/Local/Temp/claude/C--Users-Zotad-Desktop-vestigo--claude-worktrees-warframe-etapa-3-f06981/8b8f2260-e668-404a-aa1d-7bed46cd1dec/scratchpad/tests.py`
(y `riven.py` en la misma carpeta).

Convención: "bonus" = suma de los % de todos los mods de esa stat, en decimal.
Redondeo "mitad hacia arriba" = `floor(x + 0.5)` (en JS, `Math.round` hace eso
para positivos).

---

## 0. Regla general (vale para casi todo)

`Stat modificada = Base × (1 + Σ bonus aditivos) + Σ bonus planos`

- Fuente: https://wiki.warframe.com/w/Calculating_Bonuses — "Resultant Stat Value=Base Stat Value×(1+Additive Stat Bonus 1+…)".
- Mods de la misma stat se **suman** (Serration + Heavy Caliber = +330 %, ×4,3).
  Mods de distinta categoría (facción, headshot) **multiplican** — no aplican en el Arsenal salvo facción.

---

## 1. Armas

### 1.1 Daño base modificado (Serration, Hornet Strike, Heavy Caliber…)

`baseMod = base × (1 + Σ%daño)` — se aplica a **todos** los tipos (físicos y elementales innatos).

### 1.2 Daño físico (Impacto/Perforación/Corte)

`físico_X = base_X × (1 + Σ%daño) × (1 + Σ%X)` — el mod de físico sólo multiplica la
porción de ese tipo; si el arma no tiene ese tipo, no suma nada (Amprex + Fanged Fusillade = 0).
Fuente: https://wiki.warframe.com/w/Damage — "the percent distribution of the matching damage type".

### 1.3 Elementos

`elemento = baseModTotal × Σ%elemento` — sobre el daño **total** modificado
(todos los tipos), no sobre un tipo. Fuente: Damage/Calculation — "Elemental bonuses calculate using the full base damage".

### 1.4 Combinación de elementos

- Orden: casillas de arriba-izquierda a abajo-derecha; "from closest to top left (first to be considered) to the bottom right (last to be considered)" (https://wiki.warframe.com/w/Damage).
- Se combinan de a pares en ese orden; un elemento repetido queda en la posición del **primero** que aparece.
- Elementos innatos del arma van **al final**, salvo que haya un mod del mismo elemento: entonces toma la posición de ese mod ("Stormbringer in the top-left slot of an Amprex will change the position of its innate Electricity…").
- Un primario que queda suelto al final queda solo (no se combina).
- Elementos secundarios innatos (Ogris/Penta Explosivo, Stug Corrosivo, Detron/Nukor Radiación) quedan siempre y no se combinan con mods.
- Riven con dos elementos: "Priority goes to the last elemental stat listed".
- Kuva/Tenet con dos elementos innatos: orden Calor > Frío > Electricidad > Toxina; el primero va anteúltimo y el otro último.
- Pares: Frío+Calor = **Explosivo**; Electricidad+Calor = **Radiación**; Calor+Toxina = **Gas**; Frío+Electricidad = **Magnético**; Frío+Toxina = **Viral**; Electricidad+Toxina = **Corrosivo**.

### 1.5 Multidisparo

`proyectiles = multishotBase × (1 + Σ%multi)`; la parte fraccionaria es la probabilidad de un proyectil más.
El daño que muestra la UI es el de **todos** los proyectiles: `daño mostrado = daño por proyectil × multishot`.
Fuente: https://wiki.warframe.com/w/Multishot — "Total Projectiles = Weapon Projectile Count × (1 + Multishot Modifier)".
Ojo con el export: `totalDamage`/`damagePerShot` son **por proyectil** (Hek: export 75, la wiki muestra "525 … 7 (75.00 damage per projectile)").

### 1.6 Crítico

`CC = ccBase × (1 + Σ%cc) + Σplanos`; `CD = cdBase × (1 + Σ%cd) + Σplanos`.
Fuente: https://wiki.warframe.com/w/Critical_Hit. Crítico >100 % = naranja (×2 del daño añadido), >200 % = rojo.
Daño medio: `Total × (1 + CC × (CD − 1))` (Damage/Calculation).

### 1.7 Estado

`SC = scBase × (1 + Σ%sc)`. El Arsenal muestra la probabilidad **por proyectil** ("the probability that each pellet will individually proc", https://wiki.warframe.com/w/Status_Chance; Update 27.2). **No** se multiplica por multidisparo en lo mostrado.
En el export la escopeta ya trae el valor por perdigón (Hek `procChance` 0,10714 → wiki "10.70%"; diferencia de redondeo de la wiki, no la verifiqué).

### 1.8 Cadencia

`FR = frBase × (1 + Σ%fr)` (regla general + "Speed Trigger + Shred = +90%", Calculating Bonuses).
Arcos: los mods de cadencia valen **×2** — texto del propio mod en el export ("+60% Fire Rate (x2 for Bows)") y tabla de https://wiki.warframe.com/w/Speed_Trigger (rango 5: rifle +60 %, arco +120 %).
Topes: semiautomáticas 10 disparos/s; cadencia mínima 0,05/s; carga ≤ 10× la base (https://wiki.warframe.com/w/Fire_Rate).

### 1.9 Cargador

`mag = redondeo_al_más_cercano(magBase × (1 + Σ%) ) + planos`. https://wiki.warframe.com/w/Magazine_Warp — "rounded to the nearest whole number"; Braton 45 × 1,3 = 58,5 → **59** (mitad hacia arriba).

### 1.10 Recarga

`tiempo = recargaBase / (1 + Σ%velocidadRecarga)`. https://wiki.warframe.com/w/Reload_Speed — "Total Reload Time = Weapon Reload Time ÷ (1 + Reload Speed Bonus)".

### 1.11 Lo que muestra el Arsenal

Daño mostrado = `Base × [1 + Σ%elem + dist_Imp×%Imp + dist_Perf×%Perf + dist_Corte×%Corte] × (1 + Σ%daño) × [msBase × (1 + Σ%ms)]` — "average non-crit damage per shot, without Faction Damage Bonus" (Damage/Calculation).
En combate el juego **cuantiza** cada tipo a 1/32 del daño base modificado (ver Nagantaka). El Arsenal no la usa según esa fórmula.
**NO VERIFICADA** (búsqueda del 29/10 sin resultado): cantidad de decimales que muestra el Arsenal en cada stat; lo único publicado es 76,85 → 76,9. Sugerencia: mostrar 1 decimal en % y 2 en multiplicadores, sin prometer que coincide con el juego.

### Casos de prueba — armas

| Entrada | Esperado | Fuente |
|---|---|---|
| base 18, Serration r9 (+150 %) | 45 | wiki/Serration ("18 × 2.5") |
| Karak 29 + Serration (+165 %) | 76,85 (UI 76,9) | wiki/Calculating_Bonuses |
| Karak 29 + Serration + Hellfire (+90 %) | calor 69,165; total 146,015 | wiki/Calculating_Bonuses |
| Reconifex 40 base, 60 % Perf., Piercing Hit (+90 %) | +21,6 Perf. | wiki/Damage |
| Karak Corte 7,3 + Fanged Fusillade (+120 %) | Corte 16,06; total 37,76 | wiki/Calculating_Bonuses |
| Nagantaka Prime (I 1,73 / P 15,57 / C 155,7) + Cryo Rounds 90, Malignant Force 60 Tox, Hellfire 90, Piercing Caliber 120 Perf, Valence Formation 200 Gas | Viral 259,5; Calor 156,78125; Gas 346; P 32,4375; C 156,78125; total **951,5** (muestra 952) | wiki/Damage/Calculation |
| base 100 (I30/P30/C40), cuantización | C 40,625; Maim (+120 %) → 87,5 | wiki/Damage/Calculation |
| Prova (Electricidad innata) + Frío, Toxina, Calor en casillas 1-3 | Viral + Radiación | wiki/Damage |
| Amprex (Elec. innata) + Hellfire + Cryo Rounds | Explosivo + Electricidad; sólo Hellfire → Radiación | wiki/Calculating_Bonuses |
| Braton CC 12 % + Point Strike 150 + Argon Scope 135 | 46,2 % | wiki/Critical_Hit |
| Braton CC 12 % + Point Strike + Arcane Avenger (+45 plano) | 75 % | wiki/Critical_Hit |
| Braton CD 1,6 + Vital Sense 120 + Bladed Rounds 120 | 5,44× | wiki/Critical_Hit |
| Braton CD 1,6 + Vital Sense + Tenacious Bond (+1,2 plano) | 4,72× | wiki/Critical_Hit |
| Gram CC 15 % + True Steel 120 + Blood Rush 40×(7−1) | 69 % | wiki/Critical_Hit |
| Lex multi 1 + 180 % | 2,8 | wiki/Multishot |
| Hek multi 7 + Hell's Chamber 120 % | 15,4 | wiki/Multishot |
| Karak 29 + Split Chamber 90 % | 55,1 medio por disparo | wiki/Calculating_Bonuses |
| Hek: 75 por perdigón × 7 | 525 | wiki/Hek |
| Snipetron SC 12 % + Rifle Aptitude 90 + Hammer Shot 80 | 32,4 % | wiki/Rifle_Aptitude |
| Speed Trigger r5 en arco | +120 % | wiki/Speed_Trigger + export |
| Speed Trigger + Shred | +90 % cadencia | wiki/Calculating_Bonuses |
| Braton cargador 45 + Magazine Warp 30 % | 59 | wiki/Magazine_Warp |
| Braton recarga 2,0 + Fast Hands 30 % | ≈1,54 s (1,5385) | wiki/Reload_Speed |
| Braton recarga 2,0 + Tainted Mag −30 % | ≈2,85 s (exacto 2,857; la wiki trunca) | wiki/Reload_Speed |

---

## 2. Warframes

### 2.1 Salud, escudo, energía y armadura por rango (regla vigente)

**Update 34.0 (18/10/2023)** — https://www.warframe.com/patch-notes/pc/34-0-0:
"Health, Shield, Energy, and Armor Mods apply to the stats of Warframes at their current rank."
Se bajó a la mitad lo que gana por rango y se pasó a la base; Vitality y Redirection pasaron de +440 % a +100 %, Flow de +150 % a +100 %.

Regla general a rango 30 (https://wiki.warframe.com/w/Warframes):
- Salud +10 cada 3 rangos desde el 1 → **+100**
- Escudo +10 cada 3 rangos desde el 2 → **+100**
- Energía +5 cada 3 rangos desde el 3 → **+50**
- Armadura **no cambia** (salvo excepciones).

Excepciones a rango 30 (salud / escudo / armadura / energía), tabla "Rank Up Exceptions" de la wiki:
Baruuk, Baruuk P., Chroma P., Garuda, Garuda P., Koumei, Narin, Saryn P., Volt P., Wisp, Wisp P., Yareli, Yareli P.: 100/100/0/100 ·
Dante, Xaku, Xaku P.: 90/90/0/70 · Grendel, Grendel P., Inaros, Inaros P.: 200/0/0/50 ·
Hildryn, Hildryn P.: 100/500/0/0 · Kullervo: 200/0/100/50 · Lavos, Lavos P.: 200/100/100/0 ·
Nezha, Nezha P., Valkyr, Valkyr P.: 100/50/0/50 · Nidus, Nidus P.: 100/0/100/50 (+15 % fuerza, +15 salud/s).
(La tabla la reproduje con el extractor web; antes de cargarla al sitio conviene releerla en la página.)

El export trae los valores de **rango 0** (Excalibur 270/270/240/100 coincide con la wiki).
Con mods: `stat = (base0 + ganancia30) × (1 + Σ%) + planos`.

### 2.2 Habilidades

- Fuerza, duración, rango y eficiencia: `100 % + Σ%` (aditivos). https://wiki.warframe.com/w/Ability_Duration — "Modifiers combine additively".
- Coste: `coste = base × max(2 − eficiencia, 0,25)`; el Arsenal muestra la eficiencia entre 25 % y **175 %** (https://wiki.warframe.com/w/Ability_Efficiency).
- Canalizadas: `drenaje/s = base × (2 − E) / D`, con E **sin tope**, limitado a [0,25 ; 1,75] × base.
- **Sin mínimo propio (29/10)**: ni Ability_Duration, Ability_Range ni Ability_Strength fijan un piso; el único es el de dos cascos Arcane viejos ("Can not be reduced below 11%"). Los 12,5 % y 34 % que circulan son la suma de mods negativos (100 − 60 Fleeting Expertise − 27,5 Transient Fortitude; 100 − 66 Narrow Minded). Regla: `100 % + Σ%`, sin tope.

### Casos de prueba — Warframes

| Entrada | Esperado | Fuente |
|---|---|---|
| Excalibur r0 salud 270 → r30 | 370 | wiki/Excalibur ("270 (370 at Rank 30)"), nota 34.0 |
| Excalibur r0 energía 100 → r30 | 150 | wiki/Excalibur |
| Rhino escudo 455 → r30 | 555; armadura 240 sin cambio | wiki/Rhino |
| Wisp energía 200 → r30 (excepción) | 300; escudo 180 → 280 | wiki/Wisp |
| Inaros salud 2110 → r30 (excepción) | 2310; escudo 0 | wiki/Inaros |
| Excalibur r30 370 + Vitality (+100 %) | 740 | nota de parche 34.0 |
| Habilidad de 25 energía + Streamline (+30 %) | 17,5 | wiki/Ability_Efficiency |
| Canalizada 10/s, duración 140 %, eficiencia 130 % | 5/s | wiki/Ability_Efficiency |
| Blind Rage + Streamline (ef. 75 %) | coste 125 % | wiki/Ability_Duration |
| Blind Rage + Fleeting Expertise (canalizada) | 237,5 % → tope 175 % | wiki/Ability_Duration |
| Blind Rage + Continuity (canalizada) | ≈119,2 % | wiki/Ability_Duration |

---

## 3. Capacidad y drenaje

- **Capacidad** = rango del ítem (30; 40 en algunos), ×2 con potenciador/catalizador Orokin ("doubles the available Mod capacity", https://wiki.warframe.com/w/Mod_Capacity; guía oficial: "permanently double an item's Mod Capacity").
- **Capacidad mínima** (Update 38.5): 15 + 1 cada 2 rangos de maestría (+1 por rango legendario). MR6 → 18, MR4 → 17. Nota 38.5 (https://www.warframe.com/patch-notes/pc/38-5-0): "Increased base Capacity on Unranked items from 0 to 15"; la wiki dice que "adds mod points onto items that are a lower rank than a player's current Mastery Rank", o sea `max(rango, mínimo)`. **NO VERIFICADO** (29/10): si el potenciador la duplica; la regla vieja (Hotfix 18.13.2) sí la duplicaba.
- **Drenaje de un mod** = `baseDrain + rango`. Verificado con las tablas de la wiki: Serration 4 → 14 en r10; Split Chamber 10 → 15 en r5; Magazine Warp 4 → 9; Speed Trigger 4 → 9 (todas coinciden con el `baseDrain` del export).
- **Polaridad igual**: `ceil(drenaje / 2)` — "reduces drain by half, rounded up … Serration costs 14 … Madurai … 7" (Mod Capacity); guía oficial: "50 percent (rounded up)".
- **Polaridad distinta**: `drenaje × 1,25` **redondeado al más cercano** — la wiki da las bandas "drain of 0-1 will increase by 0, drain of 2-5 by 1, 6-9 by 2, 10-13 by 3, 14-16 by 4". Eso es `floor(d×1,25+0,5)`, **no** `ceil`. Conflicto: la página Polarity dice "rounded up" y la guía oficial no dice. Sólo cambia en drenajes 5, 9, 13, 17 (13 → 16 con redondeo, 17 con ceil). Recomiendo redondeo; el caso 13 queda **NO VERIFICADO** contra el juego (búsqueda del 29/10: ningún ejemplo publicado con drenaje 5, 9, 13 o 17).
- **Aura / stance (suman capacidad)**: igual polaridad = **×2**; sin polaridad = ×1; distinta = **`floor(0,8 × valor)`**. Guía oficial: "mismatching it will only provide an 80 percent bonus (rounded down)"; https://wiki.warframe.com/w/Aura_Mod: "a drain of 5 generates a capacity of 4, a drain of 9 generates a capacity of 7". (La página Mod Capacity dice "−25 %, redondeado"; la descarto frente a la guía oficial.) El export trae el aura con `baseDrain` negativo: valor del aura = `−baseDrain + rango` (Steel Charge −4 + 5 = 9; Corrosive Projection −2 + 5 = 7) — **verificado el 29/10**: wiki/Steel_Charge da −4 a rango 0 y −9 a rango 5; wiki/Corrosive_Projection, −2 y −7.
- **Omni Forma (Update 38.5)**: la casilla universal "will halve the capacity of any Mod equipped in it (excluding Umbra Polarities)".
- **Umbra**: sólo se aplica con Umbra Forma. **NO VERIFICADA** (búsqueda del 29/10 sin resultado) la interacción de casilla Umbra con mods Madurai/Vazarin/Naramon y de mods Umbra en otras casillas (ninguna página lo dice). No mostrar descuento ahí.
- **Exilus**: una casilla más (adaptador Exilus); drena capacidad como cualquier otra. Sin regla especial de drenaje encontrada.

### Casos de prueba — drenaje

| Entrada | Esperado | Fuente |
|---|---|---|
| Serration r10 sin polaridad | 14 | wiki/Serration, wiki/Mod_Capacity |
| Serration r10 en Madurai | 7 | wiki/Mod_Capacity |
| Intensify r5 (6+5 = 11) polaridad distinta | 14 | thegamer.com (guía) + bandas de la wiki |
| drenaje 14 polaridad distinta | 18 (+4) | bandas wiki/Mod_Capacity |
| drenaje 2 / 5 / 6 / 9 / 10 / 13 / 16 distinta | +1 / +1 / +2 / +2 / +3 / +3 / +4 | wiki/Mod_Capacity |
| aura de 5 en igual polaridad | +10 | wiki/Aura_Mod |
| aura de 5 / 9 en polaridad distinta | +4 / +7 | wiki/Aura_Mod, guía oficial |
| Split Chamber r5 | 15 | wiki/Split_Chamber |
| capacidad mínima MR6 / MR4 | 18 / 17 | wiki/Mod_Capacity |

Ojo export: hay varios mods con el mismo `name` (Flawed, versiones de 3, 5 o 10 rangos: Serration con `fusionLimit` 3, 5 y 10). Elegir siempre por `uniqueName`.

---

## 4. Rivens

### 4.1 Fórmula (verificada)

`v = value × 10 × (rango + 1) × D × L × W`; mostrado = `100 × v` %.
Fuente: https://wiki.warframe.com/w/Riven_Mods — "v = b × 10 × (r + 1) × D × L × W".
Es lo mismo que proponías: `value × 100 × 90 × D × L × (rango+1)/9` (a rango 8, (r+1) = 9).
- `value` = el del export (`upgradeEntries[].upgradeValues[].value`).
- Rango 0–8.
- `W` = 0,9 a 1,1 (la tirada; "randomly chosen between 90% and 110%").
- Excepciones de presentación: Eficiencia de munición y Combo usan −100v %; daño a facción se muestra como ×(1 + v). El retroceso tiene `value` negativo en el export.

| Configuración | L positivo | L negativo |
|---|---|---|
| 2 positivos | 0,99 | — |
| 2 positivos + negativo | 1,2375 | −0,495 |
| 3 positivos | 0,75 | — |
| 3 positivos + negativo | 0,9375 | −0,75 |

(Coinciden con tus multiplicadores.)

### 4.2 Disposición: YA NO EXISTE (cambió hace 5 días)

**Hotfix 44.1.3 (22/10/2026)** — https://www.warframe.com/patch-notes/pc/44-1-3: "Removed Riven Dispositions." / "All Rivens now use the same multiplier for their possible value ranges, the equivalent of 1.2 Disposition in the old system."
→ **D = 1,2 fijo para todas las armas.** El export bajado ya lo refleja: `omegaAttenuation` es 1,2 en las 676 armas con Riven; 1 sólo en 155 ítems de `Pistols` que son antígenos/mutágenos de kitgun, Sirocco y un amp, y 0,5 en melés de Archwing + Ironbride (sin Riven).
Rangos viejos de los puntos (para historia, ya no se usan; https://wiki.warframe.com/w/Riven_Disposition): 1 punto 0,5–0,69; 2 puntos 0,7–0,89; 3 puntos 0,9–1,1; 4 puntos 1,11–1,3; 5 puntos 1,31–1,55. Todas las armas quedaron en ●●●●○.
Consecuencia: cualquier Riven publicado antes del 22/10 (semlar, foros) tiene otra disposición; no sirve como caso de prueba salvo que fuera 1,2.

### Casos de prueba — Rivens (rango 8, rifle, D = 1,2; min = W 0,9 / max = W 1,1)

Todos coinciden (40/40) con las tablas de la wiki:

| Stat (value del export) | Config. | Esperado positivo | Esperado negativo |
|---|---|---|---|
| Crítico 0,016666 | 2+0 | 160,37 % – 196,01 % | — |
| Crítico | 2+1 | 200,46 % – 245,01 % | −80,18 % – −98,00 % |
| Crítico | 3+0 | 121,49 % – 148,49 % | — |
| Crítico | 3+1 | 151,86 % – 185,61 % | −121,49 % – −148,49 % |
| Daño 0,0183333 | 2+0 | 176,42 % – 215,62 % | — |
| Daño | 2+1 | 220,52 % – 269,53 % | −88,21 % – −107,81 % |
| Daño | 3+0 | 133,65 % – 163,35 % | — |
| Daño | 3+1 | 167,06 % – 204,19 % | −133,65 % – −163,35 % |
| Multidisparo 0,01 (= Estado) | 2+0 | 96,23 % – 117,61 % | — |
| Multidisparo | 2+1 | 120,29 % – 147,02 % | −48,11 % – −58,81 % |
| Multidisparo | 3+0 | 72,90 % – 89,10 % | — |
| Multidisparo | 3+1 | 91,13 % – 111,38 % | −72,90 % – −89,10 % |
| Munición máx. 0,00555 | 3+1 | 50,57 % – 61,81 % | −40,46 % – −49,45 % |

Fuente: https://wiki.warframe.com/w/Riven_Mods (tablas "Normal Attributes"). Los extremos de la wiki salen de la misma fórmula, así que confirman la fórmula y los `value`, no una tirada real. No busqué Rivens individuales en semlar porque son anteriores al 22/10.
**Rango 0 verificado (29/10)**: un Riven publicado da 99,3 % / 139,4 % al máximo y 11 % / 15,5 % a rango 0, o sea 1/9 (https://steamcommunity.com/app/230410/discussions/1/2906376154313687377). Rangos 1–7 sin ejemplo, coherentes con (r+1).

---

## 5. Resumen de qué mostrar y qué no

Verificado y listo para tests: daño base, físicos, elementos y su combinación, cuantización de Nagantaka, multidisparo, crítico, estado (por perdigón), cadencia (+ ×2 arco), cargador (redondeo al más cercano), recarga, stats de Warframe a rango 30 (regla 34.0 + excepciones), eficiencia y su tope, drenaje base + rango, polaridad igual (ceil /2), aura (×2 / ×1 / floor ×0,8), capacidad ×2, Rivens con D = 1,2.

Verificado el 29/10: auras desde el `baseDrain` negativo del export, Rivens a rango 0, sin mínimos de duración/rango/fuerza, capacidad mínima como `max(rango, mínimo)`.

NO VERIFICADO tras buscar en internet el 29/10 (no mostrar como regla firme; sólo se cierra probándolo en el juego): redondeos del Arsenal, si el potenciador duplica la capacidad mínima, Umbra en casillas Madurai/Vazarin/Naramon, polaridad distinta en drenajes 5/9/13/17 (ceil o redondeo), Rivens a rangos 1–7.
