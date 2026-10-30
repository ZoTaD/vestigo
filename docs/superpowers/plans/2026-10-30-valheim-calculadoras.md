# Valheim: calculadoras, Mi partida y extras — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Pasos con `- [ ]`.

**Goal:** las 8 herramientas del diseño, publicadas en vestigo.gg en 5 PRs.

**Architecture:** dos secciones nuevas de Valheim (`calculators`, `progress`) en `route.ts`, cada una un chunk propio
cargado con `lazy()` desde `Valheim.tsx`; la matemática en módulos puros con tests (`valheimCalc.ts`), la UI en
`site/src/valheimCalc/*.tsx`; datos nuevos (grupos de confort, modificadores exactos de daño de criaturas, habilidades)
desde el pipeline del juego instalado.

**Tech Stack:** Vite + React 18 + TS, vitest, Python (UnityPy) en `games/valheim/pipeline`.

**Spec:** `docs/superpowers/specs/2026-10-30-valheim-calculadoras-design.md`

## Global Constraints

- Textos en inglés y español en `valheimCopy.ts` (EN primero); la UI no explica de dónde salen los datos.
- `CLAUDE.md`: listas >150 filas con `LazyRows`; íconos de lista con `SettledImg`, tamaño fijo; datos por `import()`;
  JSON enteros; `npm run perf` con las páginas nuevas en `PAGES` antes de cada PR; ≤250 pedidos, ≤200 imágenes,
  ≤3.000 nodos.
- Estilo A de la maqueta: `.vh-frame`/`.vh-inset`/`.vh-plate`; sin bordes ni barras de color en tarjetas.
- Estado de cada calculadora en la dirección con parámetros cortos; `localStorage` siempre con try/catch.
- No tocar `games/valheim/pipeline/fixes.py`.
- Commits y PRs escuetos (título + 2–4 viñetas), en español.

## Review Focus

- Dirección con ids que ya no existen (`?a=Inexistente`) → se ignoran, la calculadora abre vacía, sin romper.
- Calidad mayor que `maxQuality` o habilidad fuera de 0–100 en la dirección → se recorta al rango.
- Criatura sin `attacks` o arma sin `damage` → no aparece en los buscadores de Combate.
- `localStorage` bloqueado (modo privado) → Mi partida funciona en la pestaña.
- `.fch` de versión vieja o corrupto → mensaje claro, no tilda nada a medias.

---

### Task 1: Rutas y cáscara de las secciones nuevas

**Files:** Modify `site/src/route.ts`, `site/src/Valheim.tsx`, `site/src/valheimCopy.ts`, `site/src/prerender.ts`,
`site/src/sitemap.ts`, `site/scripts/perf.mjs`; Create `site/src/valheimCalc/Calculators.tsx`,
`site/src/styles/valheim-calc.css`; Test `site/src/route.test.ts` (o el test de rutas existente).

**Interfaces — Produces:** `ValheimSection` suma `"calculators" | "progress"`; `CALC_TOOLS = ["food","combat","comfort","skills"] as const`,
`type CalcTool`; `/xx/valheim/calculators[/tool]`, `/xx/valheim/progress`; `route.detail` = herramienta.

- [ ] Test: `parseRoute("/en/valheim/calculators/combat")` → `{vhSection:"calculators", detail:"combat"}`; `routePath` ida y vuelta; `/en/valheim/progress`.
- [ ] Rutas, pestañas en la barra (antes de la Crónica), tarjetas en la portada, SEO (`v.calc.seo[tool]`, `v.prog.seo*`, WebApplication), sitemap (4 herramientas + progress), `PAGES`.
- [ ] `Calculators.tsx`: cabecera, cuatro tarjetas (`RouteLink` a cada herramienta, la activa clara), y la herramienta con `lazy()`.

### Task 2: Comidas (`valheimCalc.ts` + `FoodCalc.tsx`)

**Interfaces — Produces:** `foodValue(f:{hp,st,eitr,min}, tMin:number): {hp,st,eitr}` (`base·clamp01(rest/min)^0.3`);
`comboAt(foods, tMin): {hp, st, eitr}` con base 25/50/0; `canEatAgainAt(f) = f.min/2`; `bestCombo(foods, key:"hpst"|"eitr", maxTier:BiomeId): ItemRow[]`.

- [ ] Tests: base 45 → 41/37/30/23 a 75/50/25/10 % restante (redondeado); `comboAt([],0)` = 25/50/0; `bestCombo` devuelve 3 distintos y respeta el bioma.
- [ ] UI: 3 casillas + buscador (filtro bioma/foco, `SettledImg`, `LazyRows`), totales, curva SVG con tooltip, líneas de recomer, fichas de bioma "mejor combo"; estado `?a=&b=&c=`.

### Task 3: Comandos de spawn en las fichas

**Files:** Modify `ValheimDetail.tsx`, `ValheimGuide.tsx` (criaturas y jefes), `valheimCopy.ts`.
- [ ] Recuadro con `id` y `spawn <id> 1` (criaturas: `spawn <id> 1 1`), botón Copiar (`navigator.clipboard`, con fallback), línea `devcommands`. Piezas: sólo el `id`.
- [ ] Commit + PR 1 (Tasks 1–3), perf, vista previa, merge.

### Task 4: Datos nuevos del juego (una sola extracción)

**Files:** Modify `games/valheim/pipeline/extract.py`, `site.py`, `records.py` (si hace falta); Test `games/valheim/pipeline/tests/`.
- [ ] `building.json`: `comfortGroup` (nombre del enum: Fire, Bed, …; `null` = None) en piezas con confort.
- [ ] `creatures.json`/`bosses.json`: `mods: Record<tipo, "veryWeak"|"weak"|"slightlyWeak"|"slightlyResistant"|"resistant"|"veryResistant"|"immune">`.
- [ ] `skills.json` nuevo: `[{id, name:Txt, step}]` de `Skills.m_skills` (`m_increseStep`), con nombre localizado.
- [ ] Test: toda pieza con confort tiene clave `comfortGroup`; Troll `mods.pierce === "weak"`.

### Task 5: Combate (`CombatCalc.tsx`)

**Interfaces:** `skillRange(level): [min,max]`; `weaponDamage(row, q): Record<type,number>`; `applyMods(dmg, mods)`;
`applyArmor(dmg: Record<type,number>, ac): Record<type,number>` (total, proporcional); `armorAt(row,q)`; `blockAt(row,q,skill)`; `levelDamage(stars) = 1+0.5·stars`.
- [ ] Tests: `applyArmor({blunt:100},40)` → 60; `applyArmor({blunt:60},40)` → 22,5; `applyArmor({slash:50, fire:50},100)` → 25 cada uno; `skillRange(0)` [0,25;0,55]; `skillRange(100)` [0,85;1].
- [ ] UI tu daño + golpes que aguantás (tabla con `LazyRows`), dificultad, estrellas, escudo/parry. PR 2.

### Task 6: Confort y Habilidades

**Interfaces:** `comfortLevel(pieces:{comfort,group,id}[], shelter:boolean): number`; `restedSeconds(c) = 480+60·(c−1)`;
`xpForNext(n) = 0.5·floor(n+1)^1.5+0.5`; `xpBetween(a,b)`; `afterDeath(level, pct)`.
- [ ] Tests: sin techo → 1; techo + fogata(1, Fire) + hoguera(2, Fire) → 4; `restedSeconds(1)` 480; `xpForNext(99)` 500,5; `afterDeath(50,0.05)` 47,5.
- [ ] UI Confort (grupos, interruptor techo, "máximo de tu bioma") y Habilidades (habilidad, nivel, objetivo, muerte, tabla 1–100). PR 3.

### Task 7: Mi partida

**Files:** Create `site/src/valheimProgress/{Progress.tsx,tasks.ts,store.ts}`; Modify `valheimMap/saves/character.ts`, `contract.ts`.
**Interfaces:** `buildTasks(data): {biome, tasks:{id, kind:"gear"|"material"|"boss", ref}[]}[]`; `useProgress()` (localStorage `vestigo:valheim:progress`); `readPlayerData(fch): {known:Set<string>, trophies:Set<string>, skills:Record<string,number>}`.
- [ ] Tests: `buildTasks` da 6–8 tareas por bioma con jefe; `readPlayerData` sobre un `.fch` real (`VALHEIM_TEST_FCH`) devuelve recetas y habilidades.
- [ ] UI ruta B + "Leer mi personaje". PR 4.

### Task 8: Carrito y pines compartidos

- [ ] `ValheimList` (Construcción): botón "+" por fila con `addToPlan("piece:"+id)` y aviso fijo "N piezas · ver materiales".
- [ ] Mapa: `encodePins(pins): Promise<string>` / `decodePins(hash)` (deflate-raw + base64url); test ida y vuelta; botón Compartir, capa "Pines compartidos", tope ~8 KB con aviso. PR 5.

### Task 9: Cierre

- [ ] Cada PR: `npm test`, `npm run build`, `npm run perf` (Valheim), vista previa de Netlify, merge, y verificación en vivo.
