# Street Brawl, baneos y las filas duplicadas del lake

**Fecha:** 2026-09-24 · Pedido de ZoTaD: cerrar los dos huecos que la
competencia tiene y nosotros no antes de pausar Deadlock y pasar a Valheim.

## Por qué estas dos

Relevamiento del mismo día (Mobalytics, Tracklock, Deadlock Labs, dodge.gg,
deadlock.cam, tracker.gg, deadlock-api.com): la **tier list de Street Brawl**
era el único formato que tenían todos y nosotros no, y es una búsqueda aparte
en Google. Los **baneos** eran lo más barato que faltaba. El resto de lo que
ofrecen (overlay, logros, scrims, búsqueda de grupo) ya estaba descartado en
`2026-08-25-que-mas-podemos-hacer-en-deadlock.md`.

## Lo que apareció en el camino: el 30% de las rankeadas contado dos veces

Midiendo Street Brawl en el lake salió que 4.200 de sus partidas tenían 16
filas en vez de 8. En las rankeadas pasaba lo mismo: **28.810 de ~95.000
partidas de tres días estaban dos veces**, una en su base y otra en un delta.

El lector de `snapshot.ts` leía todos los deltas y residuales enteros,
suponiendo que traían sólo lo que ninguna base tenía. No es así: cuando una
base se reconstruye absorbe los deltas, pero éstos siguen en el manifiesto.
La regla del propio lake (`services/data_dump/compaction.rs` en el repo de
deadlock-api) es que una fila de la partición `p` está en la base si su marca
de agua es ≤ `base(p).hi`. Los archivos no traen la marca por fila, pero las
bases se cortan en el borde de un delta horario, así que alcanza con comparar
`base(p).hi ≥ archivo.hi` (`lakeFrom` / `extrasSource`).

Efecto medido al regenerar la tier list: el winrate se movió como mucho 0,9
puntos (parte es tiempo transcurrido), el **uso bajó ~19%** en las cuatro
bandas y las partidas por banda no cambiaron (ya eran distintas). Arrastra a
todo lo que sale del lake: objetos, builds, maestría, rangos e informe se
corrigen en su próxima corrida.

## Street Brawl

- `pipeline/src/brawl.ts` → `data/brawl.json`, misma forma que una banda.
- **Sin bandas**: Street Brawl no tiene rango (0 de 39.514 partidas con
  insignia en una semana; la API rechaza el filtro por insignia en ese modo).
- **De la API en vivo** (`hero-stats?game_mode=street_brawl`): tres pedidos
  contra minutos de DuckDB. Cuenta 8 filas por partida (4v4), no 12.
- Misma regla que la rankeada: quince días con las partidas de antes del
  parche perdiendo peso, encogimiento hacia 50% y "de → a" del parche.
- Página `/deadlock/street-brawl`, sin pestaña propia: la Tier list tiene un
  selector de modo (enlaces, no botones, para que cada modo sea indexable).
  Los héroes abren su ficha de Héroes y no la build, que es de clasificatorias.
- En el workflow va después de `build heroes`, y perdona fallar.

Primera medición: 46.568 partidas desde el parche del 16/9; Paige 63,1% y
Graves 61,0% arriba, El Portero 40,5% abajo (con el encogimiento que publica la página).

## Baneos

- `pipeline/src/bans.ts`, dentro de `build:heroes`: `banRate` por héroe y
  `bans.matches` por banda.
- Del lake (`banned_hero_ids`), no de `hero-ban-stats`: la API da conteos sin
  denominador; el lake deja contar partidas con baneos y publicar una tasa.
- **La muestra está sesgada hacia arriba**: se analiza el 0,6–0,95% de las
  partidas de Obscurus a Oráculo, el 5,5% de Ascendente y el 16,6% de Eterno.
  Por eso no hay tasa global, y adentro de cada banda cada rango pesa por las
  partidas jugadas, no por las analizadas (post-estratificación).
- Piso de 250 partidas con baneos por banda; sin decimales en pantalla.
- En pantalla: caja "Los más baneados" en el rail de la tier list rankeada y
  columna "Baneado" en la tabla de Héroes. Para que la tabla siga sin scroll
  de costado, el DPS sostenido deja de mostrarse en escritorio y cada tramo
  de ancho suelta una columna más.

Primera medición (Fantasma+, 906 partidas): Celeste baneada en el 45%,
Guardia 30% con 47,5% de victorias.
