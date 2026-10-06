# Noche del 2026-10-06: Rust y auditoría de datos

Pedido de ZoTaD antes de irse a dormir:
- **Rust:** aplicar las optimizaciones de `CLAUDE.md` y hacer las pestañas que
  se puedan con los datos ya extraídos, contrastando con wikis.
- **Valheim, D2R y Zomboid:** revisar datos y descripciones contra fuentes de
  internet y corregir lo que esté mal.

Rama: `claude/deadlock-patch-tweet-ebd02e`, armada desde `feat/rust` con
`main` mergeado. No se mergea a `main`.

**Sin la máquina de ZoTaD no se puede correr el extractor** (`games/rust/tools`
lee el juego instalado). Las pestañas nuevas usan sólo lo que ya está en
`games/rust/data`. Un dato generado que esté mal no se edita a mano en el JSON:
se anota acá para corregirlo en el extractor.

## Pasos

1. [x] Rust con las reglas de rendimiento (`LazyRows`, imágenes, `perf.mjs`,
   build medido).
2. [x] Rust · Cajas: qué trae cada caja (`loot.json`).
3. [ ] Rust · Tiendas: qué vende cada monumento (`shops.json`).
4. [ ] Rust · Reciclador: qué da cada objeto, ordenado por chatarra.
5. [x] Auditoría Valheim.
6. [x] Auditoría D2R.
7. [x] Auditoría Zomboid.

## Bitácora

- `main` mergeado en `feat/rust` sin conflictos; `tsc` limpio; tests como en
  `main` (sólo falla `deadlockBuilds.test.ts`, que ya fallaba).
- Paso 1: `LazyRows` en Objetos de Rust y `decoding="async"`. Build con
  Rust: `vite build` 99 s, 2,3 GB, 24.292 páginas. `npm run perf` en verde;
  Objetos de Rust: 148 pedidos, 731 nodos al abrir.
- Cajas contra la wiki oficial (wiki.facepunch.com/rust/elite-crate), caja de
  élite: chatarra, HQM, fragmento avanzado, L96, LR-300, lanzacohetes, señal
  de suministro y MLRS coinciden. **Distintos:** AK y cerrojo 3,9 % (nuestro)
  vs 4,4 % (wiki); C4 y explosivos 1,9 vs 2,4; cuerpo de rifle 22,7 vs 27,7.
  Nuestros máximos son más altos porque cuentan todas las tiradas (diseño).
  No se sabe cuál está al día (la wiki dice "este año"): revisar el extractor
  (`world.py`) con el juego.
- Paso 2: pestaña Cajas (`325fe2ba`): 82 fuentes de `loot.json`, ficha por
  caja con `LazyRows`. Presupuesto en verde (élite: 91 pedidos, 534 nodos).

## Auditoría (2026-10-06)

Comparado contra la wiki oficial de cada juego y las notas de parche. Los
datos sacados del juego están, en general, muy bien.

### Corregido

- **D2R** (`d50ae8d6`, `0533bb82`):
  - stats por nivel sin parámetro salían "+0": Fortaleza ahora +(1-148) de
    vida, Hoja +(2-198) de defensa, Griswold +(0-24) absorbe frío;
  - la Antorcha del Infierno decía "+(0-7)" a una clase al azar: ahora +3;
  - los nueve únicos que cambió la 3.3 muestran "Sólo en Clasificación";
  - Uber Diablo: aparece vendiendo Piedras de Jordán, no con "Terror is
    unleashed".
- **Valheim** (`ac676893`):
  - el máximo del botín de criaturas sobraba en uno (el juego usa
    `Random.Range` exclusivo): 110 filas, en `records.py` y en los datos;
  - Yagluth pide 5 tótems, no 3 (`fixes.py`);
  - las hexen en femenino; fuera una teoría de fans presentada como dato.
  - `site.py` no se pudo volver a correr: pide la copia local de la wiki en
    `/root/Desktop/valheim-wiki`. Los JSON de `data/site` se tocaron sólo en
    esos valores; conviene correr `site.py` en la máquina de ZoTaD y ver que
    no cambie nada más.
- **Zomboid** (`c2153332`): "Kirsty Kormick" (decía Cormick), el tope de XP
  de VHS y TV es configurable (`LevelForMediaXPCutoff`), "jugadores de
  bowling".

### Pendiente (necesita el juego o una decisión)

- **Rust, cajas:** la wiki oficial da otras probabilidades para AK y
  cerrojo (4,4 % vs 3,9 %), C4 y explosivos (2,4 vs 1,9), cuerpos de rifle y
  de sub-fusil (27,7 vs 22,7 / 33). Revisar `world.py` con el juego.
- **Valheim:** los tooltips en español de los poderes de la Reina, Yagluth,
  Fader y el Anciano no describen su poder (vienen de la traducción del
  juego): conviene una corrección a mano con fuente.
- **D2R:**
  - faltan las seis joyas de los Ancestros colosales en Únicos y Grial
    (`wiki.py` salta las no `spawnable`);
  - faltan las tablas especiales de breakpoints (FCR de Rayo de la
    hechicera, FBR de Escudo sagrado, formas del druida): las calcula
    `wiki.py` desde el juego;
  - la Runa Hel muestra "Nivel requerido: 0".
- **Zomboid:** errores de la traducción oficial al español ("Forjar 5
  clavos" que da 10, moodles repetidos, la bolsa de senderismo grande como
  "bolsa de lona", recetas sin nombre en español). No hay un mecanismo de
  correcciones al español en `games/zomboid/tools`: sumarlo y volver a
  extraer.
