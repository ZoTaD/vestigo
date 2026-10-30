# Deadlock: 5 funciones nuevas (30/10)

Salen del análisis de competencia del 30/10 (statlocker, deadlock.wiki, tracklock,
seemeta, deadlock-api). ZoTaD eligió cinco y arrancó por el predictor de draft; dijo
que lo usaría "más por curiosidad" y me delegó el resto de las decisiones. **Todo lo
marcado (mío) es decisión mía, para que ZoTaD lo revise.**

Reglas que valen para las cinco: estilo Cartel, sin bordes de color en tarjetas,
inglés primero (el español es la traducción), sólo datos oficiales o de deadlock-api,
no scrapear statlocker, no explicar de dónde salen los datos en la UI, y las reglas de
rendimiento de `CLAUDE.md` (datos por `import()`, `LazyRows`, `SettledImg`, perf).

## 1. Armador de equipo (predictor de draft 6v6)

**Para qué.** Elegir los seis héroes de cada lado y ver qué equipo tiene más chances,
y por qué. Uso de curiosidad: armar el equipo del último partido o probar ideas.

**Dónde.** Pestaña nueva `draft` al lado del Armador de builds: "Team builder" /
"Armador de equipo" (mío). URL compartible con los equipos en la query (`?a=…&b=…`).

**Modelo (mío).** No alcanza con medir equipos completos: `hero-comb-stats` con
`comb_size=6` trae 5–7 partidas por equipo. Se arma una regresión logística sobre tres
sumas, todas en log-odds y por banda:

- **Fuerza**: Σ logit(WR del héroe) del equipo A menos la del B.
- **Cruces**: para cada a∈A y b∈B, cuánto se mueve el WR de a cuando b está enfrente
  (`hero-counter-stats`, partida entera), descontada la fuerza de cada uno.
- **Sinergias**: para cada par de aliados, cuánto gana el par por encima de lo que
  ganan por separado (`hero-synergy-stats`).

Pares con menos de 100 partidas (`MIN_PAIR`) cuentan 0. Los tres pesos se ajustan con
partidas reales de la banda (`matches/metadata` de deadlock-api, dentro de la ventana
de la tier list) en un script del pipeline que publica `draft-model.json` con los pesos,
el acierto y el Brier medidos. La página dice cuánto acierta ("calls the winner in X %
of Phantom+ matches"), sin explicar de dónde salen los datos.

**Pantalla.** Dos columnas de seis lugares (Amber / Sapphire), grilla de héroes para
elegir, selector de banda (el de siempre), una barra con el % de cada lado, las 5 razones
que más pesan ("Abrams counters Haze +1.8 pp") y, si quedan lugares vacíos, los 3 mejores
héroes para completar cada lado (mío: es lo más útil para "armar con amigos").

**Datos.** `heroes.<banda>.json` + `hero-insights.<banda>.json` (ya existen, ~90 KB) +
`draft-model.json` (chico). Todo se calcula en el navegador; sin pedidos en vivo.

## 2. Matchups de línea en la ficha del héroe

**Dónde.** Sección Matchups de la ficha, debajo de los counters de partida entera:
"In lane" con los rivales de línea más duros y más fáciles.

**Datos (mío).** `lane-matchup-stats` de deadlock-api (dúo contra dúo, marcado
"subject to change") con `sample_time_s=600` y las líneas plegadas. Cada fila dúo-vs-dúo
se reparte a cada héroe del dúo contra cada rival del otro: partidas, victorias de la
partida y ventaja de almas **del dúo** a los 10 minutos (promedio ponderado). Se rotula
"lane souls at 10:00" como ventaja de la línea, no del héroe solo. Se ordena por ventaja
de almas; piso de 100 partidas como en los counters. Archivo nuevo `lane.<banda>.json`,
uno por banda, que la ficha baja sólo al llegar a Matchups. Si la API cambia o falla, la
banda se saltea y queda el archivo anterior (como `heroInsights.ts`).

## 3. Patch movers

**Dónde.** Una sección "Who moved" en cada edición de Vestigo News (la lista de Parches
ya enlaza a cada edición).

**Datos (mío).** Las fechas son las de las ediciones de `news.json` (no `big-days`: así
cada edición tiene su sección). Para las últimas 8: WR de héroes y objetos 7 días antes
contra 7 días después (o hasta hoy), en Phantom+ con `hero-stats` / `item-stats`. Se publican los 5 que más subieron y los 5
que más bajaron de cada lista, con piso de partidas. Archivo `patch-movers.json`. Los
parches viejos no cambian: se calculan una vez y se guardan.

## 4. One-tricks (el mejor de cada héroe)

**Dónde.** Ladder: debajo de la tabla, una grilla "The best with every hero" con
**todos** los héroes. Cada tarjeta es el mejor puesto del top 10 del héroe con 20+
partidas de ese héroe en los últimos 30 días (el #1 histórico puede tener 2 en el mes), y
lleva a su perfil (mío).

**Datos.** `heroLadder.json` ya tiene el top 100 por héroe (orden Wilson, mín. 20
partidas); los nombres se piden en vivo a `players/steam` en una sola tanda, como hoy el
podio.

## 5. Builds de jugadores top

**Dónde.** Ficha del héroe → "Builds the best players use": las 3 builds más elegidas
por su top 20, con el nombre de la build, cuántos de los top la usan y su WR, y un
enlace para abrirla en el Armador de builds si el armador acepta importarla (mío).

**Datos.** Pipeline: top 20 de `heroLadder.json` por héroe → `matches/metadata` con
`account_ids` y `hero_ids` de la ventana → `hero_build_id` (la build con que arrancaron)
→ `/v1/builds/{hero}/{build}` para el nombre y los objetos. Archivo `top-builds.json`.

## Estado (30/10)

Las cuatro etapas salieron como PRs 40 (draft), 41 (línea), 42 (patch movers) y 43
(one-tricks + builds top). Medido con el panel Browser contra `vite preview` (Playwright
no arranca en el sandbox): todas las páginas dentro del presupuesto.

## Etapas (un PR cada una)

1. Armador de equipo (pipeline del modelo + pestaña).
2. Matchups de línea.
3. One-tricks + builds de jugadores top.
4. Patch movers.

Cada etapa: tests del pipeline sin red, `npm run perf` con las páginas nuevas, vista
previa de Netlify, merge (flujo delegado) y verificación en vivo. Los scripts nuevos que
piden a la API van al workflow `publish-deadlock.yml` en la franja que menos carga tenga.

## Lo que queda para quien construye

Textos finales, cortes de "fácil/difícil", diseño fino de cada tarjeta dentro del estilo
Cartel, y el detalle de cuándo corre cada script en el workflow.
