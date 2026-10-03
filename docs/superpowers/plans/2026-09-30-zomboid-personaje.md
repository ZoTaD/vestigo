# Project Zomboid — Rasgos, Personaje, Habilidades y Moodles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuatro pestañas más de Project Zomboid, cada una conectada en la rama apenas funciona:
- **Rasgos** (`/rasgos`), con fichas de rasgos y de profesiones;
- **Personaje** (`/personaje`), el planificador sin 3D;
- **Habilidades** (`/habilidades`), con XP por nivel, libros, revistas y la calculadora;
- **Moodles** (`/moodles`).

**Architecture:**
- **Datos:** el extractor saca además del juego:
  - la tabla de XP por nivel de cada habilidad;
  - el multiplicador de XP de cada nivel de bonificación de profesión y rasgo;
  - el nivel inicial de Fuerza y Estado físico;
  - los medios grabados (VHS, CD y TV) que dan XP.
  - `site.py` arma las fichas de rasgos, profesiones, habilidades y moodles.
- **Pestañas:** usan el andamio (`TABS`, `PZ_TAB_FILES`, `PZ_PUBLISHED`, `preloadTab`, `virtual:pz-slugs-es/<sec>`, `seo.detail`) y el patrón de Objetos y Recetas: loaders en `site/src/zomboid/<tab>/data.ts`, lista y ficha, textos de cada pestaña en un módulo propio (`site/src/zomboid/<tab>/copy.ts`) para no pisarse en `zomboidCopy.ts`.
- **Planificador:** estado en la dirección (`?b=`), puro y testeable (`site/src/zomboid/planner/build.ts`).

**Tech Stack:** Python (extract.py, site.py), React 18 + Vite + TS, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md`. Patrón a copiar: `site/src/zomboid/items/*`, `site/src/zomboid/recipes/*`, `site/src/zomboid/ui.tsx`, `site/src/zomboid/store.ts`, `site/src/Zomboid.tsx` (`TABS`, `TAB_DATA`), `site/src/entry-server.tsx` (`preloadZomboid`).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. Nunca `git add -A`. `test/deadlock.test.ts` falla por una dependencia ajena.
- **Cada pestaña se conecta en la rama apenas funciona** (ZoTaD mira `http://localhost:5178`): `PZ_PUBLISHED`, `TABS`, `PZ_TAB_FILES`, precarga del prerender, y el link desde la portada de la libreta, en un commit aparte al final de su tarea.
- **Datos del juego:** tal cual, con el español de `ES_MX` (respaldo `ES`).
  - Lo que no está en el juego y escribimos nosotros (por ejemplo "cómo se saca" un moodle) va marcado en el código como texto propio, corto, en/es.
  - Nunca se copia de PZwiki (CC BY-NC-SA).
- **Reglas de la casa:**
  - sin bordes de color en tarjetas;
  - las palabras no se cortan (`wordFit` en los títulos);
  - sin scroll horizontal de la página en el celular;
  - en/es con voseo;
  - nada de "sacado de los archivos del juego";
  - toda ficha enlazada desde su lista;
  - el prerender nunca sale con "cargando…" (el build ya lo corta).
- Comentarios y commits en español rioplatense, explicando el porqué.

---

### Task 1: Los datos que faltan (XP, multiplicadores, medios grabados) y las fichas

**Files:**
- Modify: `games/zomboid/tools/extract.py`, `games/zomboid/tools/site.py`, `games/zomboid/README.md`
- Create: `games/zomboid/data/site/{traits,professions,skills,moodles}.json`, `games/zomboid/data/media.json`
- Create: `site/test/zomboidCharacterData.test.ts`

**Interfaces:**
- **`skills.json` (ampliado):** `{ "<Skill>": { en, es, cat: {en,es}, xp: [n1..n10], start?: number } }`.
  - `xp[i]` es la XP para pasar del nivel i al i+1.
  - `start` es el nivel inicial (Fuerza y Estado físico, 5).
  - Sale del juego (`PerkFactory` y afines en `projectzomboid.jar`, leído como ya se lee `Core`). Si no se puede leer, `SystemExit` con mensaje: nada de valores inventados.
- **Multiplicadores de bonificación:** `boostMultipliers: { "1": x, "2": y, "3": z }`, leídos del juego. Van a `skills.json` o a `meta.json`, lo que sea más claro, documentado.
- **`media.json`:** los VHS, CD y programas de TV que dan XP, `{ id, name: {en,es}, kind: "vhs"|"cd"|"tv", xp: { "<Skill>": n } }`, de `media/lua/shared/RecordedMedia` y sus textos (`Recorded_Media.json`). Si el formato no da XP por habilidad de forma clara, la tarea lo documenta y deja fuera lo dudoso.
- **`site/traits.json`:** `[{ id, en, es, desc: Loc, cost, positive, professionOnly, exclusive: Ref[], xpBoosts: {skill: Loc, lvl}[], recipes: Ref[], icon, grantedBy: Ref[] }]`. `grantedBy` son las profesiones que lo dan.
- **`site/professions.json`:** `[{ id, en, es, desc?: Loc, cost, xpBoosts, traits: Ref[], recipes: Ref[], icon, spawnTowns?: string[] }]`. `spawnTowns` sale de `data/map/spawns.json` si la profesión aparece ahí.
- **`site/skills.json`:** `[{ id, en, es, cat, xp, start?, books: { item: Ref, from, to, mult }[], magazines: Ref[], media: { en, es, kind, xp }[], traits: Ref[], professions: Ref[] }]`. `traits` y `professions` son los que dan bonificación en esa habilidad.
- **`site/moodles.json`:** `[{ id, en, es, icon, levels: { level, name: Loc, desc: Loc }[] }]`.
- **Ids:** los de `index.json` (slugs de ficha). Los `Ref` siguen la forma de Objetos y Recetas.

- [ ] **Step 1: Tests que fallan:**
  - todas las habilidades tienen 10 valores de `xp` crecientes;
  - Fuerza y Estado físico empiezan en 5;
  - los multiplicadores existen para 1, 2 y 3;
  - la profesión `burglar` (Ladrón) da Nimble, Sneak y Lightfoot 2 y el rasgo `burglar`, y ese rasgo tiene `grantedBy` Ladrón;
  - cada libro de habilidad aparece en su habilidad con `from`/`to`/`mult` iguales a su `skillBook`;
  - los 26 moodles tienen ícono y al menos un nivel;
  - los `Ref` apuntan a fichas existentes.
- [ ] **Step 2:** Implementar, correr el extractor y ver los tests en verde.
- [ ] **Step 3: Commit.**

---

### Task 2: La pestaña Rasgos (rasgos y profesiones)

**Files:**
- Create: `site/src/zomboid/traits/{data.ts, ZomboidTraits.tsx, TraitList.tsx, TraitFicha.tsx, ProfessionFicha.tsx, copy.ts}`, `site/src/styles/zomboid-traits.css`
- Create: `site/test/zomboidTraits.test.ts`

**Interfaces:**
- **Lista:**
  - texto propio;
  - dos hojas: **Profesiones**, con ícono, nombre, puntos y las habilidades que suben; **Rasgos**, separados en positivos (cuestan puntos) y negativos (dan puntos), cada uno con ícono, nombre, costo y una línea de qué hace;
  - buscador en/es;
  - todo `<a>`.
- **Ficha de rasgo:** la descripción del juego, el costo, "no se puede combinar con" (links), las habilidades que sube, las recetas que da (links a Recetas), las profesiones que lo traen y "sólo de profesión" si corresponde.
- **Ficha de profesión** (`/profesiones/<slug>`):
  - puntos, habilidades iniciales, rasgos gratis (links), recetas conocidas (links) y en qué pueblos puede aparecer;
  - botón "armar un personaje con esta profesión", que va a `/personaje?b=…` cuando exista la pestaña (antes, sin botón).
- **Solapa:** la de "Rasgos" queda marcada también en las fichas de profesión, y `professions` entra en `PZ_PUBLISHED` para que sus fichas vayan al sitemap. Si eso suma una página `/profesiones` de lista, que muestre la lista de profesiones, o que su canonical apunte a `/rasgos`: decidir y dejarlo explicado en un comentario.
- **Tests:** la lista tiene los 97 rasgos y las 25 profesiones como links; la ficha de Ladrón y la de Asustadizo en/es; los links cruzados.
- **Conectar** (commit aparte).

---

### Task 3: El Planificador de personaje (sin 3D)

**Files:**
- Create: `site/src/zomboid/planner/{build.ts, ZomboidPlanner.tsx, copy.ts}`, `site/src/styles/zomboid-planner.css`
- Create: `site/test/zomboidPlanner.test.ts`

**Interfaces:**
- **`build.ts`** (puro):
  - `type Build = { prof: string; traits: string[] }`;
  - `encode(b): string` y `decode(s): Build | null` (corto, estable, tolera ids desconocidos descartándolos);
  - `points(b)`: la suma que muestra el juego (profesión + rasgos, con el signo del juego);
  - `valid(b)`: puntos ≥ 0 y sin rasgos excluyentes juntos;
  - `skills(b)`: nivel inicial por habilidad (inicio + bonificaciones de profesión y rasgos, con el tope del juego) y su multiplicador de XP (de `boostMultipliers`);
  - `recipes(b)`: las que se saben al empezar.
  - Los rasgos que da la profesión vienen incluidos y no cuestan.
- **UI:**
  - elegir profesión (tarjetas con ícono);
  - agregar y sacar rasgos (positivos y negativos, con su costo);
  - los excluyentes se apagan con el motivo;
  - contador de puntos que se pone rojo (tinte, no borde) si es negativo;
  - hoja de resultado con las habilidades iniciales y su multiplicador, las recetas que sabés y un botón "copiar link";
  - la dirección `?b=` se actualiza.
- **Tests:**
  - ida y vuelta de `encode`/`decode`;
  - Ladrón más Sigiloso y Torpe da los puntos y niveles correctos (valores calculados a mano con los datos del juego);
  - dos rasgos excluyentes → `valid` false;
  - render SSR de `/personaje` con texto propio.
- **Conectar** (commit aparte). En la portada de la libreta, la herramienta "Planificador de personaje" deja de estar en "Pronto".

---

### Task 4: Habilidades y libros, con la calculadora

**Files:**
- Create: `site/src/zomboid/skills/{data.ts, ZomboidSkills.tsx, SkillFicha.tsx, calc.ts, copy.ts}`, `site/src/styles/zomboid-skills.css`
- Create: `site/test/zomboidSkills.test.ts`

**Interfaces:**
- **`calc.ts`** (puro): `xpNeeded(skill, from, to)`; `withBooks(skill, from, to, mult)`, que dice qué libro conviene en cada tramo y cuánta XP "efectiva" hace falta con el multiplicador; los multiplicadores de profesión y rasgo, de la Task 1.
- **Lista:** las 35 habilidades por categoría, con ícono o sello y "de 0 a 10: N XP".
- **Ficha:**
  - tabla de XP por nivel;
  - libros por tramo (links a Objetos) con su multiplicador;
  - revistas relacionadas;
  - VHS, CD y TV que dan XP;
  - rasgos y profesiones que la suben (links);
  - la **calculadora**: "de nivel A a nivel B", con o sin libro y con o sin bonificación, que devuelve la XP necesaria y qué leer.
- **Tests:** `calc.ts` con valores a mano; la ficha de Carpintería en/es con sus libros.
- **Conectar** (commit aparte).

---

### Task 5: Moodles y salud

**Files:**
- Create: `site/src/zomboid/moodles/{data.ts, ZomboidMoodles.tsx, MoodleFicha.tsx, copy.ts, advice.ts}`, `site/src/styles/zomboid-moodles.css`
- Create: `site/test/zomboidMoodles.test.ts`

**Interfaces:**
- **Lista:** los 26 moodles como en el juego (círculo teñido y el ícono encima, `/zomboid/moodles/<icon>.webp`), agrupados por tipo (estado del cuerpo, ánimo, heridas, temperatura…), con su nombre.
- **Ficha:** cada nivel con su nombre y la descripción del juego, y **"qué hacer"**: texto propio, corto y práctico, en/es, en `advice.ts` (marcado como texto nuestro), con links a objetos cuando corresponda (por ejemplo vendas y antibióticos). Sin copiar de PZwiki.
- **Tests:** los 26 como links; la ficha de Sangrado en/es con sus niveles y su consejo; cada moodle tiene consejo en/es.
- **Conectar** (commit aparte).
