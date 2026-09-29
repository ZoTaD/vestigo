# Deadlock tras City Never Sleeps — pieza 1: puesta al día

Fecha: 2026-09-29 · Rama: `feat/deadlock-cns` (carpeta `Desktop/vestigo-deadlock`)

La actualización "City Never Sleeps" (cliente 6712, hotfix 6722) se divide en
cinco piezas que se publican por separado, en este orden (decisión de ZoTaD):

1. **Puesta al día** — este documento.
2. Ficha del objeto igual a la del juego nuevo, con la línea de popularidad.
3. Tienda nueva en Objetos: tres columnas, filtros por categoría, populares.
4. Tarjeta de Populares por héroe (dato `popular_items` del juego).
5. Estética general de Tier list, Héroes y Objetos, con maquetas antes.

## Objetivo

Que todo lo que el sitio ya muestra quede correcto con el parche nuevo, sin
cambiar el diseño: datos, cortes por parche, estadísticas de objetos e imágenes.

## Qué cambia

### Datos

- **Catálogo y kit de héroes** (`npm run catalog`, `build:hero-kit`): la API ya
  sirve 6712. Trae los renombres (Spirit Shredder, Armor Piercer; en español
  Destructor Espiritual, Perforador de Armadura, Cartuchos Rápidos; héroes Calico
  y Lash). **Return Fire** perdió su sección innata en la API: se confirma contra
  `scripts/abilities.vdata` del juego antes de publicarlo.
- **Héroes nuevos** (78, 84–88): no se pueden jugar (`player_selectable=false`,
  `prerelease_only`), no tienen kit ni retrato y no aparecen en partidas.
  Quedan fuera como hoy (`isPlayable`); se verifica que 65 héroes en la API no
  rompan nada.
- **Parches desde `/v2/patches`**: `/v1/patches` es el foro, que no tiene City
  Never Sleeps y republicó tarde parches viejos (el 08-22 figura el 16/9). La
  v2 trae las entradas de Steam con la hora real de salida. Se usan las de
  `source: "steam"` (con respaldo en las del foro si faltaran) y el título se
  normaliza como en Vestigo News ("Minor Update - 09-16-2026" → "09-16-2026
  Update"; los nombres propios quedan). Así la tier list y las builds cortan y
  ponderan desde el parche nuevo.
- **Objetos Corruptos fuera de las estadísticas de objetos** (decisión de
  ZoTaD): en el lake, `items.upgrade_info` con el bit `0x800000` marca la compra
  corrupta. Se descartan esas compras en las builds (`kept`, compras con minuto,
  aporte, counters) y en la tier list de objetos. Las partidas siguen contando
  para los winrates de héroes. Primero se mide en el lake cómo aparece una
  compra corrupta (entrada propia o la misma entrada marcada) para filtrar bien.
- **Ventanas por hora contra la API**: `liveStats.ts` y `heroInsights.ts` piden
  sin `bucket` y la API redondea `min/max_unix_timestamp` al día. Se agrega
  `bucket=start_time_hour` donde la ventana arranca a mitad del día.

### Imágenes

- Correr `games/deadlock/tools/game_assets.py` contra el juego nuevo (+
  `thumbs.py`): cambian 65 íconos de objetos, 12 de habilidades (silueta negra →
  blanca), 3 caras de ánimo (bull/doorman critical, punkgoat gloat), cabeceras
  de la tienda y reversos de las tarjetas.
- **Lo que el juego borró se conserva** en el sitio hasta que otra pieza lo
  reemplace: `catalog_tooltip_bg_*` (ficha vieja, pieza 2), `shop-generic`,
  `menu-gothic`, `menu-city`, `menu-nyc` (pieza 5). El script no debe sacarlos
  del manifest ni del sitio.

## Qué no cambia

El diseño de ninguna página. La ficha del objeto, la tienda y la estética son
las piezas 2 a 5.

## Verificación

- Tests del pipeline y del sitio; los que cambian por los renombres se
  actualizan con el dato nuevo.
- `vite build` completo.
- En el navegador (1440 y 375 px): tier list de héroes, Objetos (tienda y lista),
  página de build de un héroe, ficha al pasar el mouse, Vestigo News (caras).
- Consulta al lake que muestre que después del filtro no queda ninguna compra
  corrupta en las builds.

## Publicación

Rebase sobre `origin/main` (el bot publica todos los días), push a `main`, y una
corrida del workflow de Deadlock para que las builds se rehagan con el corte del
parche y sin Corruptos. Se comprueba en vivo.
