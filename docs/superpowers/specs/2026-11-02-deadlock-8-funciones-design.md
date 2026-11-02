# Deadlock: 8 funciones más (2/11)

Siguen a las 5 del 30/10 (`2026-10-30-deadlock-5-funciones-design.md`) y salen de la
misma lista de ideas contra statlocker. ZoTaD pidió "todo" y delegó las decisiones;
su único pedido explícito: **en el perfil, ordenar todo para que entre bien y no
queden espacios en blanco**. Todo lo marcado (mío) es decisión mía.

Reglas de siempre: estilo Cartel, sin bordes de color en tarjetas, inglés primero,
sólo datos de deadlock-api u oficiales, no explicar de dónde salen los datos en la UI,
reglas de rendimiento de `CLAUDE.md`.

Medido contra la API el 2/11 (cuenta de prueba 107253473):

- `item-stats?bucket=game_time_min` → por objeto y minuto: partidas, victorias, minuto
  medio de compra. 1,4 MB, ~2 s por banda.
- `kill-death-stats` → grilla de 128×128 en unidades del mundo (paso 128), kills y
  muertes por celda y equipo del que mata. ~1,8 MB y ~5 s por héroe. **Con
  `account_ids` filtra partidas, no al jugador**: un mapa de muertes personal no sale.
- `players/{id}/rank` → `player_rank_final_flat_progress` (44.370 = Arconte 3). Cada
  subnivel son 1.000 puntos, el sexto 2.000: 7.000 por rango.
- `players/rank?account_ids=` → 250 cuentas en un pedido de 0,5 s (20 pedidos/min).
- `matches/metadata`: `average_badge_team0/1` viene **en 0** en todas las partidas,
  ranked incluidas. La suerte de rango tiene que salir del rango de cada jugador.
- `player-stats/metrics?bucket=hero&account_ids=` → percentiles por héroe del jugador.
- `assets/ranked-seasons` → Beta Season 1: intervalo 1 del 30/7 al **5/11 22:00 UTC**,
  intervalo 2 desde ahí. Valve confirmó el fin de la temporada 1 el jueves 5/11.

## 1. Temporadas en el perfil (urgente: el 5/11 cambia)

Hoy "ranked" = desde el 30/7, y los textos dicen "esta temporada". (mío) Una lista
`SEASONS` en `deadlockMatch.ts` con nombre, inicio y fin, sacada de
`assets/ranked-seasons` (cuando Valve publique la próxima, se suma a mano: es una
línea). El selector de modo suma un selector de temporada cuando el jugador tiene
partidas en más de una: "Season 1" / "Season 2". Por defecto, la vigente; si no tiene
partidas en la vigente, la última que tenga. Ranked, la tarjeta contra tu banda, el
rastro de rango y la forma miran la temporada elegida. Además: **rango máximo de la
temporada** en la ficha (Valve lo guarda como premio; sale del historial de rango).

## 2. Winrate según el minuto de compra (Objetos)

En la tarjeta de cada objeto, un gráfico de barras chico: winrate por tramo de compra
(0–10, 10–15, 15–20, 20–25, 25–30, 30–40, 40+ min; mío) en la banda elegida.
**Contra la base del mismo precio en el mismo tramo** (mío, mismo criterio que la tier
list): comprar cualquier cosa temprano "gana más" porque el que compra temprano va
adelante, así que cada barra se pinta por la diferencia con el promedio de los objetos
de su mismo precio comprados en ese tramo, y el texto dice el winrate crudo. Tramos con
menos de 200 compras no se dibujan. Pipeline: `itemTiming.ts` → `item-timing.<banda>.json`
(4 pedidos), en el paso de objetos del workflow.

## 3. Herramientas de rango

**Calculadora "¿cuántas victorias me faltan?"** (mío: en la pestaña Rangos, al lado de
los puntos por partida, y en el perfil ya rellenada). Entrada: rango y subnivel
actuales, progreso dentro del subnivel y racha de victorias; salida: victorias seguidas
para el próximo subnivel y para el próximo rango, usando la escalera de
`rank-points.json` (+300, la racha suma desde la tercera hasta +430). En el perfil sale
de `players/{id}/rank` (progreso exacto y racha).

**Suerte de rango** (perfil): en tus últimas 20 clasificatorias de la temporada, el
rango medio de tus compañeros contra el de los rivales, con el **rango actual** de cada
jugador (`players/rank`, un pedido) y la lista de partidas del metadata (un pedido).
Se rotula "current ranks" (mío). Sin cálculo si menos de 8 de los otros 11 tienen rango.

## 4. Mapa de calor de kills y muertes (ficha del héroe)

Sección nueva en la ficha, en Matchups: "Where <héroe> gets kills / dies", con un
conmutador kills/muertes sobre el contorno del mapa de la pestaña Mapa. (mío) Una sola
franja de rango (todas, 14 días; la geografía no cambia con el rango). Se pliega el
equipo 1 sobre el 0 (rotación de 180°) para que "tu base" quede siempre abajo. Grilla
reducida a 64×64 y cuantizada a 0–255 → `kill-map/<heroId>.json` (~6 KB), que la ficha
pide al llegar a esa sección. Pipeline `killMap.ts` (1 pedido por héroe, ~4 min),
una vez por día.

## 5. Perfil: tus héroes contra tu banda

Reemplaza a "nota por partida", que ya existe (la letra del historial). Tabla por héroe
(los 6 más jugados en la temporada): tu almas/min, daño/min, KDA y muertes como
percentil contra la banda **con ese mismo héroe** (`metrics?bucket=hero`, dos pedidos:
el tuyo y el de la banda). Se fusiona con "Tus héroes" (carrera) para no sumar tarjetas.

## 6. Perfil: tu build contra la de la banda

Para el héroe que más jugás (con selector de tus 5 más jugados): `item-stats` con
`account_id` + `hero_id` contra el mismo pedido de la banda. Muestra tres listas cortas:
"You buy more often", "You skip", "You buy later/earlier (≥3 min)". Piso: 5 partidas
tuyas con el héroe.

## 7. Imagen para compartir el perfil

(mío) Las páginas son estáticas y no hay funciones de servidor, así que una OG por
jugador queda afuera. En su lugar: botón "Share card" que dibuja en `<canvas>` una
tarjeta 1200×630 (nombre, avatar, rango, máximo de temporada, winrate, 3 héroes,
vestigo.gg) para descargar o copiar, y copia el enlace del perfil.

## 8. Pendientes de la auditoría

Escalado espiritual de las activas de los objetos, y "221 ranked" contra "252" en el
rastro de rango (dos fuentes distintas: unificarlas al separar temporadas).

## Perfil: orden (pedido de ZoTaD)

El perfil ya tiene tres pisos (ficha a lo ancho; partidas + costado; tres columnas
de héroes y gente). Con lo nuevo (mío):

- Piso 1: ficha + rastro de rango + **calculadora de rango** (chica) + puestos + rasgos.
- Piso 2 (costado): contra tu banda, forma, **suerte de rango**, actividad.
- Piso 3: "Tus héroes" fusionado con el percentil por héroe (columna ancha), ajuste
  de héroe + **tu build vs la banda**, gente.

Se mide en el navegador a 1280, 1440 y 375 px: ninguna columna puede terminar más de
~200 px antes que su vecina; si pasa, se mueve una tarjeta.

## Etapas (un PR cada una)

1. Temporadas + calculadora de rango + suerte de rango (por la fecha del 5/11).
2. Minuto de compra + escalado espiritual.
3. Mapa de calor.
4. Héroes contra la banda + build contra la banda + orden del perfil.
5. Imagen para compartir.

Cada etapa: tests sin red, perf contra `vite preview`, vista previa, merge (flujo
delegado) y verificación en vivo.
