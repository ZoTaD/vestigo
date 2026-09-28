# Vestigo News: modelo B, "fin de partida" (2026-09-28)

ZoTaD pidió sacarle el dorado y el brillo al periódico y darle más el estilo
del juego, con sus assets, bordes y HUD. Se hicieron dos maquetas con los datos
del parche del 16/9: **A, "diario de la ciudad"** (papel crema, tinta negra,
fotos en blanco y negro) y **B, "fin de partida"** (oscuro, con la alineación
de la pantalla de fin de partida). **Eligió la B** y pidió publicarla.

## Qué es la B

- **Tipografía plana.** Nada de degradé dorado ni `drop-shadow`: el color del
  texto es uno solo (`--vn-ink`). Las fuentes siguen siendo las del juego desde
  el bucket de deadlock-api (Reaver, Radiance, Retail).
- **Cabecera**: la ciudad del menú en blanco y negro
  (`main_menu/background_nyc_cityscape_bw` → `ui/menu-nyc.webp`) fundida hacia
  el papel oscuro (`ui/paper-dark.webp`), con el nombre a la izquierda y los
  datos de la edición a la derecha.
- **Titular** sobre el pincel negro de la votación de héroes
  (`ui/backer-box.webp`), el mismo de los títulos de sección.
- **Marcador**: un "equipo" por veredicto (nerfs, buffs, mixtos, arreglos) con
  tinte de fondo rojo/verde, sin filos de color ([[sin-bordes-de-color-en-cards]]).
- **Alineación**: "Los más golpeados" (los 4 nerfs con más recortes) y "Los que
  festejan" (los 4 buffs con más mejoras), en las tarjetas rasgadas de la
  pantalla de fin de partida (`post_game/card_hero_mask_0N` → `ui/card-mask-N.webp`).
- **Cara de ánimo**: el retrato de cada héroe cambia con el veredicto. Nerf →
  `<código>_card_critical` (la cara de poca vida), buff → `<código>_card_gloat`
  (la de la racha), mixto o arreglo → `<código>_card`. La lista de héroes que
  traen las dos caras está en `game-art.json` (`moods`), que escribe
  `game_assets.py`.
- **Héroes**: tarjeta con el arte de fondo del héroe teñido según el veredicto y
  la cara de ánimo recortada con la máscara rasgada.
- **Objetos**: el fondo de la ficha de la tienda según la familia
  (`ui/tooltip-mod-bg-{weapon,vitality,spirit}.webp`).

## Regla: las palabras no se cortan nunca

Pedido de ZoTaD al ver la página con la ventana achicada. No hay
`overflow-wrap: anywhere` en el periódico; en su lugar:

- El **titular** se reparte en las dos líneas más parejas (`headlineLines()` en
  `newsCopy.ts`) y el CSS lo achica según la más larga:
  `min(116px, 100cqi / (largo × 0,77 + 0,7))`, con la columna como contenedor.
- Los **títulos de tarjeta, héroe y objeto** reciben su palabra más larga en
  `--vn-w` (`wordFit()` en `DeadlockNews.tsx`) y se achican lo justo para que
  entre en su tarjeta.
- Los espacios duros de algunos nombres ("Encantamiento Balístico") se pasan a
  espacios comunes en los títulos, para que puedan bajar de línea entre palabras.

Verificado de 320 a 1440 px, en español e inglés: ningún título se sale de su
tarjeta y la página no tiene scroll horizontal.
