# Meta por banda de rango

**Fecha:** 2026-07-23
**Estado:** decisiones tomadas, pendiente de implementación

## El problema

El pipeline descarga toda la escalera y el build usa solo challenger, grandmaster y master.
Todo lo demás —**el 48% de lo que traemos**— se descarta.

Medido sobre el store al 2026-07-23, de 8.203 partidas en disco el build usó 3.115:

| Banda | Partidas | Tableros |
|---|---|---|
| Challenger | 42 | 336 |
| Grandmaster | 554 | 4.432 |
| Master | 906 | 7.248 |
| **Diamante** | **2.181** | **17.448** |
| Esmeralda | 428 | 3.424 |
| Platino | 413 | 3.304 |
| Oro | 279 | 2.232 |
| Plata | 313 | 2.504 |
| Bronce | 258 | 2.064 |
| Hierro | 288 | 2.304 |

**Diamante es la banda con más datos y es la primera que tiramos.** Challenger sola tiene 42
partidas: LAS tiene unos 40 jugadores en ese rango, así que nunca va a dar más.

El filtro tiene una razón buena, documentada en `build.ts`: promediar Hierro con Máster
producía 267 "comps" que describen lo que pasa en la ladder, no lo que gana. Pero la
conclusión correcta no era descartar, sino **separar**.

## Y hay una brecha con los competidores

| | Corte por defecto | ¿Filtro configurable? |
|---|---|---|
| MetaTFT | Platinum+ | sí, por rango y región |
| tactics.tools | Diamond+ | sí |
| **Vestigo** | **Master+** | **no** |

Somos más restrictivos que ambos y sin la perilla para aflojarlo.

## Decisiones

| Decisión | Elección |
|---|---|
| Alcance | Filtro en la tier list **y** analizador por banda del jugador |
| Agrupación | Cuatro grupos fijos |
| Bandas | Apex (Chall+GM+Master), Diamante/Esmeralda, Platino/Oro, Plata y abajo |

Cuatro grupos y no acumulativo ("Diamante+") porque lo que se quiere saber es **qué gana en
tu rango**, no qué gana de tu rango para arriba. Acumular diluye justo lo que se busca.

Tableros por grupo hoy: Apex 12.016 · Diamante/Esmeralda 20.872 · Platino/Oro 5.536 ·
Plata y abajo 6.872. Los cuatro alcanzan; los dos últimos van justos y hay que marcarlos.

## El límite que manda: el tamaño

`comps.json` pesa **858 KB** y el bundle ya está en **1.088 KB**. Cuatro bandas serían
~3,4 MB de bundle. No entra.

Dónde está el peso, medido: **`units` es el 87%** del archivo, y dentro de él `items`
(79 KB) y `winnerItems` (74 KB). **Ninguno se puede podar**: `winnerItems`, `winnerBoards`,
`loserBoards` y `signatures` los lee `metaGap.ts` para comparar el tablero del jugador
contra el meta.

Dos medidas, entonces:

1. **Escribir el JSON sin sangría.** `JSON.stringify(x, null, 2)` cuesta el 46% del archivo
   y no lo lee ningún humano: 858 KB → 464 KB, gratis.
2. **Cargar las bandas bajo demanda.** Apex viaja en el bundle porque es el default; las
   otras tres se piden con `import()` dinámico y Vite las emite como chunks aparte.

Resultado: el bundle queda como está, y elegir otra banda cuesta una descarga de ~460 KB
una sola vez.

## Diseño

### 1. Pipeline

`build.ts` corre una vez por grupo y escribe `comps.<banda>.json`, `units.<banda>.json`,
`items.<banda>.json`. `TFT_BANDS` ya existe como variable de entorno, así que el motor de
agregación no cambia: cambia quién lo invoca y cuántas veces.

Cada archivo lleva su propio `sampleSize` y su `calibration`, porque el costo de contención
y el umbral de oro **no son los mismos en Hierro que en Máster** — y eso es precisamente lo
que hace que este cambio valga.

### 2. UI

Selector de banda en la tier list, con la banda en la URL para que cada meta sea una página
indexable: `/es/tft/meta/rango/diamante`. Reusa el router y el sitemap ya existentes.

La banda elegida se recuerda, como el idioma.

### 3. Analizador

Cuando alguien busca su perfil, se resuelve su rango con
`GET /tft/league/v1/by-puuid/{puuid}` —uno de los endpoints disponibles que todavía no
usamos— y el reporte se calcula contra el meta de **su** banda.

Si no tiene rango (sin clasificar, o la banda no tiene muestra suficiente), cae a Apex y lo
dice explícitamente. Un consejo de challenger dado a un jugador de oro sin avisar es peor
que no dar consejo.

## Fuera de alcance

- Filtro por región. Los competidores lo tienen; nosotros tenemos un solo servidor de datos.
- Bandas acumulativas además de las fijas.
- Rehacer el pull. Aparte: hoy `pull:all` trae bandas que el build sí va a usar después de
  este cambio, así que deja de ser desperdicio por sí solo.

## Riesgo

El grupo Platino/Oro y el de Plata para abajo tienen entre 5.500 y 6.900 tableros, contra
los 20.872 de Diamante/Esmeralda. Van a producir menos comps y con más varianza. La
etiqueta "Pocas partidas" que ya existe debe aplicarse por banda, no sobre el total.
