# Rust — etapa 2, planes 6 y 7: Agua e Industrial en el editor — Implementation Plan

> Lo ejecuta un solo agente, tarea por tarea, con TDD. Sigue a `2026-10-09-rust-electricidad.md` (mismo motor, mismo
> editor, mismas reglas de la casa y de rendimiento). Pasos con casillas (`- [ ]`).

**Goal:** que el editor de `/en/rust/electricity` simule también las redes de agua e industrial, con sus circuitos
listos (riego de granja, purificador con bomba, clasificador, horno automático, autocrafteo) en páginas EN/ES.

**Decisión de diseño (la tomó el coordinador, 9/10, ZoTaD no estaba):** cada parte tiene una **altura opcional** en
el inspector (metros; 0 por defecto = todo al mismo nivel). El motor aplica la regla del juego tal cual
(`IOEntity.AllowLiquidPassthrough`): el agua pasa si el enchufe de origen está más alto que la entrada de destino, o a
menos de `LiquidPassthroughGravityThreshold` (1 m) de diferencia; lo que el juego exime (un contenedor con energía, como
la bomba; el interruptor de fluidos con la bomba prendida) queda eximido. El inspector y "explicar" lo dicen con la
altura de cada uno. El agua dulce y la salada son datos del agua que circula (el purificador la convierte). En el link
la altura va sólo si no es 0.

## Fuente

Decompilado público github.com/MillionthOdin16/RustChangelog (rama `release`, 2024-08-03): `IOEntity.cs`
(`AllowLiquidPassthrough`, `FindGravitySource`, `UpdateOutputs` con la regla de gravedad, `FindContainerSource`),
`LiquidContainer.cs`, `WaterPump.cs`, `WaterCatcher.cs`, `WaterPurifier.cs`, `PoweredWaterPurifier.cs`,
`Sprinkler.cs`, `FluidSwitch.cs`, `Splitter.cs`, `ElectricalCombiner.cs`, `IndustrialEntity.cs`,
`IndustrialConveyor.cs`, `IndustrialCrafter.cs`, `IndustrialStorageAdaptor.cs`, `StorageContainer.cs`, `BaseOven.cs`.
Números de los prefabs y de `WaterCatcherCollectRate` de la caché del build 25797961.

## Agua: lo que dice el código

- El agua viaja como **objeto en el inventario** de cada `LiquidContainer` (bomba, barril, colectores, purificador y
  su depósito), de a una pila de un solo tipo (dulce o salada: dos tipos no se mezclan en una ranura).
- El número del cable es el **caudal**: `GetCurrentEnergy` = `min(agua guardada, maxOutputFlow)` y se propaga como la
  energía, salvo que la gravedad lo corte en `UpdateOutputs`.
- **Empuje** (`autofillOutputs`): cada `autofillTickRate` (2 s) el contenedor reparte `autofillTickAmount` (24) entre
  los contenedores que alcanza aguas abajo (`CheckPushLiquid`, hasta 12), si la gravedad deja; no empuja durante 10 s
  después de recibir agua en una ranura vacía.
- **Consumo** (`CalculateDrain` + `DeductFuel`): cada 1 s descuenta lo que piden los que están aguas abajo (el aspersor
  pide 2), con tope en `maxOutputFlow`.
- Bomba: con energía (5) agrega `AmountPerPump` (85) cada `PumpInterval` (10 s), salada o dulce según dónde está
  (ajuste de la parte). Colector: 1 al aparecer y cada 60 s `ceil(maxItemToCreate × (base + niebla × fogRate + lluvia ×
  rainRate + nieve × snowRate))` (afuera). Purificador con energía (5): cada 5 s convierte `waterToProcessPerMinute`
  (4.000/min) a razón `freshWaterRatio` (2:1) hacia su depósito (otra entidad, con su "Water Out").

## Industrial: lo que dice el código

- La cinta (`IndustrialConveyor`) con energía (1) y prendida mueve cada `server.conveyorMoveFrequency` segundos: busca
  las entradas y salidas de la red (`FindContainerSource`, pasando por splitters y combinadores industriales) y pasa
  de cada entrada a cada salida hasta `MaxStackSizePerMove` ÷ cantidad de salidas por pila, con filtros (objeto o
  categoría, modos Cualquiera/Y/No, máximo en destino, mínimo en origen, tanda). Sus salidas "Filter Pass" y "Filter
  Fail" dicen si algo pasó el filtro.
- Las cajas, hornos y demás se enchufan con el adaptador de almacenamiento; cada uno tiene sus rangos de ranuras de
  entrada y salida. El crafteador industrial craftea con los planos que tiene y deja el resultado en sus ranuras de
  salida.

## Dudas (anotadas, no inventadas)

1. ~~`server.waterContainersLeaveWaterBehind`~~ **Resuelta:** es `false` por defecto (`ConVar/Server.cs`).
2. ~~El aspersor pide 2 por segundo en el decompilado; el prefab actual dice 15 por salpicada cada 5 s~~ **Resuelta
   (9/10):** no se contradicen, son dos cosas distintas y las dos valen hoy. `ConsumptionAmount` (2) es lo que el
   aspersor le pide por segundo a la fuente; `WaterPerSplash` 15 cada `SplashFrequency` 5 s es lo que reparte entre lo
   que moja (macetas, piletas, jugadores). El manual de rustrician.io (act. 16/8/2026,
   https://www.rustrician.io/wiki/powerstorage.html) lo midió igual: consumo promedio 2 ml/s (120 por minuto) y salida
   promedio 3 ml/s (15 por ciclo de ~5 s); la wiki de rustlabs da los mismos números. El código del servidor dedicado (build 25823813) confirma
   `ConsumptionAmount` 2 y cambia `DesiredPower`: ahora pide 2 o nada (antes, lo que le llegara con tope en 2); portado
   en `water.ts` con test.
3. El purificador sin energía (necesita fuego) queda afuera: el editor no tiene fuego.
4. ~~Valores por defecto de las convars industriales~~ **Resuelta** (`ConVar/Server.cs`): `conveyorMoveFrequency` 5 s,
   `industrialCrafterFrequency` 5 s, `maxItemStacksMovedPerTickIndustrial` 12, `industrialAllowQuickMove` sí.
5. **Datos de fundir y hornos:** no estaban en la caché; salieron del juego instalado (build 25797961) con
   `games/rust/tools/extract_industrial.py` a `games/rust/cache/industrial/` (tiempos y temperaturas de
   `ItemModCookable`, combustible de `ItemModBurnable`, ranuras y velocidad de cada `BaseOven`, ranuras de cada caja).
6. **Carbón:** el juego tira un dado por cada leño (`Random > byproductChance` → 75 %); el simulador lo hace sin azar
   (un carbón cada vez que se juntan 0,75 + 0,75…), así da lo mismo en promedio y los tests son reproducibles.
7. **Cajas y hornos con adaptador:** el adaptador es otra entidad puesta sobre el contenedor; en el editor van juntos en
   una parte. El horno eléctrico queda afuera (su energía entra por otra entidad hija, `ElectricFurnaceIO`).
8. **La cinta busca orígenes y destinos en cada vuelta** (el juego lo hace cuando cambia la red): mismo resultado.
9. **El horno no se prende vacío** (`StartCooking` pide combustible) y se apaga cuando se le acaba: un horno automático
   arranca con algo de leña adentro, como en el juego.

## Tareas

### Agua
- [x] **W1.** Datos: componentes de agua (`net` por enchufe, altura de cada enchufe `h`, `ioType`, parámetros de
  contenedor/bomba/colector/purificador/aspersor, depósito hijo del purificador, tasas del colector). Tests Python.
- [x] **W2.** Motor: altura por parte, regla de gravedad en `UpdateOutputs`, `FindGravitySource`,
  `AllowLiquidPassthrough`, inventario de agua (tipo + cantidad). Tests.
- [x] **W3.** `LiquidContainer` (caudal, empuje, consumo), bomba, colector, barril, splitter/combinador de agua,
  interruptor de fluidos, aspersor, purificador + depósito. Tests con casos del código.
- [x] **W4.** Explicar, avisos (el agua no sube), codec v2 (altura, salada, lluvia/niebla/nieve; la v1 sigue abriendo).
- [x] **W5.** Editor: altura y agua en el inspector, lluvia/niebla en la barra, categoría "Agua" en la paleta.
- [x] **W6.** Circuitos listos: riego de granja, purificador con bomba, colector a barril. Páginas y tests.

### Industrial
- [x] **I1.** Datos: cinta, crafteador, adaptador, splitter/combinador industrial, cajas y hornos con sus rangos de
  ranuras; objetos (pila y categoría) y recetas.
- [x] **I2.** Motor: inventarios de objetos, `FindContainerSource`, cinta con filtros y modos, salidas de filtro.
- [x] **I3.** Horno (fundir con combustible) y crafteador industrial. Tests con casos del código.
- [x] **I4.** Codec (contenidos de cajas y filtros), editor (contenido e filtros en el inspector), explicar.
- [x] **I5.** Circuitos listos: clasificador, horno automático, autocrafteo. Páginas y tests.

### Cierre
- [x] **Z.** vitest entero, Python, build (tiempo y RAM), perf con las páginas nuevas, capturas.

## Resultados (2026-10-09)

- **Componentes:** 94 en el editor (+8 de agua con el depósito oculto del purificador, +8 industriales, +1 poste de
  tendido de Power Trip con salida ajustable). `industrial-items.json` (155 KB, 27 KB gzip) se baja aparte, sólo en la
  pestaña.
- **Circuitos listos:** 22 (15 de energía, 4 de agua: riego de granja, purificador con bomba, colector a barril,
  interruptor de fluidos como bomba; 3 industriales: clasificador, horno automático, autocrafteo), 44 páginas EN/ES.
- **Tests:** 16 del motor de agua, 11 del industrial (60 por pila cada 5 s, 30 y 30 con dos destinos, filtros y modo
  No, máximo en destino, horno: 18 fragmentos y 22 de carbón en 60 s con 30 leños, crafteador: 10 de pólvora por tanda
  y bloqueo por nivel de banco), drenaje del parche de marzo 2024 y poste de tendido; vitest entero 145 archivos en
  verde; Python 16 de `test_electricity.py` (con `RUST_CACHE=1`) y la suite entera en verde.
- **Build:** 119 s el comando (`vite build` 1 min 42 s), 24.342 páginas, pico de RAM 2,48 GB.
- **Perf** (frío, 1.400 × 900):

  | Página | Pedidos | Imágenes | Nodos |
  | --- | ---: | ---: | ---: |
  | `/en/rust/electricity` | 78 | 49 | 849 |
  | `/es/rust/electricidad` | 78 | 49 | 850 |
  | `/en/rust/electricity/battery-backup` | 83 | 54 | 953 |
  | `/en/rust/electricity/farm-irrigation` | 81 | 52 | 900 |
  | `/es/rust/electricidad/horno-automatico` | 81 | 52 | 965 |
