# Pestaña de héroes de Deadlock — la tabla comparable

- **Fecha:** 2026-08-13
- **Objetivo:** una pestaña donde los 38 héroes se puedan **comparar y ordenar
  por cualquier columna**, incluidas dos que ningún otro sitio publica. Es el
  paso 1 de tres; los otros dos están al final, sin diseñar.

---

## 0. Por qué no alcanza con Meta

Meta ya muestra, por héroe: winrate, pickrate, la etiqueta de dificultad, la de
tendencia, y al desplegar la fila, la build y la curva de maestría. **Una tabla
de winrate y pickrate sería copiar Meta sin los tiers**, y de paso repetir lo
que el proyecto ya rechazó: *"los ocho sitios de stats de Deadlock que existen
muestran lo mismo, winrate y pickrate; copiarlos no diferencia nada"*.

Lo que la justifica es lo que Meta **no deja hacer**:

| Pregunta | Hoy | Con la tabla |
|---|---|---|
| ¿Cuál se juega más? | Se lee héroe por héroe | Se ordena por pickrate |
| ¿Cuál premia más practicarlo? | Sólo abriendo un héroe de a uno | Columna ordenable |
| ¿Cuánto rinde más en manos buenas? | Un chip de "Difícil/Fácil" en 17 de 38 | El número, ordenable |

Meta queda como **la vista opinada** —te dice quién es S y quién es D— y Héroes
como **la cruda que ordena el visitante**. Si algún día la tabla empieza a
opinar, sobra una de las dos.

---

## 1. Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Alcance | **Sólo la tabla**, no la página por héroe ni los counters | ZoTaD, 2026-08-13. Cada paso sale usable solo. |
| Dónde | Pestaña `heroes`, **entre Meta e Items** | "Al lado de Meta" (ZoTaD). |
| URL | `/es\|en/deadlock/heroes` | El parser prueba primero si el segmento es una pestaña y recién después lo trata como slug de héroe, así que **no choca con `/deadlock/<hero-slug>`**, que ya existe. Ningún héroe se llama "heroes". |
| Detalle propio | **No.** Fuera de `DL_DETAIL_SECTIONS` | La página por héroe ya tiene URL desde el 2026-08-04 (`/deadlock/<slug>`, que abre su fila en Meta). Inventar `/deadlock/heroes/<slug>` sería una segunda dirección para la misma cosa y partiría el posicionamiento. |
| Las filas | **Linkean a `/deadlock/<slug>`** | Es la URL que ya existe y ya está en el sitemap. La tabla deja de ser un callejón sin salida sin construir nada nuevo. |
| Columnas | Héroe · Winrate · Pickrate · Dificultad · Maestría | Ver §3. |
| Partidas como columna | **No** | Es una de las tres que ZoTaD sacó el 2026-07-29 —almas, KDA y partidas— y hay tests que la dejan afuera: es el pickrate sin normalizar. Va en el `title` de la fila como muestra. |
| Tendencia como columna | **No, por ahora** | Medido el 2026-08-13: `trend` viene en **0 de 38 héroes en las cuatro bandas**. Una columna entera de guiones se lee como un dato roto. Ver §6. |
| Banda | Sigue el selector compartido | Es el que ya viaja entre pestañas para que la elección no se pierda. |
| Banda de la maestría | **Fija, y dicha en el encabezado de la columna** | Ver §3. |

---

## 2. Forma de la página

```
┌─ selector de banda (el compartido) ──────────────────────────────┐

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   ← destacados
│ MÁS      │ │ MEJOR    │ │ EL QUE   │ │ EL QUE   │
│ JUGADO   │ │ WINRATE  │ │ MÁS PIDE │ │ MÁS      │
│          │ │          │ │ NIVEL    │ │ PREMIA   │
│          │ │          │ │          │ │ PRACTICAR│
│ [retrato]│ │ [retrato]│ │ [retrato]│ │ [retrato]│
│ Lash 26% │ │ Seven 55%│ │Celeste+6,4│ │ Lash +6,8│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
   pickRate     winRate      skillGap      boost

┌─ tabla, a todo el ancho ─────────────────────────────────────────┐
│ HÉROE      WINRATE ▼  PICKRATE   DIFICULTAD   MAESTRÍA · ARC−    │
│ [] Seven     55,4%      26,5%       +4,0          +2,1           │
│ [] Lash      54,1%      18,2%        —            +6,8           │
└──────────────────────────────────────────────────────────────────┘
```

**Los destacados no son decoración**: contestan de un vistazo lo que la tabla
contesta ordenando, para quien no quiere ordenar nada. Salen del **mismo
archivo** que la tabla, así que no pueden contradecirla — hay un test que lo
fija.

**A todo el ancho y no a dos columnas.** La tabla tiene cinco columnas y una es
un nombre propio; meterla en la columna izquierda de un layout de dos con una
tarjeta de 20rem al lado es el mismo aprieto que se acaba de arreglar en la
lista de partidas del perfil.

---

## 3. Las columnas, y qué dicen cuando no hay dato

| Columna | De dónde | Cobertura medida (corrida del 2026-08-13 23:08 UTC) |
|---|---|---|
| Winrate | `heroes.<banda>.json` → `winRate` (encogido) | 38/38 |
| Pickrate | `pickRate` | 38/38 |
| Dificultad | `skillGap`, en puntos con signo | **30/38** |
| Maestría | `mastery.json` → `boost`, en puntos | **38/38**, de −5,3 a +8,4 |

**La cobertura se mueve entre corridas y hay que tratarla como variable**: en la
corrida anterior `skillGap` estaba en 24/38 y `boost` en 37/38. Por eso las dos
columnas se diseñan con hueco desde el principio en vez de asumir que están
completas.

**Los huecos van con una raya, nunca con un cero.** Es la regla que el proyecto
ya usa: *un cero diría "no se movió", la ausencia dice "no sé"*. **Al ordenar,
los sin dato caen al final en las dos direcciones** — si subieran al invertir el
orden, la tabla estaría diciendo que "no sé" es el valor más bajo.

### Dificultad y maestría NO son la misma pregunta

Puestas una al lado de la otra se pueden leer como sinónimos, así que se midió
antes de publicar las dos: sobre los 24 héroes que tienen los dos números, la
correlación es **r = −0,173** —o sea ninguna— y **los tres primeros de cada una
no comparten a nadie**: por dificultad van Celeste (+6,4), McGinnis (+4,0) y
Mina (+3,7); por maestría, Lash (+6,8), Yamato (+5,3) y Abrams (+4,3).

Son dos cosas distintas y la copia tiene que dejarlo claro:

- **Dificultad** (`skillGap`): cuánto más rinde **en manos de un jugador bueno**
  — la diferencia entre Fantasma+ y Arcanista−. Habla del nivel de la persona.
- **Maestría** (`boost`): cuánto mejora su winrate **con partidas encima de ESE
  héroe**, dentro de una misma banda. Habla de las horas en el personaje.

Un héroe puede premiar el oficio general y no la práctica específica, y al
revés. Que los dos top 3 sean disjuntos es lo que hace que las dos columnas
valgan la pena; si algún día convergen, sobra una.

**La maestría no sigue al selector de banda, y la columna lo dice en su propio
encabezado** — con la banda **que declare el archivo** (`mastery.json` trae
`band`), nunca con una escrita a mano: cada corrida la elige por su cuenta y
puede cambiar. En la corrida del 2026-08-13 salió `archon-oracle`, la misma que
héroes; en la anterior era `arcanist-below` y no coincidían. No es una omisión:
`mastery.ts` mide
**dentro de una sola banda** a propósito —con el nivel de juego fijo, lo que
queda es del héroe— y publica sólo la banda por defecto. Hacerla seguir al
selector obliga a correr la medición cuatro veces sobre el snapshot, que es
trabajo de pipeline y no entra en este paso. Decirlo en el encabezado y no en
una nota al pie es lo que evita que el número parezca de la banda elegida.

---

## 4. Datos: cero pedidos nuevos, cero peso nuevo

- La tabla sale de `heroes.<banda>.json`, que `loadBand()` **ya baja para Meta**:
  cambiar de pestaña no descarga nada.
- La maestría sale de `mastery.json`, 9 KB con `import()`. Hoy se baja al abrir
  una fila de Meta; acá se baja al entrar a la pestaña.
- Nada le pega a deadlock-api. Todo es archivo publicado por el pipeline.

---

## 5. Qué se prueba

1. **Orden**: las cinco columnas ordenan bien en los dos sentidos.
2. **Huecos**: los héroes sin `skillGap` o sin `boost` quedan al final tanto
   ascendente como descendente.
3. **Coherencia**: cada destacado es el primero de la tabla ordenada por su
   columna. Es el test que impide el defecto que ya apareció dos veces en este
   proyecto: dos números de la misma página que se contradicen.
4. **Rutas**: `/deadlock/heroes` parsea a la pestaña y no a un héroe llamado
   "heroes"; `routePath` la reconstruye; el sitemap y los metadatos la incluyen
   en los dos idiomas.
5. **Cobertura**: si algún día `heroes.json` deja de traer `skillGap` para
   TODOS, el test lo canta en vez de publicar una columna vacía.

---

## 6. Lo que queda anotado, sin hacer

- **`trend` no se publica en ninguna banda** (0/38 en las cuatro, medido el
  2026-08-13). Puede ser correcto —la ventana arranca en el parche, así que no
  hay ventana previa comparable— o puede estar roto desde que la ventana sabe de
  parches. **Hay que averiguarlo**: si se arregla, la columna de tendencia entra
  sola.
- **La banda por defecto de héroes y la de maestría no coinciden**:
  `heroes.json` sale con `archon-oracle` y `mastery.json` con `arcanist-below`.
  Cada archivo elige la suya (`defaultBandFor` contra `publishedDefaultBand`), y
  pueden divergir corrida a corrida.
- **Paso 2 — la página por héroe**: enriquecer `/deadlock/<slug>`, que ya
  existe, con sus números en las cuatro bandas, su curva de maestría, sus builds
  y los mejores del mundo con él (`heroLadder.json` ya lo tiene).
- **Paso 3 — counters**: contra qué héroes rinde mejor y peor, y qué ítems lo
  frenan. Pedido de ZoTaD el 2026-07-30. Es lo que nadie más publica y
  necesita medición nueva en el pipeline; su lugar natural es la página del
  paso 2.
