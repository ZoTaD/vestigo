# ProBuilds — Documento de Diseño

- **Fecha:** 2026-07-22
- **Proyecto:** Plataforma para trackear builds y estrategias de juegos.
- **Primer juego:** Teamfight Tactics (TFT).

---

## 1. Visión

El producto es un **motor de recomendaciones contextuales**: no guías genéricas
("la build del top 1 coreano"), sino *"esta build para **esta** partida"*, según
lo que está pasando ahora.

La lectura de pantalla / overlay es **solo una de las fuentes de contexto**, no el
objetivo en sí. El corazón del producto es el motor que recomienda.

---

## 2. Alcance y fases

**Orden de construcción** (definido con el usuario): primero juntamos datos, después
la interfaz para verlos, después el motor, y el overlay al final.

| Fase | Qué | Estado |
|------|-----|--------|
| **1 — Datos** | Pipeline: pull de partidas high-elo de la Riot API → agregación → base de **comps + stats**. | ✅ **Hecho** — 475 partidas / 3758 tableros / 36 comps |
| **2 — Interfaz** | "Meta browser": tier list + detalle de comp + recetas de ítems. | ✅ **Hecho** (tema Códex) |
| **3 — Buscador y analizador** *(siguiente)* | Buscar jugador por Riot ID → historial → al abrir una partida, **qué se pudo hacer mejor** contra la comp que estaba armando. | Solo Riot API. Endpoints verificados. |
| **4 — Motor** | El cerebro: componentes → mejor ítem armable, con **contención de recursos**. Conclusiones concretas, nunca genéricas. | Solo nuestra data. |
| **5 — Overlay en vivo** | App de escritorio con **ow-electron + GEP**: posiciones, rondas, oro, tablero rival. | 🔒 **Bloqueado** — esperando aprobación de Overwolf |
| **6 — Deadlock** | Mismo motor, módulo de juego nuevo. GEP ya lo soporta (ID 24482). | Después de cerrar TFT. |

### Ideas de producto que nos diferencian

- **Análisis de comps disputadas:** al abrir una partida, mirar **también a los otros 7
  jugadores**. Si alguien estaba armando la misma comp, te robó los campeones de la
  tienda — eso explica por qué no llegaste a 3★. Ningún competidor lo dice.
- **Escala de datos:** con una *production key* de Riot (más requests/día) el pipeline
  puede acumular muchísimas más partidas. Pedirla al publicar el sitio.
- **Supabase** entra cuando el volumen supere el almacenamiento local.

**Regla de oro:** nada de datos hardcodeados. El Set 18 "Enchanted Wilds" está por
salir; el set cambia todo el juego, así que todo se **refresca solo**.

### Qué da la API y qué no (importante)

La Riot Match API entrega el **board final** de cada jugador — no la progresión ni
las posiciones en el tablero:

| Se arma solo desde la API | Necesita el overlay (Fase 4) o curado manual |
|---|---|
| Tier list de comps | Posicionamiento en el tablero |
| Comp: unidades + ítems + estrellas | Build path ronda por ronda |
| Augments más usados | Prioridad de carrusel |
| Stats (avg place, top4%, winrate, pickrate) | Tips pro |

**Decisión:** el posicionamiento y las build paths ronda-por-ronda se **difieren al
overlay** (Fase 5). **Actualización importante:** ya NO hace falta visión por
computadora — el **Game Events Provider de Overwolf** entrega esos datos ya
estructurados (`board_pieces` con coordenadas de grilla, `opponent_board_pieces`,
`round_type`, `gold`, `carousel_pieces`). Se descartó por completo el camino de
Python + OpenCV + Tesseract. Ver sección 11.

La interfaz de Fase 2 muestra lo auto-derivable, que ya es ~70%
de una página de comp típica.

---

## 3. Arquitectura

- **Cada juego = un cerebro aislado.** Un bug de TFT no puede tocar a otro juego.
  Solo se comparte la "carrocería tonta" (captura de pantalla, UI kit).
- **Captura (compartida, agnóstica):** saca screenshots. No sabe qué juego es.
- **Lectura (por cerebro):** solo el cerebro de TFT sabe interpretar una captura de TFT.

### Estructura de carpetas

```
ProBuilds/
├─ games/                   ← cada juego, 100% aislado
│  └─ tft/                  ← EL CEREBRO DE TFT
│     ├─ data/              ← estáticos (CDragon) + comps generadas   [Fase 1-2]
│     ├─ pipeline/          ← Riot API → agrega comps + stats          [Fase 1]
│     ├─ ui/                ← meta browser: tier list + detalle (React) [Fase 2]
│     ├─ engine/            ← motor de recomendación                   [Fase 3]
│     └─ vision/            ← lee capturas de TFT → estado             [Fase 4]
│
├─ shared/                  ← la "carrocería" compartida
│  └─ capture-engine/       ← Python: screenshots (agnóstico)          [Fase 4]
│
└─ desktop/                 ← Tauri: envuelve todo en escritorio       [Fase 4]
```

Agregar Deadlock más adelante = crear `games/deadlock/` al lado, sin tocar TFT.

---

## 4. Componentes del cerebro de TFT

- **`data/matches/`** — el **store acumulativo**: un JSON por partida, con los
  tableros ya normalizados. Crece con cada pull. Local, fuera de git. [Fase 1]
- **`data/comps.json`** — la salida derivada que consume la UI. [Fase 1-2]
- **`pipeline/`** — dos comandos separados a propósito: [Fase 1]
  - `npm run pull` → Riot API → guarda partidas nuevas en el store (saltea las
    que ya tiene, así no gasta rate limit al pedo).
  - `npm run build:comps` → lee todo el store → agrega → `comps.json`. Sin red,
    corre en milisegundos.
- **`ui/`** — React: tier list + detalle de comp. [Fase 2]
- **`engine/`** — motor de recomendación (lógica pura, testeable). Depende de una
  **fuente de comps abstracta** (interfaz), no de su implementación. [Fase 3]
- **`vision/`** — interpreta capturas de TFT → estado del juego. [Fase 4]

### Qué ES una comp (decisión clave)

Una comp se identifica por su **trait dominante + su carry principal**
(ej. `SpaceGroove Blitzcrank`) — igual que se las nombra en la comunidad.

- **Trait dominante:** el trait activo de mayor breakpoint. Se **descartan** los
  traits "unique" por campeón (`tierTotal === 1`), porque cada campeón trae uno y
  no definen nada.
- **Carry principal:** la unidad con más ítems. Los ítems son la señal correcta,
  **no** el costo: en datos reales apareció un Nasus de 1 costo, 3★ con 3 ítems,
  siendo claramente el carry.

**Por qué así:** el primer intento definía la comp como "el conjunto exacto de sus
unidades 2★+". Contra datos reales (1473 tableros) eso se fragmentó en 59 grupos
de n=3-5 — ruido puro, con dos "comps" distintas que diferían en una sola unidad.
Con trait+carry: 17 comps, n mediana 44, y señal real de 2.12 a 5.41 de posición
promedio.

---

## 5. Fuentes de datos

| Qué necesitamos | De dónde |
|---|---|
| Imágenes de ítems y campeones | CommunityDragon (assets) |
| Qué hacen los ítems (efectos) | CDragon `en_us.json` |
| Recetas (2 componentes → ítem) | CDragon `en_us.json` → campo `composition` |
| Campeones (costo, traits, habilidad) | CDragon `en_us.json` |
| Traits y augments | CDragon `en_us.json` |
| Comps + stats | Riot Match API (las computamos nosotros) |

- **CommunityDragon = fuente primaria de TFT** (Riot dejó de actualizar Data Dragon
  para TFT; quedó en el Set 9). URL:
  `https://raw.communitydragon.org/latest/cdragon/tft/en_us.json` — `/latest/` =
  parche actual, se auto-actualiza. No pide key.
- **Atajo posible:** repos como `ngocleek/tft-assets` empaquetan todo actualizado a diario.
- **Comps (Riot Match API):** `tft-league-v1` (Challenger/GM) → PUUIDs →
  `tft-match-v1` (board final de cada jugador) → **agregamos** → nuestras comps (con
  nombres puestos por nosotros). Requiere `RIOT_API_KEY`.

---

## 6. Almacenamiento y seguridad

- **Fase 1: almacenamiento local** (JSON en disco para partidas y comps agregadas).
  **Supabase** después, cuando el volumen crezca o queramos cuentas.
- **`RIOT_API_KEY`:** vive en un `.env` local **gitignored**. Nunca en el código, ni
  en commits, ni en este doc. Las dev keys expiran cada ~24h; para juntar datos
  sostenido se usa una **production key** del lado del servidor.
- **El pipeline corre server/script-side (Node)**, nunca desde el navegador (por CORS
  y para no exponer la key). El navegador solo lee el JSON resultante.

---

## 7. Manejo de errores (consideraciones)

- **Fuentes externas caídas o cambiadas** (CDragon, Riot API): tolerar el fallo y
  cachear la última data buena en vez de romper.
- **Cambio de set** (Set 18 inminente): la data se refresca sola vía `/latest/`, pero
  el parser tiene que aguantar cambios de schema → validar al cargar.
- **Rate limits de Riot API:** respetarlos en el pipeline (colas / backoff). La dev
  key tiene límites bajos (ej. 20 req/s, 100 req/2min) → el pipeline va despacio.

---

## 8. Testing

- **Pipeline (Fase 1):** tests de la agregación con fixtures de partidas (dado un set
  de partidas, ¿agrupa bien las comps y calcula bien los stats?).
- **Data layer:** tests de parseo del JSON de CDragon con fixtures fijas.
- **Engine (Fase 3):** tests unitarios de la lógica pura (ítem ideal armable; ideal no
  armable → alternativa; sin componentes → no rompe).

---

## 9. Decisiones tomadas

- TFT como primer juego (terreno seguro para aprender).
- **Orden: datos → interfaz → motor → overlay.**
- Cerebros aislados por juego; solo se comparte la captura y el UI kit.
- Comps propias (opción A), computadas de partidas high-elo.
- **Una comp = trait dominante + carry principal** (ver sección 4).
- **Store acumulativo local** (un JSON por partida), con `pull` y `build` separados.
- **Posicionamiento y build paths diferidos a la Fase 4 (overlay)** — no están en la API.
- Almacenamiento local ahora; Supabase después.
- Stack: TypeScript + React. Pipeline en Node. Fase 4: Python (visión) + Tauri.

### Umbrales de tier (calibrados con datos reales)

`S ≤ 3.2 · A ≤ 3.9 · B ≤ 4.4 · C ≤ 4.9 · D > 4.9`

Los primeros umbrales fueron adivinados asumiendo que las comps se agruparían cerca
de 4.5 (el promedio de una lobby de 8). La muestra real se abrió de 2.1 a 5.4, así que
`S ≤ 4.0` metía una comp elite y una mediocre en la misma bolsa. **Recalibrar contra
datos reales, no contra intuición.**

---

## 10. Fuera de alcance (por ahora)

- Overlay en vivo y posicionamiento (Fase 5 — bloqueado por Overwolf).
- Multi-juego / Deadlock (Fase 6, después de validar TFT).
- Cuentas y nube / Supabase (cuando el volumen lo pida).

---

## 11. El overlay en vivo: ow-electron (decisión y estado)

**Descartado:** Tauri + Python + OpenCV + Tesseract. Alguien que construyó este mismo
overlay documentó por qué abandonó la lectura de memoria: *"cada parche del juego podía
romper los offsets"*. La dificultad no es construirlo, es **mantenerlo contra cada
parche** — y TFT parchea cada dos semanas.

**Elegido:** [`@overwolf/ow-electron`](https://www.npmjs.com/package/@overwolf/ow-electron)
(MIT, gratis). Fork de Electron con el Game Events Provider incorporado.

- **No requiere el cliente de Overwolf** instalado por el usuario final.
- App con marca propia, instalador propio, distribución libre.
- Nuestro React se reutiliza entero.
- TFT (21570), Deadlock (24482) y Diablo IV (22700) están entre los **57 juegos con GEP**.

**El costo real** no es dinero de entrada, es dependencia:

- Monetización atada: los ads **deben** ser los de Overwolf (70/30); suscripciones 85/15.
- **GEP está detrás de aprobación humana.** No se puede ni desarrollar sin credenciales.

**Estado al 2026-07-22:** scaffold en `desktop/` con el probe de `getFeatures()` escrito.
Al correrlo devuelve `invalid verification` — es lo esperado sin credenciales. Propuesta
de app enviada a Overwolf; **responden en ~4 días hábiles**. Si aprueban, se setean
`OW_CLI_EMAIL` y `OW_CLI_API_KEY` en `desktop/.env` (ya gitignoreado) y el probe corre.

**Si rechazan:** no se pierde nada. Todo lo de las fases 1-4 es independiente. MetaTFT
—el competidor más grande— empezó siendo solo un sitio web y sumó la app después.
