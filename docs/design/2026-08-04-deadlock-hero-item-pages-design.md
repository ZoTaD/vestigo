# Páginas indexables por héroe e ítem de Deadlock

- **Fecha:** 2026-08-04
- **Objetivo:** darle una URL propia, con título y descripción propios, a cada
  héroe y cada ítem de Deadlock — hoy viven adentro de una sola página
  (`/deadlock`, `/deadlock/items`) como filas que se despliegan, así que
  Google los indexa como una página cada uno en vez de 38 + 156. Es el mismo
  mecanismo que ya usa TFT para campeones e ítems (`/tft/units/<slug>`,
  `/tft/items/<slug>`), portado a Deadlock.

**Motivación medida el 2026-08-04, en Google Search Console vía GA4**: en 90
días (todo el historial del sitio), Deadlock acumuló **23 impresiones**
contra **1.253 del sitio entero** — no por falta de interés (hay búsquedas
reales de "deadlock tier list", "sologesang tier list") sino porque Deadlock
tiene **8 URLs indexables** contra las ~360 de TFT. Los campeones e ítems de
TFT, que sí tienen página propia, traen cientos de impresiones cada uno
(`/tft/meta` sola: 202; unidades y objetos sueltos entre 1 y 48 cada uno).

---

## 1. Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Alcance | **Héroes e ítems juntos**, no por etapas | Mismo mecanismo, se construye una sola vez; es lo que pidió ZoTaD. |
| URL de héroe | `/deadlock/<hero-slug>` (sin segmento de sección, porque "meta"/héroes es la pestaña base) | Mismo patrón que `/tft/meta/<slug>`: la sección por defecto no lleva su nombre en la URL. |
| URL de ítem | `/deadlock/items/<item-slug>` | Mismo patrón que `/tft/items/<slug>`. |
| Bandas | **Solo la banda publicada por defecto** (hoy Oráculo+) tiene URL de detalle | Evita 4 páginas casi idénticas por rango compitiendo entre sí (mismo criterio que las comps de TFT) **y** es un requisito técnico: solo los datos de la banda por defecto se cargan de forma síncrona (ver §3). |
| Contenido de la página | **Ninguno nuevo** — la misma fila que ya se despliega hoy en `/deadlock` y `/deadlock/items` | El trabajo es de indexación, no de producto: URL, `<title>`, `<meta description>`, canonical y hreflang propios para algo que ya se muestra. |
| Tarjeta de build en la página de héroe | **Se deja en su estado normal de carga durante el prerender** (opción A, elegida por ZoTaD) | `builds.json` pesa 310 KB y se pide con `import()` recién al abrir la fila; adelantarlo obligaría a cargarlo para todo visitante, abra una tarjeta o no. La fila del héroe sola (nombre, imagen, winrate, chips) ya es contenido real y distinto por página. |

---

## 2. Arquitectura

Reusa la maquinaria que ya prerenderiza TFT — genérica sobre `Route`, no
sabe de campeones ni de héroes — así que el trabajo es alimentarla con datos
de Deadlock, no construir nada nuevo:

```
route.ts          → Route.detail hoy sólo existe para TFT. Se agrega el
                     mismo tercer segmento para Deadlock, en las secciones
                     "meta" (héroe) e "items" (ítem). (El plan del perfil de
                     jugador, del 2026-08-03, diseñaba esto también para
                     "player" — pero ese plan no se llegó a ejecutar, así que
                     acá se construye de cero, no se generaliza nada.)
deadlockSlugs.ts   ★ NUEVO — calco de slugs.ts: slug ↔ id para héroes e ítems.
sitemap.ts         → sitemapPaths() gana las URLs de detalle de Deadlock.
prerender.ts       → detailNames()/metaFor() resuelven slug de Deadlock →
                     nombre, y seo.deadlock.detail da título/descripción.
vite.config.ts     → seoFiles() y prerenderRoutes() leen también
                     catalog.json/heroes.json/items.json de Deadlock
                     (deadlockDir ya existe como constante, sin usar todavía
                     por estos dos plugins).
Deadlock.tsx       → heroAbierto pasa de useState local a venir de la URL
                     (prop open + callback onOpen), igual que UnitsView.
DeadlockItems.tsx  → lo mismo con itemAbierto.
App.tsx            → pasa route.detail y navigate a los dos componentes.
```

**Nada de esto toca `entry-server.tsx` ni el propio plugin de prerender en su
forma**: `renderApp(route)` ya renderiza cualquier `Route`, sea de TFT o de
Deadlock, porque monta el mismo árbol de `App`. El plugin solo necesita la
lista de rutas a prerenderizar, que sale de `sitemapPaths()`.

---

## 3. Por qué solo la banda por defecto — hallazgo técnico, no solo de SEO

Verificado leyendo el código el 2026-08-04:

- `heroes.json`/`items.json` de la banda **publicada por defecto** se
  importan de forma **estática** (`import heroesJson from "@deadlock/heroes.json"`
  en `deadlockData.ts`), así que `useHeroes(PUBLISHED_BAND)` devuelve datos
  reales en el primerísimo render — sin esperar ningún efecto. Es lo que ya
  hace posible que `/deadlock` se prerenderice hoy con contenido real.
- Las otras tres bandas se piden con `import()` dentro de un `useEffect`
  (`loadBand`/`loadItemBand`). **`useEffect` nunca corre durante
  `renderToString`**, así que una página de detalle armada sobre una banda
  no publicada saldría con el hueco vacío que hoy tiene la lista mientras
  carga — no un error, pero tampoco una página que valga la pena indexar.

**La tarjeta de build (`builds.json`) tiene el mismo problema y no se
resuelve**: se carga con `import()` al abrir la fila, sin importar la banda.
Por eso la Decisión de arriba (opción A) — no es solo costo de bundle, es que
arreglarlo con un import estático sería el único camino, y ya se descartó.

---

## 4. Slugs y datos

`deadlockSlugs.ts`, calco exacto de `slugs.ts` de TFT:

```ts
export const heroes: SlugMap = buildMap(
  buildHeroes(PUBLISHED_BAND, en).map((h) => ({ id: String(h.heroId), name: h.name }))
);
export const items: SlugMap = buildMap(
  buildItems(PUBLISHED_BAND, en).map((i) => ({ id: String(i.itemId), name: i.name }))
);
```

`buildHeroes`/`buildItems` (de `deadlockData.ts`/`deadlockItemsData.ts`) ya
devuelven objetos con `.name` resuelto — se reusan tal cual en vez de leer
`catalog.json` directamente, porque así el slug sólo existe para un
héroe/ítem que de verdad tiene datos en la banda publicada. Iterar el
catálogo entero (como decía este documento antes de implementarse)
generaría un slug — y una entrada de sitemap — para cualquier entrada del
catálogo sin partidas medidas, algo que rompería la garantía que el resto
de este documento da por sentada.

- Slugs siempre del nombre en **inglés**, aunque la página esté en español —
  mismo motivo que TFT: un héroe no puede tener dos direcciones según el
  idioma.
- Colisión de nombre → sufijo numerado (`buildMap` ya lo resuelve; no hay
  lógica nueva que escribir, se reusa tal cual).
- `detailPaths()`-equivalente para el sitemap: un slug por héroe con datos en
  la banda por defecto, un slug por ítem con datos en la banda por defecto.

---

## 5. Contenido y manejo de errores

- **La página es la fila abierta**, exactamente lo que ya se ve al hacer
  click en `/deadlock` o `/deadlock/items` hoy: nombre, imagen, winrate,
  pickrate, chips de dificultad/tendencia para el héroe; tier, delta,
  winrate, tipo y estante para el ítem.
- **Slug que no resuelve** (typo, o un héroe/ítem que salió del catálogo):
  la página se sirve igual, con la lista cerrada, en vez de un 404 o una
  pantalla rota — mismo comportamiento que ya tiene TFT para sus URLs de
  detalle (`detailName()` devuelve `null` y `metaFor()` cae a la copia
  genérica de la sección).
- **SEO**: `seo.deadlock.detail.title(name)` / `.description(name)` en
  `i18n.ts`, EN y ES, mismo patrón que `seo.detail` de TFT (que ya
  distingue campeón de ítem por el texto).

---

## 6. Testing

Mismo criterio que ya cubre a TFT — funciones puras, sin componentes:

- `deadlockSlugs.test.ts`: genera los slugs esperados, resuelve colisiones,
  no se rompe con un héroe/ítem fuera del catálogo por defecto.
- `route.test.ts`: extender los casos ya agregados para "player" a "meta" e
  "items" — URL con y sin detalle, ida y vuelta, en los dos idiomas.
- `sitemap.test.ts`: la cantidad de URLs nuevas coincide con héroes + ítems
  de la banda por defecto (hoy 38 + 156, en dos idiomas); ninguna URL de
  banda no publicada aparece.

---

## 7. Fuera de alcance

- Contenido nuevo por héroe o ítem (guías escritas, comparativas): esto es
  indexación de lo que ya existe, no un producto nuevo.
- Páginas de detalle para bandas que no son la publicada por defecto.
- Arreglar la carga de `builds.json` para que se prerenderice completo
  (opción B, descartada — ver Decisión de arriba).
- El perfil de jugador de Deadlock (`docs/design/2026-08-03-perfil-de-jugador-deadlock-design.md`):
  queda para después de esto, decisión de ZoTaD del 2026-08-04.
