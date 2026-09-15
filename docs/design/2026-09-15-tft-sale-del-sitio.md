# TFT sale del sitio (2026-09-15)

## Qué se decidió

Vestigo deja de mostrar Teamfight Tactics. Deadlock queda como único juego; Dota 2
sigue anunciado como "pronto".

Es un **ocultamiento, no un borrado**: la pipeline (`games/tft/pipeline`,
`analysis`, `cloudflare`, `supabase`), los JSON de `games/tft/data` y las vistas
(`TftArea.tsx`, `MetaView`, `UnitsView`, `ItemsView`, `LadderView`, `PlayerView`
y sus módulos de datos) siguen en el repo y siguen compilando y pasando sus
tests, sólo que nada los importa desde la app. Si en un mes no se extrañan, el
paso siguiente es borrarlos y dar de baja el proyecto de Supabase y el worker de
Cloudflare.

## Por qué

- **La pipeline estaba apagada desde el 12 de agosto.** Los workflows `publish
  tier list` y `summarize matches` figuraban desactivados a mano en GitHub tras
  el bloqueo por facturación de ese mes, y nunca se volvieron a prender. Lo que
  el sitio servía era el set 17, parche 16.16, presentado como actual.
- **Nadie lo usaba.** Analytics del 18 de agosto al 14 de septiembre: 299 vistas
  de Deadlock contra 40 de TFT, repartidas en meta (28), jugador (3), ítems (2),
  unidades (2) y dos comps. Siete usuarios activos en total (5 AR, 1 GB, 1 MX),
  cinco nuevos, ninguno retenido más de una semana. Con 79 de 80 sesiones
  entrando por Direct, el sitio todavía se comparte a mano; no había tráfico
  orgánico de TFT que perder.
- **Servir un meta viejo es peor que no servirlo.** Google tenía indexadas las
  páginas de unidades, ítems y comps, y cada una afirmaba ser la tier list del
  set en curso.

## Cómo

- `route.ts`: `parseRoute` deja de reconocer `tft`. Una `/tft/...` cae en la
  portada del idioma que nombra. El tipo `View` conserva `"tft"` para que el
  código apartado compile.
- `netlify.toml`: `/tft/*`, `/en/tft/*` y `/es/tft/*` contestan **301** a la
  portada, antes del comodín de SPA. Es lo que le dice a Google que saque esas
  URLs; el prerender ya no escribe HTML para ellas, así que no hay archivo que le
  gane a la redirección.
- `sitemap.ts` y `prerender.ts`: sin rutas ni títulos de TFT; `SitemapData` es
  sólo Deadlock y `metaFor` deja de recibir el número de set.
- `Nav.tsx`, `Home.tsx`, `App.tsx`: sin pestaña, sin panel, sin tarjetas de "hoy
  en el meta", sin selector de juego en el buscador. Las cifras del pie salen de
  `heroes.json`. El pie nombra sólo deadlock-api y Valve como fuentes; el aviso
  de Riot se queda porque no molesta y ahorra volver a redactarlo si TFT vuelve.
- `index.html`: la descripción de las tarjetas de link preview ya no nombra a
  Teamfight Tactics.
- Se borró `tftSummary.ts` y su plugin de Vite: existían sólo para la portada.

## Qué queda pendiente

- Mover la interfaz de `games/tft/ui` a una carpeta neutra. Es herencia de cuando
  TFT era el único juego; no hace falta hoy y es un cambio aparte.
- Decidir en octubre si se borra la pipeline y se dan de baja Supabase y el
  worker de Cloudflare.
