# Pestaña Héroes y página de héroe "Cartel" — Deadlock

- **Fecha:** 2026-09-22
- **Pedido (ZoTaD):** una pestaña nueva **Héroes** con una tabla de todos los
  héroes y sus atributos base, **ordenable por columna** ("los de más daño de
  arma", "el mayor winrate"); al hacer clic en un héroe se abre su página con el
  diseño **C · Cartel**. *"Nada de datos inventados, sólo datos oficiales."*
- **Maquetas:** canvas https://claude.ai/artifact/3771bECsSvkUo584YxqnX3
  (A Ficha, B Tablero, **C Cartel = la elegida**), con datos reales de Dínamo.

## Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| URL de la tabla | `/es\|en/deadlock/heroes` | Pestaña nueva al lado de la tier list. No choca con `/deadlock/<héroe>`: el parser prueba primero las pestañas. |
| URL del héroe | **Dos páginas.** `/deadlock/<héroe>` (desde la tier list) sigue siendo la build sola, como antes; `/deadlock/heroes/<héroe>` (desde la pestaña Héroes) es la ficha C entera | ZoTaD, segunda vuelta del 2026-09-22: en medio de una partida "yo quiero la build nada más". La de la build lleva un enlace "Todo sobre <héroe>" al pie; las dos comparten la imagen OG y van al sitemap con títulos distintos. |
| Nombre de la tier list | "Tier list" (antes "Héroes") | Dos pestañas llamadas "Héroes" no se distinguen. |
| Tabla sin scroll horizontal | La pestaña usa 1560 px (el resto 1400); rótulos en dos renglones; flecha de orden sólo en la columna ordenada; debajo de 1440, 1280 y 1100 px se esconden 2, 3 y 2 columnas de menor prioridad | Medido: los 18 rótulos piden 1.196 px y a 1440 hay 1.225. A 1920 quedan 180 px por lado para publicidad. En el teléfono queda el scroll con la columna del héroe fija. |
| Barra superior | Pegada al borde de arriba | Quedaba el aire de cuando era fija (`.app` con `padding-top`). |
| Columnas de la tabla | Victorias, uso (de la tier list de la banda) · vida, regeneración · velocidad, esprint, aguante · DPS, DPS sostenido, daño por disparo, disparos/s, cargador, recarga · vida, bala y **espíritu por bendición** · cuerpo a cuerpo pesado | Todas varían entre los 38 (medido: vida 13 valores, DPS 37, espíritu por bendición 5). "Daño espiritual" no existe como atributo base: lo que el juego da es **poder espiritual por bendición**, y esa es la columna. |
| Caída del daño y velocidad de bala | **Afuera** | La API las da en unidades del motor, y convertirlas a metros sería una conversión nuestra. |
| Costo en puntos de las mejoras (1/2/5) | **Afuera** | No está en la API. La página dice T1/T2/T3. |
| Tipo del héroe (marksman, mystic…) | **Afuera** | La API no lo traduce; las etiquetas (`tags`) sí vienen en los dos idiomas y se muestran. |
| Complejidad | Un rombo por punto, sin máximo | El juego usa 1 a 4 y sólo un héroe tiene 4: no está claro cuál es la escala. |
| Textos del héroe | Todos del juego | Rol, estilo, historia, etiquetas, nombres, descripciones, citas y mejoras en cada idioma. Lo único nuestro son rótulos y frases que leen un número. |
| Videos | Los de la API, cargados al entrar en vista | 3–8 MB cada uno. `preload="none"` + `IntersectionObserver`; con movimiento reducido no arrancan solos. 12 héroes nuevos no tienen clip: se dibuja el ícono sobre el color del héroe. |

## Datos

Dos pasos nuevos en `publish-deadlock.yml`, los dos con `continue-on-error`:

- `npm run build:hero-kit` (`heroKit.ts`): atributos base, arma y las cuatro
  habilidades agrupadas como la tarjeta del juego (`tooltip_details`), con la
  **escala de espíritu oficial** de cada cifra (`stat_scale`). Escribe
  `data/hero-kit.json` (15 KB, la tabla) y `data/hero-kit/<id>.json` (un
  archivo por página). La fila lleva el hash de su detalle para que el guardián
  de publicación vea cambios de texto.
- `npm run build:hero-insights` (`heroInsights.ts`): de la API en vivo, por
  banda, sobre la **misma ventana que la tier list**: promedios por partida
  (para ubicar al héroe contra los otros 37), curva diaria de 30 días y
  enfrentamientos (contra y con cada héroe, desde 100 partidas por cruce).

Los assets se piden primero a `assets.deadlock-api.com/v2` y si falla a
`api.deadlock-api.com/v1/assets`: el 2026-09-22 el primero no resolvía por DNS.

## Arreglos de paso en `parseLoc` (afectan también a las fichas de ítems)

- El espacio que el juego deja **adentro** de un resaltado se conserva
  ("movimiento durante 4 s" salía "movimientodurante").
- `<br>` es un espacio ("+1 Charge +2s Trail" salía pegado).

Las fichas de ítems toman los arreglos en la próxima corrida de `catalog`.
