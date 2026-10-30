# Valheim: calculadoras, Mi partida y otras 6 herramientas (diseño)

2026-10-30. Sale del análisis de competencia del mismo día (physgun.com/tools/valheim, xgamingserver.com/tools/valheim,
valheim-map.world, west-games.com/valheim-armor-calculator). ZoTaD pidió las 8 ideas ("todas sirven, hay que
implementar todas"), aprobó el reparto de abajo y eligió las maquetas: **A "Tablero de tarjetas"** para las
calculadoras y **B "Ruta de biomas"** para Mi partida (`.superpowers/brainstorm/1239-1793366605/content/`,
`herramientas-layout.html` y `mi-partida.html`).

## Para qué

Que quien juega Valheim no tenga que salir de Vestigo para las cuentas que hoy hace en otros sitios: qué comer, cuánto
pega su arma, cuántos golpes aguanta, cuánto descansa, cuánto le falta para subir una habilidad, qué le queda por hacer
y cuánto cuesta lo que quiere construir. Cada herramienta cruza con las fichas que ya tenemos (eso no lo hace nadie).
El sitio apunta primero al inglés; los textos se escriben en los dos idiomas, como el resto de la sección.

**Antiobjetivos:** números inventados o "aproximados" sin decirlo (todo cálculo sale de una fórmula verificada, ver
Fórmulas); nada que trabe la página (presupuesto de `CLAUDE.md`); explicar en la UI de dónde salen los datos.

## Dónde va cada cosa

| # | Herramienta | Dónde |
|---|---|---|
| 1 | Combinador de 3 comidas | Calculadoras → Comidas |
| 2 | Daño real y golpes que aguantás | Calculadoras → Combate |
| 4 | Confort y descanso | Calculadoras → Confort |
| 8 | XP de habilidades y penalidad por muerte | Calculadoras → Habilidades |
| 5 | Checklist de progreso y jefes | Pestaña nueva **Mi partida** |
| 3 | Pines compartidos por enlace | Mapa (subir el mundo ya existe: "Tu partida") |
| 6 | Carrito de construcción | Lista de Construcción → Planificador |
| 7 | IDs y comandos de spawn | Cada ficha |

**Nombre (decisión mía):** la pestaña no puede llamarse "Herramientas": ya existe `tools` ("Tools"/"Herramientas",
picos, hachas, munición). Va como **"Calculators" / "Calculadoras"**, sección `calculators`
(`/en/valheim/calculators`, `/en/valheim/calculators/food`, `/combat`, `/comfort`, `/skills`). Mi partida:
sección `progress`, **"Progress" / "Mi partida"**. Las dos pestañas van al final de la barra de Valheim, antes de la
Crónica.

## Calculadoras (maqueta A)

Cabecera de la sección; debajo, **cuatro tarjetas** (Comidas, Combate, Confort, Habilidades) con un ícono del juego,
título y una línea. La elegida se ve más clara. Debajo, la herramienta dentro del marco de madera de las fichas
(`.vh-frame` / `.vh-inset`), con las placas de madera (`.vh-plate`) como títulos de bloque. Cada herramienta tiene
su URL (para SEO y para compartir) y guarda su estado en la dirección (`?f=…`), igual que el Planificador. La URL sin
herramienta (`/calculators`) muestra Comidas. Teléfono: las tarjetas pasan a 2×2 y la herramienta a una columna.

### 1. Comidas

- Tres casillas; al tocar una se abre un buscador con las comidas (ícono, nombre, salud/aguante/eitr, duración),
  filtrable por bioma y foco (los filtros de la pestaña Comidas). No deja elegir la misma dos veces.
- Totales al comer: salud, aguante, eitr (con la base), curación por tick.
- **Curva en el tiempo** (SVG propio, sin librería): salud, aguante y eitr minuto a minuto, con los colores del HUD
  (`--vh-hp`, `--vh-st`, `--vh-ei`). Al pasar el mouse (o tocar), los valores de ese minuto. Una línea punteada en
  cada momento en que ya se puede volver a comer cada plato.
- **"Mejor combo para mi bioma"**: fichas de bioma; al elegir uno, propone el trío que maximiza salud+aguante (y otro
  que maximiza eitr desde las Tierras brumosas) entre las comidas de ese bioma o anteriores. Búsqueda exhaustiva
  (C(96,3) ≈ 142 mil tríos, se hace una vez, en el momento). Botón para cargarlo en las casillas.
- Cada comida enlaza a su ficha.

### 2. Combate

Dos mitades:

- **Tu daño:** elegís arma (buscador), calidad (1…`maxQuality`) y nivel de habilidad (0–100, deslizador); muestra el
  daño por tipo con el rango mínimo–máximo según la habilidad, y contra una criatura elegida aplica sus debilidades,
  resistencias e inmunidades (ya están en `creatures.json`) → daño por golpe y golpes para matarla (por estrellas: 0,
  1, 2).
- **Golpes que aguantás:** elegís set de armadura (los sets de `armor.json`, o pieza por pieza: casco, pecho,
  piernas, capa) y calidad; contra los ataques de las criaturas de un bioma (`attacks` de `creatures.json` y
  `bosses.json`) muestra una tabla: criatura, ataque, daño recibido después de la armadura y golpes hasta morir con
  la salud que elegís (por defecto, la del mejor trío de ese bioma; enlaza con Comidas). Las filas pueden pasar de
  150 → `LazyRows`. Escudo opcional: daño que pasa al bloquear y con parry.

### 4. Confort

- Grilla de las piezas con confort (75 en `building.json`), agrupadas por **grupo de confort**: de cada grupo cuenta
  sólo la de más confort (sillas, camas, fuegos, banderas, etc.). Se marcan las que tenés cerca de la cama.
- Resultado: confort total, y **duración del descanso** ("Rested"). Interruptor de refugio y de fuego cerca.
- Sugerencia: "el máximo con lo de tu bioma" (la mejor pieza de cada grupo disponible hasta ese bioma).
- **Datos que faltan:** el grupo de confort de cada pieza (`m_comfortGroup`) no se extrajo. ZoTaD reinstala Valheim
  (30/10): `extract.py` lo lee del prefab junto a `m_comfort` y `site.py` lo suma como `comfortGroup` en
  `building.json`. Un test exige que toda pieza con confort tenga grupo. Otra sesión está corrigiendo datos de
  Valheim (`fixes.py`, hidromieles, escudos, Kall): no tocar `fixes.py`, y el cambio en `extract.py` va chico y
  aislado para no pisarse; coordinar antes de regenerar los datos.

### 8. Habilidades

- Elegís habilidad (las del juego) y nivel actual (con decimales: el juego muestra la barra) → XP para el siguiente
  nivel y para llegar a un nivel objetivo, y cuánto pierde una muerte según el modificador de mundo (por defecto,
  normal).
- Tabla compacta de las niveles 1–100 con la XP acumulada (100 filas: sin `LazyRows`).
- Si Mi partida leyó tu personaje, se puede cargar tus niveles reales (ver abajo).

## Mi partida (maqueta B)

- A la izquierda, la **ruta de biomas** en orden (Pradera → Tierras de ceniza y, si los datos lo tienen, Norte
  profundo), con el trofeo del jefe, el avance (`4/6`) y un punto que se llena al terminar el bioma. El actual se
  resalta; tocar otro muestra sus tareas.
- A la derecha, las tareas del bioma en tres columnas: **Equipo**, **Materiales** y **Jefe**. Cada tarea es una
  casilla y enlaza a su ficha.
- **Las tareas salen de los datos**, no se escriben a mano: por bioma, las estaciones y mejoras clave, el set de
  armadura del bioma, el arma de su metal, los materiales que abren el siguiente paso (los que el Planificador ya
  conoce: `planner.json` y `bosses.json`), la hidromiel que hace falta (frío, veneno, fuego) y el jefe (invocación y
  victoria). Unas 6–8 por bioma; la lista exacta es del constructor, revisable en la vista previa.
- Se guarda en `localStorage` (clave `vestigo:valheim:progress`), con try/catch: sin almacenamiento, funciona en la
  pestaña. Botón "Empezar de nuevo" (pide confirmación).
- **"Leer mi personaje" (decisión mía, propuesta en la maqueta):** subís el `.fch` y se tildan solos los jefes
  vencidos y lo que ya conocés (recetas, estaciones, materiales vistos). Hoy `character.ts` lee hasta los mapas;
  hay que seguir leyendo el bloque de datos del jugador (`Player.Save`: inventario, recetas, estaciones, materiales
  conocidos, trofeos, habilidades). Se valida contra los archivos reales de `realFiles.test.ts`. Las habilidades leídas
  se ofrecen a la calculadora de Habilidades. Nada sale del navegador.

## Mapa: pines compartidos por enlace

El mapa ya lee el mundo y los personajes ("Tu partida") y dibuja sus pines. Falta:

- Botón **"Compartir pines"**: arma un enlace con la semilla, la vista y los pines elegidos (todos, o los de un
  jugador) codificados en el `#` de la dirección (no viajan al servidor). Formato compacto: tipo, x, z redondeados
  a 1 m y nombre, comprimido con `CompressionStream("deflate-raw")` y en base64url. Tope de pines por enlace para
  que la dirección no pase ~8 KB; si se pasa, avisa.
- Al abrir un enlace con pines, se ven como capa aparte ("Pines compartidos"), sin subir nada.
- Pines a mano: un clic largo (o un botón) agrega un pin propio con nombre, que entra en el enlace.

## Carrito de construcción

El Planificador ya acepta piezas de construcción (`piece:<id>`) y suma materiales y estaciones. El carrito **es el
Planificador**: en cada fila de la lista de Construcción va un botón "+" (y la cantidad si ya está), como el
"Agregar al Planificador" de la ficha, y un aviso fijo abajo con "N piezas · ver materiales" que lleva al
Planificador. Sin una segunda lista guardada (propuesta mía; ZoTaD no la objetó).

## Comandos de spawn

En cada ficha que se puede spawnear (objetos, comidas, armas, armaduras, materiales, criaturas, jefes), un recuadro
chico con el nombre interno (`id`, por ejemplo `SpearChitin`) y el comando listo para copiar
(`spawn SpearChitin 1`; criaturas con nivel: `spawn Troll 1 3` = 2 estrellas), con un botón Copiar y una línea de
cómo activar los comandos (`devcommands`). Piezas de construcción: sólo el nombre interno (no se spawnean).

## Fórmulas

Leídas en valheim.weirdgloop.org y **confirmadas el 30/10 en el código del juego instalado** (IL de
`assembly_valheim.dll` leído por reflexión, y valores de los prefabs con `pipeline.peek`). La fuente va acá, nunca en
la UI.

**Comida**
- `Player.UpdateFood`: aporte de cada comida = `base · Clamp01(restante / m_foodBurnTime)^0,3` (salud, aguante y
  eitr). Base (`GetTotalFoodValue`): `m_baseHP` 25, `m_baseStamina` 50, eitr 0.
- Curación: cada 10 s, la suma de `m_foodRegen` de las comidas (× modificadores de estado; Descansado ×1,5).
- `Food.CanEatAgain`: se puede volver a comer cuando `restante < m_foodBurnTime / 2`.

**Daño**
- `ItemData.GetDamage(q)`: `m_damages + m_damagesPerLevel · (q − 1)` (más el bonus de nivel de mundo, fuera de v1).
  Armadura: `m_armor + max(0, q − 1) · m_armorPerLevel`; bloqueo: `m_blockPower + max(0, q − 1) · m_blockPowerPerLevel`.
- `Skills.GetRandomSkillFactor`: `f = nivel/100`; `c = lerp(0,4; 1; f)`; factor uniforme entre
  `clamp01(c − 0,15)` y `clamp01(c + 0,15)` (nivel 0: 25–55 %; 100: 85–100 %).
- Tipo (`DamageModifier`): muy débil ×2, débil ×1,5, levemente débil ×1,25, levemente resistente ×0,75, resistente
  ×0,5, muy resistente ×0,25, inmune ×0. Golpe furtivo (el `m_backstabBonus` del arma) y aturdido ×2: opciones.
- Estrellas (`Attack.GetLevelDamageFactor`): daño ×`1 + 0,5·(nivel − 1)` (1★ ×1,5; 2★ ×2); salud
  (`SetupMaxHealth`) × nivel (1★ ×2; 2★ ×3). Nivel 1 = sin estrellas.

**Armadura y bloqueo**
- `DamageTypes.ApplyArmor(ac)`: se toma el **total** del golpe (todos los tipos, después de resistencias);
  `total' = total < 2·ac ? total · clamp01(total / (4·ac)) : total − ac`, y cada tipo se escala en la misma proporción.
  (No es por tipo: corregido respecto de la wiki.)
- Bloqueo (`GetBlockPower(q, skill)`): `bloqueo(q) · (1 + 0,5 · nivelBloqueo/100)`; el golpe bloqueado pasa por la misma
  fórmula de armadura con ese valor; luego la armadura del cuerpo. Parry: × `m_timedBlockBonus` del escudo/arma.
- Dificultad del mundo (daño enemigo, wiki /World_Modifiers): muy fácil 50 %, fácil 75 %, normal 100 %, difícil
  150 %, muy difícil 200 %. Selector, por defecto normal. Jugadores extra: fuera de v1.

**Confort y descanso** (`SE_Rested`)
- `CalculateComfortLevel`: empieza en 1. **Sólo bajo techo** suma 1 y las piezas en 10 m: se ordenan por grupo
  (`Piece.ComfortGroup`: None, Fire, Bed, Banner, Chair, Table, Carpet, Display, Decor, Garland, Lantern, Leisure) y
  confort descendente; de cada grupo cuenta la primera; las de grupo None suman todas salvo repetidas por nombre.
- Duración: `m_baseTTL + (confort − 1) · m_TTLPerComfortLevel` = `480 + 60·(confort − 1)` s (8 min con 1).
- Descansado: XP ×1,5 (`m_raiseSkillModifier` 0,5), regeneración de salud ×1,5, aguante y eitr ×2.

**Habilidades** (`Skills`)
- `GetNextLevelRequirement`: `0,5 · floor(N + 1)^1,5 + 0,5` (de 99 a 100: 500,5, igual que la tabla de la wiki).
- Cada habilidad sube `m_increseStep` por acción × el factor de la acción (espadas 1, arcos 1,5…; se extraen).
- `OnDeath`: cada nivel pierde `nivel · m_DeathLowerFactor (0,05) · m_skillReductionRate` y el avance al siguiente
  vuelve a 0. Modificadores (wiki): casual y muy fácil 1 %, fácil 2,5 %, normal 5 %, difícil 7,5 %, hardcore 100 %.
  "Sin pérdida de habilidades" 10 min tras morir.

**Consola** (wiki /Console_commands): `-console` en Steam, F5, `devcommands`; `spawn <prefab> [cantidad] [nivel]`
(nivel 1 = sin estrellas); sólo un jugador o servidor propio, no dedicado.

## Rendimiento y datos

- Cada calculadora es un chunk propio cargado con `import()`; los JSON se importan enteros. Comidas usa `foods.json`;
  Combate, `weapons.json`, `armor.json`, `creatures.json`, `bosses.json`; Confort, `building.json` (o un recorte
  `comfort.json` armado en `site.py` si `building.json` pesa demasiado para una página); Habilidades no necesita
  datos.
- Las listas largas (buscadores, tabla de golpes) con `LazyRows`; los íconos de listas con `SettledImg`, tamaño fijo.
- Sumar a `PAGES` de `site/scripts/perf.mjs`: `/en/valheim/calculators`, `/combat`, `/comfort`, `/skills` y
  `/en/valheim/progress`; correr `npm run perf` antes de cada PR. Una pestaña nueva se suma a `areaFiles.ts` si
  corresponde.
- Prerender: cada calculadora y Mi partida se prerenderizan con su texto y el estado inicial (SEO); sitemap de
  Valheim con las URLs nuevas, títulos con lo que se busca ("Valheim food calculator", "Valheim comfort calculator",
  "Valheim skill XP calculator").

## Etapas (un PR cada una, flujo PR → vista previa → merge)

1. Pestaña Calculadoras con las tarjetas + **Comidas**; **comandos de spawn** en las fichas.
2. **Combate** (tu daño + golpes que aguantás).
3. **Confort** (con los grupos cargados en el pipeline) + **Habilidades**.
4. **Mi partida** con la ruta, el guardado y "Leer mi personaje".
5. **Carrito** en la lista de Construcción + **pines compartidos** en el mapa.

Cada etapa: tests de las fórmulas (casos tomados de la wiki), revisión visual de cerca (títulos, cifras, bordes; sin
bordes de color en tarjetas), en teléfono y escritorio, y `npm run perf`.

## Decisiones mías (después de la revisión)

- **Mejor combo:** maximiza `salud + aguante` al comer (suma simple); desempata la curación por tick. Desde las
  Tierras brumosas se ofrece también "más eitr" (maximiza eitr, desempata salud). El bioma de cada comida es su
  `tier` de `foods.json`. Los tríos se recorren en el hilo principal (son sumas: milisegundos), sin worker.
- **Fórmulas:** se confirman en el código del juego antes de cada etapa. Si algo no se encuentra ahí, el número
  sale con "≈" y una nota corta ("aproximado"), y la etapa se publica igual.
- **Leer mi personaje:** hay `.fch` reales en `AppData/LocalLow/IronGate/Valheim/characters` (`*.fch.old` y un
  backup de 2023) para `realFiles.test.ts` (`VALHEIM_TEST_FCH`). Es la última parte de la etapa 4: si el formato da
  problemas, la ruta de biomas sale sin ella y la lectura va en un PR aparte.
- **Daño de criaturas:** `attacks` ya trae el daño por tipo (`{"blunt": 60, …}`); no hace falta pipeline nuevo.
  El cálculo del mejor trío vive en un módulo común (`valheimCalc.ts`), así Combate lo usa sin cargar la página de
  Comidas.
- **Pines por enlace:** si pasan de ~8 KB, se avisa y se ofrecen filtros (por jugador y por tipo de pin) hasta que
  entren; no se recorta en silencio.
- **Estado en la dirección:** cada calculadora define el suyo con parámetros cortos legibles (`?a=…&b=…&c=…` con los
  `id` de las comidas, `?w=SwordIron&q=3&s=40`); no se reutiliza el formato del Planificador.

## Lo que queda al constructor

La lista exacta de tareas por bioma, los íconos de las tarjetas (del juego), el diseño fino de cada calculadora dentro
del estilo A, los textos en los dos idiomas, y cómo se reparte el código entre archivos.
