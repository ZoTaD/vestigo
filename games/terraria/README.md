# Terraria

Los datos de la sección Terraria de Vestigo. Diseño: `docs/superpowers/specs/2026-10-12-terraria-etapa-1-design.md`.

## Qué hay

- `tools/Dump.cs` + `tools/dump.ps1`: le piden los datos al propio `TerrariaServer.exe` por reflexión (objetos,
  recetas, grupos de receta, botín de enemigos y textos en inglés y español). Dejan todo en `cache/`.
- `tools/xnb.py`: lector de las texturas `.xnb` del juego, con su descompresor LZX.
- `tools/sprites.py`: saca los sprites de objeto y el arte de la sección a `site/public/terraria`.
- `tools/site_data.py`: arma `data/` (lo que lee el sitio) a partir de `cache/`. No lee el juego.
- `cache/`: no se versiona. `data/` y los PNG de `site/public/terraria` sí.

## Cómo regenerar en cada parche del juego

Hace falta Terraria instalado por Steam (no hace falta abrirlo nunca, ni instalar XNA: las DLL salen del instalador
que trae el juego) y Python con Pillow. Desde la raíz del repo, de a un paso por vez:

```
powershell -ExecutionPolicy Bypass -File games/terraria/tools/dump.ps1
python games/terraria/tools/sprites.py
python games/terraria/tools/site_data.py
python -m unittest discover -s games/terraria/tools/tests
```

Después: actualizar `VERSION` en `site_data.py` con lo que imprime `dump.ps1` (`version: v…`).

`dump.ps1` avisa con `!!` cada bloque que falla y sigue. Dos avisos son esperables y no afectan los datos:
`Initialize_TileAndNPCData2` y `armado de recetas` (el juego ordena al final con datos de un mundo que el servidor
suelto no tiene; para entonces las recetas ya están cargadas).

Los slugs no cambian entre corridas: `site_data.py` usa `data/site/slugs.json` como ancla.

## Lo que falta sacar

- Tiendas de los NPC y lo que traen los cofres, la pesca y las bolsas de jefe: `Dump.cs` sólo vuelca el botín de
  enemigos (`ItemDropDatabase.GetRulesForNPCID`).
- El nombre propio de cada estación de crafteo (`Recipe.GetRequiredTileName` devuelve vacío sin el mapa cargado): se
  usa el nombre del objeto que la coloca, y `TILE_NAMES` en `site_data.py` para las que no coloca ninguno.
