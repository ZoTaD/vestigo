# Rust — etapa 2, plan 1: Electricidad (editor y simulador) — Implementation Plan

> Lo ejecuta un solo agente, tarea por tarea, con TDD (test primero). Pasos con casillas (`- [ ]`).

**Goal:** que `/en/rust/electricity` y `/es/rust/electricidad` existan: un editor libre de circuitos (React Flow) con
un simulador que reproduce el comportamiento del juego, guardado en el link (`#hash`) y en el navegador, y 12-20
circuitos listos con página prerenderizada propia (`/en/rust/electricity/<slug>`, `/es/rust/electricidad/<slug-es>`).
Diseño y decisiones de ZoTaD: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, sección 1.

**Architecture:**
- **Datos:** `games/rust/tools/electricity.py` lee `games/rust/cache/io/prefabs.json` (enchufes con `niceName`, tipo y
  `mainPowerSlot`; campos de cada clase) y `games/rust/data/items.json` (nombre, slug y receta), le suma lo que el
  cliente no trae (`electricity_overrides.py`: consumos que son código, categoría de la paleta, parámetros
  configurables y su rango, con la fuente) y escribe `games/rust/data/electricity.json` (~30 KB). Sólo corre con la
  caché presente; el JSON se versiona.
- **Motor (`site/src/rust/electric/engine/`, TS puro):** un **port línea por línea** de `IOEntity` y de cada clase del
  juego (no un modelo propio). El juego es de *empuje*: cada entidad calcula `GetPassthroughAmount(slot)` con lo que le
  entra y llama `UpdateFromInput` del vecino; las entidades se encolan y `ProcessQueue` las procesa por cuadro, con
  `responsetime` = 0,1 s entre dos actualizaciones de la misma entidad (eso da los relojes y los parpadeos). Los
  `Invoke`/`InvokeRepeating` del juego (batería cada 1 s, temporizador cada 0,1 s, botón, sensor sísmico 3 s, solar
  cada 5 s, viento cada 20 s…) van en un planificador con tiempo simulado. `tick(world, dt)` avanza en cuadros de 1/30 s.
  Determinista: los `InvokeRandomized` usan el intervalo sin azar.
- **Explicar:** `explain.ts` arma frases con datos (EN/ES) a partir del estado de la entidad y de su clase.
- **Editor (`site/src/rust/electric/editor/`):** React Flow (`@xyflow/react` 12.12.0, MIT) con nodos casillero propios
  (estilo A+B: casillero de inventario con el ícono; los nombres de enchufe aparecen al seleccionar o pasar el mouse),
  paleta por categoría con buscador, inspector con datos, configuración y "explicar", barra con play/pausa, x1/x5/x20 y
  hora del día, deshacer/rehacer propio, borrar/duplicar/selección múltiple, avisos, lista de materiales. Celular:
  sólo lectura (abrir, tocar interruptores, play, inspector).
- **Guardado:** `codec.ts`: versión + partes + cables en binario compacto → `deflate-raw` (`CompressionStream`) →
  base64url en el `#hash`. Autoguardado en `localStorage` con try/catch.
- **Circuitos listos:** `circuits.ts` con slug en/es, título, explicación y el circuito como objeto (el codec sólo para
  el link). Cada uno con página prerenderizada que abre el editor con ese circuito.

**Tech Stack:** Python 3.14, React 18 + Vite 5 + TypeScript, Vitest, `@xyflow/react` 12.12.0.

## Fuente del comportamiento

El cliente no trae el código (IL2CPP). El comportamiento sale del decompilado público
**github.com/MillionthOdin16/RustChangelog** (rama `release`, último push **2024-08-03**), archivos `IOEntity.cs`,
`ElectricBattery.cs`, `Splitter.cs`, `ElectricalBranch.cs`, `ElectricalCombiner.cs`, `ElectricalBlocker.cs`,
`ANDSwitch.cs`, `ORSwitch.cs`, `XORSwitch.cs`, `ElectricalDFlipFlop.cs`, `RANDSwitch.cs`, `PowerCounter.cs`,
`TimerSwitch.cs`, `CustomTimerSwitch.cs`, `ElectricSwitch.cs`, `SmartSwitch.cs`, `PressButton.cs`, `BaseDetector.cs`,
`HBHFSensor.cs`, `LaserDetector.cs`, `PressurePad.cs`, `SeismicSensor.cs`, `SolarPanel.cs`, `ElectricWindmill.cs`,
`FuelGenerator.cs`, `ElectricGenerator.cs`, `AutoTurret.cs`, `SamSite.cs`, `StorageMonitor.cs`, `RFBroadcaster.cs`,
`RFReceiver.cs`, `CableTunnel.cs`, `ReactiveTarget.cs`, `TeslaCoil.cs`, `Igniter.cs`, `DoorManipulator.cs`,
`CustomDoorManipulator.cs`, `DeployableBoomBox.cs`, `Telephone.cs`, `CCTV_RC.cs`, `SearchLight.cs`, `ElectricalHeater.cs`,
`CeilingLight.cs`, `NeonSign.cs`. Cada behavior cita su archivo en el comentario de cabecera. Los números de los
prefabs (salida de las baterías, consumo cuando es un campo, duración del botón, etc.) salen de la caché del build
25797961 (8/10/2026), que manda sobre el decompilado cuando los dos tienen el dato.

### Lo que el código dice (y la comunidad a veces cuenta distinto)

- **El reparto es por empuje, no por pedido.** El splitter reparte lo que entra en partes iguales entre las salidas
  *conectadas* (división entera; el resto va a las primeras), sin mirar lo que pide cada una. El sobrante se pierde.
- **La batería siempre empuja su `maxOutput`** (15/50/100) mientras tenga ≥ 1 rWs y esté descargando; lo que se
  descuenta de la carga (`activeDrain`) es la suma de `DesiredPower` de todo lo que cuelga de su salida, recorrido por
  `AddConnectedRecursive`, con tope en `maxOutput`. Se recalcula cada 1 s (`CheckDischarge`). Carga: cada 1 s suma
  `min(lo que entra, DesiredPower) × chargeRatio (0,8)`; `DesiredPower` de la batería = `min(entra, 4 × maxOutput)`.
- **Consumo 0** en splitter, rama, combinador, bloqueador, interruptores (simple e inteligente), botón, temporizador,
  contador, AND/OR/XOR, celda de memoria, placa de presión, generadores y baterías. Los demás que no lo cambian pagan
  el `ConsumptionAmount()` de `IOEntity`, que es **1** (HBHF, láser, sísmico, RF, controlador de puertas, alarmas,
  monitor de almacenamiento, túnel de cables…). Torreta 10, SAM 25, reflector 10, CCTV 3, calefactor 3, rocola/boombox
  10, Tesla `ceil(35 / 1,4)` = 25 con los números del prefab actual.
- **Paso de corriente:** `GetPassthroughAmount` por defecto = `(entra − consumo) ÷ salidas conectadas`. Las luces
  pasan lo que les sobra.
- **Compuertas:** AND da `max(A, B)` si las dos tienen; OR `max(A, B)`; XOR `max(A, B)` si sólo una tiene. La celda de
  memoria pasa lo que entra por "Power In" a "Output" o a "Inverted Output" según su estado; con Set y Reset a la vez
  queda prendida.

## Dudas (no se inventan; quedan anotadas y visibles en el código)

1. **El decompilado es de agosto de 2024.** Clases nuevas sin código: `DigitalClock`, `ElectricWaterWheel`, `Fridge`,
   `StringLights`, `Chandelier`, `OrientableLight`, `ChristmasLights`, `Hopper`, `BiofuelGenerator`. Las que tienen el
   consumo como campo del prefab (heladera 5, minibar 2, luces 1…) usan ese campo con la lógica de `IOEntity`; la rueda
   de agua usa `maxPowerGenerationFromWater` (30) como generador fijo; el reloj digital, el biocombustible y la tolva
   quedan **afuera** de la paleta hasta tener su código.
2. **Salida "Fully Charged" de la batería** (feb. 2025, posterior al decompilado): no hay código. Se simula como las
   salidas de estado de la torreta (`min(1, …)`): 1 cuando la carga llega al máximo. Marcada como aproximación.
3. **Sol:** el juego usa `TOD_Sky` y el ángulo del panel (`dot` entre el frente del panel y el sol, de 0,3 a 0,7). El
   editor modela el panel bien orientado y la altura del sol como `sin(π·(h − 6) / 12)` entre las 6 y las 18; de noche,
   0. Es aproximado (latitud y orientación reales cambian la curva).
4. **Viento:** `clamp01(altura/50 × 0,5 + ruido)`; el ruido Perlin del juego se reemplaza por un control "ráfaga"
   (0-1, 0,5 por defecto) y la altura sobre el terreno por un control (m).
5. **Cuadros por segundo del servidor:** 30. El orden de procesamiento dentro de un cuadro es el de la cola del juego,
   pero el tope de milisegundos por cuadro no se emula (procesa toda la cola, con un tope de seguridad).
6. **Interruptor y temporizador con consumo 0:** el decompilado dice 0; rustlabs y la wiki dicen 1. Se sigue el código.
7. **HBHF / sensores / torreta / SAM:** lo que detectan lo pone el usuario en el inspector (jugadores, objetivo,
   munición), no hay mundo.

## Global Constraints

- Inglés primero, español a la par; nunca vender "en español". Títulos: "Rust electricity simulator", "Rust <circuito>
  circuit" / "Simulador de electricidad de Rust", "Circuito de <…> en Rust".
- Sin bordes de color en tarjetas ni filas (tinte, texto o cifra). Las palabras no se cortan (container queries).
- Nada en la UI de dónde salen los datos.
- React Flow y el motor sólo en el chunk de la pestaña (`import()`); los datos por `import()`.
- RAM: nunca dos builds ni dos procesos pesados a la vez (en `vestigo-rust-granjas` trabaja otro agente).
- Tests de TS: `npx vitest run <archivo>` desde `site/`. Python: `python -m unittest discover -s games/rust/tools/tests`.
- Worktree `C:\Users\Zotad\Desktop\vestigo-rust-elec`, rama `feat/rust-electricidad`, servidor `vestigo-rust-elec`
  (puerto 5184). Sin push ni merge.

## Tareas

### Datos
- [ ] **1.** `electricity_overrides.py` (consumos de código con fuente, categorías, parámetros, exclusiones) y
  `electricity.py` → `electricity.json`. Tests (`test_electricity.py`): forma del JSON sin caché; con la caché
  (`RUST_CACHE=1`): ningún componente sin consumo o generación, y los números conocidos (solar 20, molino 150, rueda 30,
  generador 40, baterías 15/50/100 y 400/9.000/24.000 rWm, torreta 10, SAM 25).

### Motor
- [ ] **2.** `engine/world.ts`: entidades, flags, cola por cuadro, planificador de `Invoke`, `tick`. `engine/ioentity.ts`:
  port de `IOEntity` (UpdateFromInput, UpdateOutputs, ShouldUpdateOutputs, GetPassthroughAmount, DesiredPower,
  UpdateHasPower, IsFlickering, IsConnectedTo, SendChangedToRoot, ConnectTo, Disconnect, ClearConnections, Init).
  Tests: luz encadenada, división entre salidas, propagación en el mismo cuadro, `responsetime`.
- [ ] **3.** Fuentes: generador de prueba, generador a combustible (on/off, combustible), solar (hora), molino (viento),
  rueda de agua. Tests con números conocidos.
- [ ] **4.** Baterías: carga, descarga, drenaje recursivo, 5 rWs mínimos, "Fully Charged". Tests: batería mediana con
  torreta + luz drena 11; panel 20 carga 16 por segundo; batería en serie.
- [ ] **5.** Reparto: splitter (resto a las primeras), rama, combinador (corto si se realimenta), bloqueador. Tests.
- [ ] **6.** Lógica: AND, OR, XOR (corto), celda de memoria, RAND, contador, temporizador, interruptores, botón,
  túnel de cables. Tests por tabla de verdad y por tiempo (temporizador 10 s, botón 1 s + pulso).
- [ ] **7.** Sensores y consumidores especiales: HBHF, láser, placa, sísmico, monitor, RF emisor/receptor, torreta y
  SAM (salidas de estado), controlador de puerta, blanco reactivo, Tesla, encendedor, rocola. Tests.
- [ ] **8.** `explain.ts` (EN/ES) y `issues.ts` (enchufe de tipo distinto, consumidor sin energía, corto). Tests.

### Guardado y circuitos
- [ ] **9.** `codec.ts` (binario versionado + deflate-raw + base64url; versión vieja abre) y autoguardado. Tests.
- [ ] **10.** `circuits.ts`: 12-20 circuitos listos. Test: cada uno carga, simula y da el resultado esperado
  (torreta prendida, puerta abre, etc.).

### Sitio
- [ ] **11.** Ruta `electricity` (+ slug de circuito), `RUST_SECTIONS`, `RUST_PUBLISHED`, `RUST_TAB_FILES`, `TABS`,
  copia EN/ES, SEO, prerender (con los nombres de los circuitos) y sitemap. Tests de ruta/sitemap/SEO.
- [ ] **12.** Editor: lienzo, nodos, paleta, inspector, barra, deshacer, selección, materiales, celular sólo lectura.
  Conectar en localhost (puerto 5184) apenas se vea.
- [ ] **13.** Fichas de Objetos: bloque "Electricidad" (enchufes, consumo, generación) con "Probar en el editor".
- [ ] **14.** Portada: pestaña Electricidad activa; encabezado ES "Guía de Rust" (arreglo de paso del diseño).
- [ ] **15.** Verificación: vitest entero, Python, `npm run build` (tiempo y RAM), `npm run perf` con las páginas
  nuevas, capturas EN/ES, editor, circuito listo y celular.

### Si queda cuerda
- [ ] **16.** Agua (sección 6) con el mismo motor. **17.** Industrial (sección 7).

## Resultados

(se completa al terminar)
