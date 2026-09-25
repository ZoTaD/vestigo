# PoE2 · Árbol de pasivas (2026-09-25)

Pedido de ZoTaD: un árbol de pasivas "como el original del juego" donde cualquiera
arma su ruta nivel por nivel, con gemas, y se la lleva al juego. Se eligió la
maqueta **A · Pantalla del juego** (árbol a pantalla completa, cajón a la derecha,
barra de niveles abajo).

## Decisiones

- **Ruta = orden de clics.** Cada clic toma el camino más corto y lo suma al final.
  Sacar un nodo saca lo que queda desconectado. Las filas del cajón se reordenan
  arrastrando, sólo si cada nodo sigue conectado a algo anterior.
- **Alcance:** árbol, ascendencia, sets de armas I/II, gemas por tramo de niveles.
  Sin equipo ni cálculo de daño.
- **Compartir:** la build viaja en el link (`?b=`), sin cuentas. Además se puede
  descargar el `.build` del Build Planner del juego e importar uno.
- **Assets del juego:** sprites oficiales del export de GGG
  (`grindinggear/poe2-skilltree-export`, 0.5.5): íconos, marcos, círculo central,
  arte de clase y de ascendencia, textura de fondo.

## Puntos y niveles

- Un punto por nivel desde el 2 (99) + 24 de misiones de campaña. El nivel de cada
  misión es el nivel de zona del juego (`world_areas`): 10, 12, 21, 28, 34, 44,
  47, 51 y 56 (interludios y Kingsmarch, 8 puntos).
- Sets de armas: un fondo por set igual a los puntos de misión conseguidos (hasta
  24). Un nodo marcado I o II gasta de su set, no del fondo general.
- Ascendencia: 2 puntos por prueba, en los niveles 22 (Sekhemas), 38 (Caos), 60 y
  75. Los nodos de ascendencia que dan puntos de pasiva los suman al fondo general.
- El nivel de cada punto de la ruta es el primero en que alcanza su fondo, y nunca
  menor que el del punto anterior (la ruta es el orden en que se toman).

## Reglas del árbol

- Los inicios de otras clases no se atraviesan.
- Nodos de Delirio (sin conexiones) no se muestran.
- Nodos con `unlockConstraint` (árbol de la Oráculo) sólo se ven y se toman con esa
  ascendencia y el nodo que los desbloquea.
- Opciones múltiples (p. ej. Senderos del Explorador): una por padre.
- Clases jugables: las 8 con arte en el export. Ascendencias sin nombre (sin salir)
  aparecen como "Pronto".

## Piezas

- `games/poe2/pipeline/tree.py`: baja el export fijado por commit, traduce con las
  tablas del juego (`poe_dat`, `poe_csd`), escribe `games/poe2/data/tree/`
  (`tree.json` geometría, `tree.en.json` / `tree.es.json` textos, `gems.json`
  slug → id de metadata) y copia los sprites a `public/poe2/tree/`.
- `src/poe2Tree/`: `points.ts` (fondos por nivel), `planner.ts` (ruta, caminos,
  reglas), `share.ts` (código del link), `buildFile.ts` (`.build` ida y vuelta),
  `render.ts` (canvas), `Poe2Tree.tsx` (página), `copy.ts`.
- Ruta `/<lang>/poe2/tree`, pestaña "Árbol de pasivas" / "Passive Tree", título y
  descripción para buscadores, sitemap por la lista de secciones.

## Verificación

- Tests: fondos por nivel, caminos y reglas, código del link ida y vuelta, `.build`
  ida y vuelta con un archivo real.
- A mano en el navegador: tomar, sacar, reordenar, sets, ascendencia, gemas,
  importar/exportar, link, móvil.
