# Terraria

Los datos de la sección Terraria de Vestigo. Diseño: `docs/superpowers/specs/2026-10-12-terraria-etapa-1-design.md`.

## Qué hay

- `tools/Dump.cs` + `tools/dump.ps1`: le piden los datos al propio `TerrariaServer.exe` por reflexión (objetos,
  recetas, grupos de receta, botín de enemigos y textos en inglés y español). Dejan todo en `cache/`.
- `tools/xnb.py`: lector de las texturas `.xnb` del juego, con su descompresor LZX.
- `tools/sprites.py`: saca los sprites de objeto y el arte de la sección a `site/public/terraria`.
- `tools/site_data.py`: arma `data/` (lo que lee el sitio) a partir de `cache/`. No lee el juego.
- `tools/world_data.py`: arma `data/bosses.json` y `data/npcs.json` (Jefes y NPC). El orden de los jefes, con qué se
  invocan y qué destraban se escribe ahí a mano, con marcas (`{i:…}`, `{n:…}`, `{b:…}`, `{e:…}`) que se resuelven a
  los nombres oficiales en inglés y español: no escribir nombres propios en español a mano.
- `tools/extras_data.py`: arma `data/fishing.json` y `data/patches/` (Pesca y Parches; lee el `changelog.txt` del juego).
- `cache/`: no se versiona. `data/` y los PNG de `site/public/terraria` sí.

## Cómo regenerar en cada parche del juego

Hace falta Terraria instalado por Steam (no hace falta abrirlo nunca, ni instalar XNA: las DLL salen del instalador
que trae el juego) y Python con Pillow. Desde la raíz del repo, de a un paso por vez:

```
powershell -ExecutionPolicy Bypass -File games/terraria/tools/dump.ps1
python games/terraria/tools/site_data.py
python games/terraria/tools/world_data.py
python games/terraria/tools/extras_data.py
python games/terraria/tools/sprites.py
python -m unittest discover -s games/terraria/tools/tests
```

Después: actualizar `VERSION` en `site_data.py` con lo que imprime `dump.ps1` (`version: v…`).

`dump.ps1` avisa con `!!` cada bloque que falla y sigue. Dos avisos son esperables y no afectan los datos:
`Initialize_TileAndNPCData2` y `armado de recetas` (el juego ordena al final con datos de un mundo que el servidor
suelto no tiene; para entonces las recetas ya están cargadas).

Los slugs no cambian entre corridas: `site_data.py` usa `data/site/slugs.json` como ancla.

## Cómo salen las preferencias de los NPC

En 1.4.5 a quién quiere cada NPC de vecino no está en una tabla: lo decide el código de la tienda. `Dump.cs` (bloque
"vecinos") se lo pregunta a la tienda misma: pone a un NPC solo, después con cada uno de los otros de vecino, y compara
el precio. Igual con el hacinamiento (0, 1, 2… vecinos indiferentes). `world_data.py` falla si un cociente no
corresponde a ningún gusto, así un cambio de reglas en un parche se nota al regenerar.

Dos reglas no salen del juego sino de la wiki, y están en `site/src/terraria/npcs/happiness.ts`: desde la 1.4.5 el pilón
se vende con sólo tener otro NPC cerca (ya no depende del precio; el Tabernero no vende), y en la Mazmorra, la
Corrupción y el Carmesí el precio es siempre el máximo. Cotejado el 2026-10-12 con terraria.wiki.gg.

## Lo que falta sacar

- Tiendas de los NPC y lo que traen los cofres, las bolsas de jefe y qué se pesca en cada bioma: `Dump.cs` sólo vuelca
  el botín de enemigos (`ItemDropDatabase.GetRulesForNPCID`; en 1.4.5 no existe la consulta por objeto).
- Clases: se probó ordenar las armas de cada clase por el daño por segundo de su ficha y el resultado engaña (no cuenta
  proyectiles ni efectos: salían primeras las monedas como munición). Hace falta armarla a mano.
- El nombre propio de cada estación de crafteo (`Recipe.GetRequiredTileName` devuelve vacío sin el mapa cargado): se
  usa el nombre del objeto que la coloca, y `TILE_NAMES` en `site_data.py` para las que no coloca ninguno.
