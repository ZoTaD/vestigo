# Company of Heroes 1, 2 y 3 en una sola sección: diseño (6/11/2026)

## Por qué

Vestigo ya tiene CoH3 completo, publicado en los PR 81 y 83. ZoTaD quiere que la categoría RTS tenga los tres Company of Heroes juntos, en un mismo lugar.

Lo que pidió (5–6/11):
- En la barra, "Company of Heroes" a secas.
- Dentro de la sección, un selector de juego.
- Cada juego con ranking, leaderboards y estadísticas actualizados **por lo menos una vez por día**.
- **Todo desde el arranque**: también unidades, armas y el resto de la enciclopedia, no sólo la parte en vivo.

Hoy la competencia está separada en coh1stats.com, coh2stats.com y coh3stats.com. Tener los tres juegos en un solo lugar es lo que nos diferencia.

## Metas

1. **Una sección, tres juegos.**
   - La entrada del menú se llama "Company of Heroes".
   - Un selector arriba (CoH3 · CoH2 · CoH1) cambia de juego y se queda en la misma pestaña si el otro juego también la tiene.
2. **Parte en vivo para CoH2 y CoH1, actualizada todos los días:**
   - ranking por modo y facción;
   - rangos (distribución por liga y nivel);
   - estadísticas por facción y mapa;
   - jugador y partida.
3. **Enciclopedia de CoH2 y CoH1 al nivel de CoH3:**
   - unidades, armas, penetración contra blindaje (tres lados y veteranía), DPS;
   - comandantes / doctrinas, mapas y logros;
   - fichas indexables en inglés y español.
4. **Extras que no tiene nadie:**
   - **tier list de comandantes en CoH2**: las partidas traen los comandantes que llevó cada jugador;
   - **ELO real en CoH1 y CoH2**: los rankings oficiales no lo muestran, pero el historial de partidas trae el rating antes y después.

## No metas

- Torneos y partidas en vivo, para los tres juegos (decidido el 5/11).
- App de escritorio: sigue siendo la última etapa.
- Campaña, Theater of War, modos contra la IA y partidas personalizadas: sólo el multijugador con ranking.
- CoH1 original (2006, GameSpy): sólo el relanzamiento de Steam (app 228200), que es el que tiene servidores.

## Anti-metas

- Romper las direcciones de CoH3: ya están indexadas.
- Contar en la UI de dónde salen los datos. Los créditos de licencia y el aviso de no afiliación van al pie, como en CoH3.
- Sumar a mano unidades de campaña o que no se usan en multijugador: el mismo criterio que en CoH3.
- Usar el almacenamiento de coh2stats/coh1stats o copiar su código (no tiene licencia). Los datos se juntan directo de la API de Relic.
- Pasarse del presupuesto de rendimiento del `CLAUDE.md`, ni de la memoria del build.

## Direcciones

- `/en|es/coh3/...` queda exactamente como está.
- Se suman `/en|es/coh2/...` y `/en|es/coh1/...`, con los mismos segmentos que CoH3 para las pestañas que se repiten (`ranking`, `unidades`, `armas`, `penetracion`…).
- Una pestaña que sólo existe en un juego lleva su nombre propio:
  - `comandantes` / `commanders` en CoH2;
  - `doctrinas` / `doctrines` en CoH1.
  CoH3 conserva `battlegroups`.
- La entrada del menú lleva a `/coh3`, el más jugado. El selector está en las tres portadas y en cada pestaña.
- Las fichas usan el id interno del juego como slug (igual que CoH3). Si dos juegos comparten un id (`riflemen`), no chocan porque están en rutas distintas.

## Estética

La misma B "Puesto de mando" de CoH3, con la misma tipografía, paneles y barra de pestañas. Cada juego se distingue sólo por:
- el arte de la cabecera (el `library_hero` de Steam de cada juego);
- el logo;
- los emblemas de facción.

El selector es una tira de tres pestañas pequeñas encima de la barra de pestañas del juego, con el logo monocromo de cada uno. El juego activo va en bronce.

## Pestañas por juego

| Pestaña | CoH3 | CoH2 | CoH1 |
|---|---|---|---|
| Portada | ✓ | ✓ | ✓ |
| Ranking | ✓ | ✓ (1v1–4v4 por facción + equipos armados) | ✓ (1v1–4v4 por facción + equipos, Assault y Panzerkrieg) |
| Rangos | ✓ | ✓ | ✓ |
| Estadísticas | ✓ | ✓ (facción, mapa, duración, por día) | ✓ |
| Tier list | por facción y mapa | **comandantes** contra la facción rival, por banda de ELO | por facción y mapa |
| Jugador / Partida | ✓ | ✓ | ✓ (sin contadores: CoH1 no los manda) |
| Unidades / Armas | ✓ | ✓ | ✓ |
| Penetración / DPS | ✓ | ✓ | ✓ (el modelo de daño de CoH1 es otro: ver abajo) |
| Battlegroups / Comandantes / Doctrinas | battlegroups | comandantes (con sus habilidades) | doctrinas (árbol de mando de 3 ramas) |
| Boletines de inteligencia | — | ✓ | — |
| Mapas | ✓ | ✓ | ✓ |
| Logros | ✓ | ✓ (Steam 231430) | ✓ (Steam 228200) |
| Parches | ✓ | desde la primera extracción (el juego casi no recibe parches) | ídem |
| Desafíos / Final Stand | ✓ | — | — |

## Datos

### En vivo: API de Relic, sin sesión ni credenciales

- **CoH2**: `https://coh2-api.reliclink.com/community/leaderboard/...?title=coh2`
  - rankings con liga: ids 4–19 (1v1–4v4 por facción), 20–25 (equipos armados), 51–54 (británicos);
  - facciones: Wehrmacht, Soviets, OKW, US Forces, British.
- **CoH1**: `https://coh1-api.reliclink.com/...?title=coh1`
  - ids 4–19 (1v1–4v4 por facción), 20–25 (equipos), más Assault y Panzerkrieg;
  - facciones: Americans, Wehrmacht, British, Panzer Elite.
- **Leaderboards**: `getLeaderBoard2` paginado de a 200. La respuesta trae `rank`, `ranklevel`, victorias, derrotas, racha y última partida, pero **no el ELO**.
- **Partidas**: `getRecentMatchHistoryByProfileId` (el endpoint por lote `getRecentMatchHistory` está deprecado). Cada partida trae:
  - mapa, modo, duración, facciones y resultado;
  - `oldrating`/`newrating` de cada jugador;
  - en CoH2, también los ítems de cada jugador (comandantes, boletines) y los contadores (`counters`).

### Recolección diaria (GitHub Actions, junto a la de CoH3)

1. Bajar los leaderboards completos de los dos juegos (unas decenas de pedidos).
2. Tomar los jugadores con partida en las últimas 48 h y pedir su historial. Del orden de 1–3 mil pedidos por día, con pausa entre pedidos.
3. Quedarse con las partidas automáticas de ayer, sin repetir, y resumirlas por día en un JSON chico, como `stats.py` de CoH3:
   - facción contra facción;
   - mapa;
   - duración;
   - banda de ELO;
   - en CoH2, comandantes.
4. Guardar 90 días de resúmenes diarios, sin las partidas crudas.

El ELO de un jugador en un ranking es el `newrating` de su última partida en ese modo y facción. Si no hay partida en la ventana, no se muestra.

### Enciclopedia: archivos del juego instalados en la PC de ZoTaD

Los dos juegos ya están instalados:
- CoH2: 34 GB, en inglés y español.
- CoH1 relanzado: 7,6 GB, con Opposing Fronts y Tales of Valor.

La extracción corre **a mano en la PC**, no en Actions. El JSON resultante se commitea, como con Stardew y Zomboid.

- **`.sga`**: lector propio en Python, ya probado.
  - Versión 4 en CoH1 y versión 7 en CoH2.
  - Extrajo los 5.269 y 12.940 archivos de atributos sin errores.
  - **No usar `Archive.exe` del juego**: se cuelga y abre ventanas de BugSplat.
- **`.rgd`** (Relic Chunky, AEGD v1): las claves son hashes Jenkins lookup2. Ya probado.
  - El diccionario de nombres se arma con las claves de coh3-data, los strings de los ejecutables y patrones (`entry_NN`, nombres de facción, `tp_*`).
  - En una escuadra de CoH2 quedaron 27 claves sin nombre; eso va al diccionario.
- **Qué hay en los atributos:**

  | | `ebps` | `sbps` | `weapon` | `upgrade` |
  |---|---|---|---|---|
  | CoH1 | 1.943 | 325 | 338 | 411 |
  | CoH2 | 3.136 | 474 | 1.023 | 1.377 |

  CoH2 trae además `commander`, `intel_bulletin` y `achievement`. CoH1 trae `commander_tree`.
- **Textos (`.ucs`):**
  - CoH2 trae los dos idiomas.
  - CoH1 hoy sólo tiene español, porque el juego está en español en Steam. **Para el inglés ZoTaD tiene que cambiar el idioma de CoH1 a inglés en Steam una vez** (baja sólo los textos), y después se puede volver al español.
- **Íconos:**
  - CoH1: texturas `.rgt` en `WW2Art.sga` (`art/ui/...`).
  - CoH2: hojas de texturas `.dds` dentro de `UIHigh.sga`, con un `.gfx` de Scaleform que dice qué ícono va en cada parte de cada hoja. **Es el punto con más riesgo técnico.** Si recortar las hojas no sale, el plan B son los íconos sueltos que la UI de CoH2 también guarda en `Data.sga`. Se decide al implementar.
- **Mapas:** escenarios en `MPScenarios.sga` y `MPXP1Scenarios.sga` (CoH2) y en los archivos de datos de CoH1, con imagen del minimapa, tamaño y puntos.

### Modelos de daño (para Penetración y DPS)

- **CoH2:** muy parecido a CoH3 (precisión, penetración contra blindaje frontal, trasero y lateral, veteranía como modificadores). La calculadora de CoH3 se reutiliza con otra tabla de datos.
- **CoH1:** usa **tablas de modificadores por tipo de blanco** (`target_type_table`: precisión, daño y penetración multiplicados según el tipo de blindaje o infantería) y no un número de blindaje. La calculadora de CoH1 muestra daño efectivo por tipo de blanco y disparos o segundos para matar, sin el valor "blindaje".

## Piezas reutilizables

Se generaliza lo que hoy está atado a `coh3`:
- cliente de la API de Relic parametrizado por `title`;
- tablas ordenables;
- `LeagueTag`;
- paneles de Rangos y Estadísticas;
- calculadora de penetración;
- `SettledImg` en listas.

El código de cada juego vive en `site/src/coh/<juego>/`. Lo compartido va en `site/src/coh/`, y `site/src/coh3/` se mueve ahí sin cambiar direcciones. Los datos van en `games/coh2/` y `games/coh1/`, cada uno con `data`, `stats` y `tools`. Las herramientas comunes (`sga.py`, `rgd.py`, `rhash.py`, diccionario, `.ucs`) van en `games/coh/tools/`.

Cada juego nuevo cumple las reglas de `CLAUDE.md`:
- `PAGES` en `perf.mjs`;
- `LazyRows` para listas largas;
- datos con `import()`;
- `paths` en `deploy.yml` y `ignore` en `netlify.toml`;
- `areaFiles.ts`;
- sitemap por juego con `lastmod` real;
- RAM y tiempo del build medidos antes y después.

## Etapas (un PR cada una, cada una se publica con el OK de ZoTaD)

1. **Sección unificada + parte en vivo de CoH2 y CoH1:**
   - menú "Company of Heroes", selector, rutas `/coh2` y `/coh1` con portada;
   - Ranking (con ELO de la última partida), Rangos, Estadísticas, Jugador, Partida, Logros;
   - recolección diaria en Actions.
2. **Enciclopedia de CoH2:** unidades, armas, penetración, DPS, comandantes, boletines, mapas; tier list de comandantes.
3. **Enciclopedia de CoH1:** unidades, armas, calculadora por tipo de blanco, DPS, doctrinas, mapas; tier list por facción y mapa.

## Lo que queda a criterio del que construye

- El diseño exacto del selector, dentro de la estética B.
- Cuántos días de historial mostrar en Estadísticas (como mínimo los mismos que CoH3).
- El orden y nombre de los paneles de cada portada.
- Cómo se nombran las ligas de CoH1 y CoH2 si el juego no trae nombres en los textos (por ejemplo, "Nivel 1–20").

## Decisiones mías, tomadas después de la revisión del diseño

1. **ELO en el Ranking.**
   - Se pide el historial de todos los jugadores con partida en los últimos 7 días. El ranking oficial sólo incluye jugadores activos en las últimas semanas, así que casi todas las filas quedan cubiertas.
   - Una fila sin partida en la ventana muestra "—" con la aclaración "sin partidas recientes".
   - Antes de la Action se mide el límite real de Relic. Si 7 días no entran en ~15 minutos por corrida, se baja la ventana o se reparte entre dos corridas.
2. **Cómo llegan los datos al sitio.** Se copia el patrón de CoH3:
   - la función de Netlify que hace de intermediario se parametriza por `title`, y sirve para Jugador y Partida en vivo;
   - el Ranking, los Rangos y las Estadísticas salen de JSON generados por la Action diaria y commiteados;
   - es la misma Action que la de CoH3, `publish-coh3.yml`, que pasa a `publish-coh.yml` con un paso por juego.
3. **Selector cuando la pestaña no existe en el otro juego.**
   - Va a la pestaña equivalente (battlegroups ↔ comandantes ↔ doctrinas).
   - Si no hay equivalente (Desafíos, Boletines), va a la portada del otro juego.
   - `tier-list` es una sola ruta por juego, con el contenido que corresponda.
4. **La etapa 1 incluye una extracción mínima**: nombres y minimapas de mapas, facciones, nombres de comandantes de CoH2 y logros. Así Estadísticas y Partida nunca muestran ids crudos.
5. **Lector `.sga`/`.rgd`.** Ya está escrito y probado en el scratchpad de la sesión. Se pasa a `games/coh/tools/` con tests en la etapa 1.
6. **Ligas.** `ranklevel` existe en los tres juegos, pero la escala puede no ser la misma. `leagues.ts` pasa a tener una tabla por juego. Para CoH1 y CoH2 se usa lo que digan sus textos; si no dicen nada, "Nivel N".
7. **Fichas.**
   - Sólo unidades y armas de multijugador, con el mismo filtro que CoH3: lo que construye una facción jugable o un comandante o doctrina.
   - Estimado: del orden de 300 a 500 fichas por juego y por idioma.
   - Se mide el build en cada etapa contra el tope de 6 GB.
8. **Créditos.** CoH1, CoH2 y CoH3 son del mismo dueño (SEGA/Relic). Mismo aviso de no afiliación y mismo criterio de anuncios que CoH3.

## Pendientes de ZoTaD

- Cambiar CoH1 a inglés en Steam una vez, para bajar los textos en inglés (antes de la etapa 3).
