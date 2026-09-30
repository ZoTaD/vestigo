# Diablo II: Resurrected — la calculadora de drops (2026-09-29)

Pedido de ZoTaD el 2026-09-29, después de ver que Silospen ya existe en
español: "hacé la calculadora igual… la podemos hacer mejor, más intuitiva".
Eligió **los tres modos** y aprobó este diseño ("dale, arrancá").

## Qué es

Una pestaña nueva de la sección, **Drops** (`/es/d2r/drops`, `/en/d2r/drops`),
con tres modos que se eligen arriba:

1. **¿Dónde lo farmeo?** (el que abre por defecto). Buscás un ítem y te dice
   dónde conviene farmearlo.
2. **¿Qué suelta?** Elegís un jefe, un superúnico o los monstruos de un área y
   ves lo que puede soltar.
3. **Simulador.** Elegís un jefe o superúnico y cuántas runs, y "abrís el
   cofre": el botín tirado en el piso, como en el juego.

Además:
- **Una ficha por jefe y superúnico** (`/d2r/drops/mephisto`) con lo que suelta
  en cada dificultad. Son unas 85 páginas nuevas y es lo que se busca
  ("mephisto drops").
- **"Dónde farmearlo"** en cada ficha de único, pieza de conjunto y runa de la
  wiki: los 3 mejores lugares, calculados de antemano.

La diferencia con Silospen no está en la cuenta, que tiene que dar lo mismo,
sino en cómo se pregunta y se lee:
- se arranca por el ítem;
- se ven pocos controles;
- los resultados están en tarjetas con íconos;
- hay una curva del MF y una explicación de cada número en palabras;
- todo está integrado con la wiki y con los nombres oficiales en español.

## Cómo se usa

**Controles**
- A la vista sólo cuatro:
  - hallazgo mágico (300 por defecto);
  - jugadores (1 a 8, por defecto 1);
  - dificultad (todas);
  - Zona de Terror con tu nivel (apagada; al prenderla, nivel 90).
- En "Más opciones":
  - jugadores del grupo cerca tuyo (1 por defecto);
  - Clasificación (ladder, apagada);
  - nivel del Heraldo (1 por defecto);
  - primera muerte de misión (apagada).
- Todo el estado viaja en la dirección para compartirlo:
  - `?m=farm|drops|sim` e `i=` (el ítem: `u.harlequin-crest`, `s.tal-rashas-guardianship`, `b.r30` para la Ber, `b.uap` para una base);
  - `src=` (el lugar), `mf=`, `p=`, `g=`, `d=`, `tz=`, `h=` y `l=`;
  - `n=` (runs) y `seed=`.

**¿Dónde lo farmeo?**
- El buscador es grande, con íconos, y encuentra en español o en inglés:
  "shako" encuentra "Cresta del arlequín".
- Hay dos listas, porque no se comparan igual:
  - **Jefes y superúnicos**, por muerte (una muerte es una run).
  - **Áreas**, por monstruo: una fila por área y dificultad, con tres cifras
    (monstruo común, campeón y único) ordenadas por la del común.
- Con la Zona de Terror prendida, cada área que puede aterrorizarse suma una
  fila marcada con sus niveles de Zona de Terror y una cuarta cifra, la del
  Heraldo. Los jefes aterrorizados también se marcan.
- Cada fila dice "1 en N" y lleva una barra. Se abre para ver:
  - **¿Qué más suelta?**: lleva al modo 2 con ese lugar.
  - **¿De dónde sale este número?**: el camino principal en palabras. Por
    ejemplo: Mefisto, Infierno, 7 tiradas → equipo del Acto 3 → armaduras de
    nivel 66 → Casquete → único 1 en 3,2 con tu MF → Cresta del arlequín.
- Debajo va la **curva del MF** para ese ítem en el mejor lugar, de 0 a 1.000%,
  con una frase. Por ejemplo: "de 300 a 600% ganás sólo un 18% más".

**¿Qué suelta?**
- Primero se elige el lugar: jefe, superúnico o área, con su tipo de monstruo.
- Se muestran runas, únicos y conjuntos con ícono y chance. Las runas van en su
  orden (El → Zod); únicos y conjuntos, de más a menos probable.

**Simulador**
- Se eligen el lugar, las runs (1 a 1.000, 100 por defecto) y el MF.
- El resultado es la lista del botín con las etiquetas del juego y sus colores
  (dorado único, verde conjunto, naranja runa, amarillo raro, azul mágico). Lo
  notable va arriba (las runas desde Ist, después únicos y conjuntos por nivel,
  después las demás runas) y el resto se resume: raros, mágicos, normales y
  montones de oro.
- La semilla va en el enlace: el mismo enlace da el mismo cofre, así que se
  puede compartir en X.

En el celular todo va en tarjetas, sin tablas anchas: las reglas de la casa.

## El motor

Las reglas salen de la guía oficial que trae el juego
(`data/global/dataguide`: `itemratio-calc.html`, `treasureclassex.js`,
`monstats.js`, `desecratedzones.js`). Dos detalles que la guía no escribe los
confirmé en la base de conocimiento de Phrozen Keep y en código decompilado
publicado: el NoDrop según los jugadores y el máximo a lo largo de la cadena.

1. **Qué TC usa cada monstruo.** `monstats` trae una columna por tipo y
   dificultad:
   - `TreasureClass`, `…Champ`, `…Unique` y `…Quest`;
   - `…Desecrated`, `…DesecratedChamp` y `…DesecratedUnique`;
   - `…Herald`.

   Los superúnicos la traen en `superuniques` (`TC`, `TC Desecrated`, por
   dificultad).
2. **Nivel del monstruo (mlvl).**
   - En Normal es el de `monstats`. En Pesadilla e Infierno manda el del área
     (`levels.MonLvlEx`).
   - Los jefes (`boss` en `monstats`) conservan el propio. `noRatio` no sirve para
     esto: los jefes que se usan lo tienen vacío.
   - Los campeones suman 2; los únicos, superúnicos y esbirros suman 3.
   - En una Zona de Terror el nivel es `max(base, min(nivel del jugador + boost_level, bound_incl_max))`,
     con piso `bound_incl_min`. La bonificación de único puede pasar el tope.
   - Los jefes aterrorizados también suman el +3 de único (Silospen y las guías
     de la comunidad: "Unique/Boss +5"), sin pasar del tope + 3 (99 en Infierno)
     y sin bajar de su nivel propio: Baal sigue en 99.
   - Pandemonio (Guarida de la Matrona, Arenas Olvidadas, Horno del Dolor,
     Tristram de Pandemonio) y el Clon de Diablo sólo existen en Infierno.
   - En un área, la cifra es por monstruo que aparece: pesada por `Rarity`; los
     que no tienen TC para ese tipo cuentan con 0 y los de `Rarity` 0 no salen al
     azar. "¿Qué suelta?" de un área da el mismo promedio.
   - El ítem cae con ese nivel (ilvl = mlvl).
3. **Mejora de TC.** Si el TC tiene `group`, se recorre su cadena (las filas
   contiguas de la tabla con ese grupo) hacia adelante mientras el `level` de la
   siguiente no pase el mlvl; nunca baja. El número de grupo se repite entre
   dificultades: por eso cuenta la cadena y no el número.
   - Los jefes no mejoran, salvo aterrorizados.
   - Al Heraldo se le suma `herald_treasure_class_level_boost` según su nivel.
4. **NoDrop según los jugadores.**
   - `N = int(1 + (jugadores − 1)/2 + (grupo − 1)/2)`.
   - `NoDrop' = int(Σprob / (1/(NoDrop/(NoDrop+Σprob))^N − 1))`.
5. **Tiradas.**
   - **Positivas:** k tiradas independientes entre las entradas y el NoDrop.
   - **Negativas:** se recorren las entradas en orden, cada una Prob veces,
     hasta |k|; ahí no hay NoDrop.
   - **Sub-TC:** una entrada que es otro TC se "corre" con sus propias tiradas.
6. **Máximo de 6 ítems por muerte**, contando pociones y oro. Cuando se llega a 6,
   no se genera nada más. Por eso el cálculo es exacto con una programación
   dinámica sobre (TC, lugar que queda). Importa en los jefes de 7 tiradas y en
   los únicos, que tiran pociones primero.
7. **Condiciones.**
   - `ConditionCalc` usa siete condiciones: dificultad, aterrorizado, es Heraldo
     y el nivel del Heraldo. Se evalúan con el contexto.
   - `firstLadderSeason` y `lastLadderSeason`, contra la opción Clasificación.
   - Un sub-TC que no pasa se saca del sorteo, con su Prob.
8. **Calidad heredada.** Por cada calidad (único, conjunto, raro, mágico) vale
   el **máximo** de la cadena: el del TC y el de la entrada (`cu`, `cs`, `cr`,
   `cm`).
9. **Entradas.**
   - Un código de base.
   - Un TC automático (`weapN`, `armoN`, `meleN` o `bowN`): las bases que caen
     (`spawnable`) de nivel `(N−3, N]`, cada una con el peso `Rarity` de su **tipo**
     en `itemtypes` (3 casi siempre; 2 las garras; 1 orbes, pieles y arcos de Amazona).
   - Un único o una pieza de conjunto por nombre: sale con esa calidad fija.
   - `gld` (oro).
10. **Calidad del ítem** (fórmula de `itemratio-calc.html`, con enteros como el
    juego).
    - Se prueba en orden: único → conjunto → raro → mágico → superior → normal.
    - La fila de `itemratio` se elige por expansión, excepcional o élite
      (`uber`) y si la base es de clase.
    - La cuenta de cada calidad es:
      - `chance = (Rarity − (mlvl − qlvl)/Divisor) × 128`;
      - si el MF supera 10% y la calidad es única, de conjunto o rara, el MF
        efectivo es `100 + MF·dim/(MF+dim)`, con dim 250, 500 o 600; si no, es
        `100 + MF`;
      - después `chance = chance × 100 / MF efectivo`, `chance = max(chance, Min)` y
        `chance −= chance × modTC/1024`;
      - la probabilidad es `128/chance`.
    - Lo que cada tipo admite sale de `itemtypes`:
      - `Normal=1` siempre es normal (runas, gemas, oro, pociones);
      - `Magic=1` es como mínimo mágico (anillos, amuletos, joyas, talismanes);
      - los que no tienen `Rare` nunca son raros (talismanes).
11. **Qué único o pieza sale.**
    - Entran los de esa base que caen, que no están desactivados y que cumplen
      `lvl ≤ ilvl`, Clasificación y `DropConditionCalc`. Se elige por `rarity`.
    - Si no hay ninguno: un único fallido sale raro y un conjunto fallido sale
      mágico.

**Los tres modos usan el mismo motor:**
- "Dónde farmear" corre el cálculo de un solo ítem en todos los lugares. Un
  filtro de alcanzabilidad descarta los TCs que no pueden llegar a esa base, y
  se memoriza por (TC, lugar libre, calidad heredada, ilvl).
- "Qué suelta" corre el cálculo de cada ítem notable de un lugar.
- El simulador sortea con las mismas reglas y un generador con semilla
  (mulberry32).

**Los lugares**
- Jefes de acto y de misión, superúnicos, Vacas y el Rey Vaca, Pandemonio,
  Diablo Clon, Ancestros Colosales y Heraldos.
- Las áreas con sus monstruos (`levels`: `mon`, `nmon` y `umon`), con la mezcla
  de monstruos pesada por `monstats.Rarity`.
- Las Zonas de Terror salen de `desecratedzones.json`.
- Lo único a mano: en qué área está cada superúnico y cada jefe. El juego lo
  define en los mapas, no en tablas, y son unos 80. Un test exige que cada uno
  apunte a un área que existe.

## Datos y archivos

- **`games/d2r/tools/drops.py`** (nuevo) escribe en `games/d2r/data/drops/`:
  - `tcs.json` (con los `weapN`/`armoN` ya armados);
  - `monsters.json`, `areas.json`, `sources.json` (jefes y superúnicos con su área);
  - `rules.json` (`itemratio`, calidades por tipo, Zonas de Terror y Heraldos);
  - `items.json` (bases con `qlvl`, `rarity`, `uber` y clase; únicos y piezas
    con `rarity`, `lvl` y condiciones).

  Nombres en inglés y es-MX, desde los textos del juego.
- **`site/src/d2r/drops/`:**
  - `engine.ts`: la cuenta exacta, funciones puras;
  - `simulate.ts`: el sorteo;
  - `sources.ts`: los lugares;
  - `D2rDrops.tsx` con un componente por modo, el buscador y la curva del MF.
- **`site/scripts/d2-drops.ts`** corre el mismo motor en Node y escribe
  `games/d2r/data/drops/computed/`:
  - `farm.json`: los 3 mejores lugares de cada único, pieza y runa, con 1
    jugador, 300% de MF y sin Zonas de Terror;

  Así el build no calcula esos bloques. La ficha de cada jefe o superúnico, en
  cambio, se calcula al prerenderizar: es un solo lugar y unos 600 ítems, y el
  motor lo resuelve en milisegundos. Si el prerender se alarga, se precalcula
  igual que `farm.json`.
- **Rutas y SEO:**
  - `drops` entra en `D2rTab`, `D2R_SECTIONS` y `D2R_DETAIL_SECTIONS`, con sus
    fichas en el sitemap;
  - títulos con lo que se busca: "D2R Drop Calculator: Where to Farm Any Item
    (Terror Zones Included)" y "Calculadora de drops de Diablo 2 Resurrected:
    dónde farmear cada ítem";
  - para cada ficha: "Qué suelta Mefisto en Diablo 2 Resurrected" y "Mephisto
    Drops in Diablo 2 Resurrected".
- **Tamaño:** los datos del motor van en el chunk de la pestaña: 547 KB, 88 KB
  comprimidos (se habían estimado 250 y 50). Las fichas de jefes traen sus listas
  de fábrica en el HTML (una isla de datos, ~7 KB comprimidos) para no recalcular
  al abrir en el celular. Las fichas de la wiki leen `computed/farm-*.json`.

## Cómo se verifica

- **Tests del motor:**
  - NoDrop con 1, 3 y 8 jugadores;
  - tiradas negativas, el máximo de 6 y la mejora de TC;
  - la fórmula de calidad calculada a mano, con el MF por debajo y por encima de 10;
  - el único fallido;
  - condiciones y Clasificación.
- **Motor contra simulador:** con 200.000 muertes simuladas, las chances tienen
  que coincidir dentro del margen estadístico. Es la prueba cruzada más fuerte.
- **Contra Silospen, en unos 8 casos:**
  - Cresta del arlequín de Mefisto (Infierno);
  - runas de la Condesa;
  - Ber de Baal;
  - un élite de los Pozos;
  - una Zona de Terror con nivel 90;
  - 8 jugadores;
  - 300% de MF.

  Se anotan los números en el test. Si difieren, se explica o se corrige.
- **Celular:** nada se sale a 375 px.

## Afuera por ahora

- Tiempo por run o por hora.
- Cofres y objetos del mapa.
- Cuántos monstruos tiene un área entera.
- La cantidad de oro de cada montón: el simulador cuenta montones.
- Apuestas y Cubo.

## Estado (2026-09-29)

- **Implementado** según el plan `docs/superpowers/plans/2026-09-29-d2r-calculadora-drops.md`,
  sin commitear. Cada tarea pasó una revisión aparte (lo pedido y la calidad) y una
  revisión final de todo junto.
- **Validado contra un evaluador exacto independiente** (1e-6), con y sin el tope de
  6 ítems: 40 casos de jefes (Infierno con 0 y 300% de MF y 8 jugadores; Ber, la
  Guardia de Tal Rasha) y 12 de lugares (Ist de la Condesa, Pindleskin, Eldritch,
  comunes, campeones y únicos del Pozo 1, Zona de Terror a nivel 90). El evaluador
  está en `games/d2r/tools/drops_check.py` y reproduce las 54 referencias.
- **Contra Silospen en vivo, leyendo lo que muestra la página** (no sólo el motor):
  todo lo que tiene que coincidir coincide a menos de 0,001%. Difiere donde tiene
  que diferir:
  - la Condesa (Ist): 17,78% menos, por el tope real de 6 ítems (Silospen no lo aplica);
  - Mefisto (Cresta): 10,92% más, porque Silospen recorta las 7 tiradas a 6;
  - Pindleskin (Ist): 18,16% más, por la tabla que cambió en el 3.3.
- **Motor contra simulador:** 100.000 muertes de la Condesa dentro de 5σ, y 422.000
  comparaciones sin nada fuera de 5σ.
- **Reglas confirmadas en la guía de datos del juego:** una sub-TC que no pasa su
  condición sale del sorteo con su Prob, también en las tiradas negativas
  ("its Prob is completely removed from the roll").
- **Decisiones de datos:** Lilith, Uber Duriel y Uber Izual no son lugares (sólo
  sueltan su órgano); lo exclusivo de Clasificación en la temporada se calcula en
  Clasificación y la ficha lo avisa.
- **Build:** 48 s; el prerender, 11.828 rutas en 24 s (las 128 fichas de jefes incluidas).
- **Regenerar después de un parche:** `extract.py` → `wiki.py` → `drops.py` (en
  `games/d2r/tools/`) y, desde `site/`, `npm run d2:drops`. Al cambiar `SEASON`
  (`site/src/d2r/season.ts`) también hay que correr `npm run d2:drops`: un test
  avisa si los bloques quedaron viejos. Si un parche cambia una referencia de los
  tests, se vuelve a sacar con `python games/d2r/tools/drops_check.py`.
- **Pendiente para más adelante:** "Abrir en la calculadora" sin recargar la página;
  recortar `drops.json` (columnas vacías y TCs que nadie alcanza); separar las listas
  de la wiki de sus fichas para que no carguen los bloques; el motor en un Worker.
