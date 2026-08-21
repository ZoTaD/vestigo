# El informe de partida de Deadlock

2026-08-11. Acordado con ZoTaD en seis preguntas; las respuestas están abajo
como decisiones, no como opciones.

Es la feature **#2 de [[vestigo-perfil-de-jugador]]** ("¿qué te costó esta
partida?") con la **#1** (el buscador) como puerta de entrada. El perfil agregado
—los consejos sobre tus últimas 20 partidas— reusa todo lo de acá y viene
después.

## Qué es

Buscás tu nombre de Steam y arriba del historial aparece tu ficha —avatar de
Steam, rango o calibración, partidas, victorias, KDA y almas por minuto, héroes
más jugados—. Abrís una partida y la página muestra, en este orden:

1. **El marcador**: los dos equipos uno debajo del otro, a todo el ancho, con
   nombre de la persona y del héroe, la nota, almas, K/D/A, daño, objetivos,
   curación y los doce objetos con los que terminó.
2. **El gráfico de almas de los doce**, minuto a minuto.
3. Del jugador que elijas: **de qué está hecha su nota**, **qué compró y
   cuándo**, y **hasta tres consejos de compra** con el número que los respalda.

**La nota se abre en una oración, no en tres barras.** Las barras solas obligan
a saber para qué lado es bueno cada señal y cuál pesa más; la oración lo dice
—*"lo que más te costó: muertes. Tu parte fue 20% de la de tu equipo, y la de un
Infernus típico es 17,3%"*— y las barras quedan como el detalle que la respalda.
Sale de `impact`, el desvío de cada señal por su peso: negativo es lo que restó,
y vale para las tres por igual porque en muertes el peso ya viene negativo.

**El gráfico de almas se toca.** Al pasar el puntero —o el dedo: son eventos de
`pointer`, no de `mouse`— aparece una guía vertical y, debajo, las almas de cada
jugador en ese minuto, ordenadas de mayor a menor; apretando un nombre se abre
su informe. La leyenda es el filtro: se apagan jugadores para comparar sólo a
los que interesan, y **la escala se reajusta a lo que quedó visible**, que es
justamente para qué se apaga al más rico.

**El desglose de la nota no es decoración, y eso está medido.** Sobre doce
partidas reales de una cuenta, la mitad devuelve uno o cero consejos de compras
—el motor tiene razón: no había nada que decir— y ahí una letra sola no contesta
"¿por qué C+?". El desglose sí: dice en cuál de las tres señales quedaste por
debajo de un jugador típico de ese héroe. Sin eso, la nota sería el *grade* de
Statlocker, que es justo lo que este producto no quiere ser.

## Las seis decisiones

1. **La unidad es la partida.** El perfil agregado viene después y reusa el mismo
   motor. La partida suelta se construye primero.
2. **El informe habla de tus compras**, leídas contra el equipo rival: qué
   compraste, en qué minuto, contra qué composición y contra quién te estaba
   haciendo daño. **No habla de muertes, de farmeo ni de habilidades**, porque
   esas familias todavía no están medidas y un consejo sin medición es una
   opinión. Cuando se midan, entran.
3. **Hasta tres consejos, ordenados por lo que costaron, y cero es una respuesta
   válida.** Si ninguno pasa el umbral el informe dice que la partida se compró
   bien en vez de rellenar. Es la misma regla que hace que las etiquetas de la
   tier list se vean: la mayoría no tiene ninguna.
4. **La nota se mide contra el mismo héroe, en la misma banda, en partidas de
   duración parecida.** No contra los otros once del lobby (siempre habría un A+
   y un F aunque la partida entera fuera mala) y no contra un puntaje con pesos
   elegidos por nosotros (eso es el *grade* de Statlocker, que no explican).
5. **Los pesos de la nota ya están medidos**: `mechanism.ts` estimó muertes
   evitadas 0,442, daño 0,133 y daño mitigado 0,006 —ruido, no entra—. La nota no
   decide que morir pesa el triple que pegar: lo hereda de una regresión.
6. **Cada consejo se puede abrir.** La letra y la frase van adelante; el número
   que las produce va atrás, en el tooltip. Es lo mismo que se hizo con
   "Difícil/Subiendo" en la tier list.

## Por qué no es un catálogo de reglas

La forma obvia de esto es escribir reglas: *si el rival tiene dos héroes de
espíritu y vos no compraste resistencia antes del minuto 20, mostrá este texto*.
Se descartó por tres motivos: los umbrales los elegiríamos nosotros, cada parche
los invalida en silencio, y la cobertura no escala — 38 héroes por 156 ítems no
se cubre escribiendo reglas.

**Lo que se construye son familias de consejo, y todas leen la misma tabla
medida.** Una familia es una plantilla de texto más un disparador; el disparador
compara *lo que hiciste* contra *lo que hicieron los que ganaron desde tu misma
situación*. "Tarde" no es "después del minuto 20": es "doce minutos después que
la mediana de los ganadores en tu héroe contra este tipo de rival". Cuando Valve
parchee, los umbrales se mueven solos en la próxima corrida.

Nueve familias en la primera versión. Agregar la décima es escribir un
disparador de quince líneas, no medir de nuevo.

| Familia | Dispara cuando | Contra qué se compara |
|---|---|---|
| `resist` | el daño que recibiste fue mayormente de un tipo y no compraste resistencia de ese tipo | tasa de compra entre ganadores de tu héroe en tu perfil de rival |
| `skipped` | no compraste algo que compran casi todos los ganadores de tu héroe | tasa de compra |
| `late` | compraste algo que casi todos los ganadores compran, mucho después | mediana del minuto de compra de los ganadores |
| `unupgraded` | terminaste con el escalón anterior de una cadena que los ganadores mejoran | tasa de compra de la mejora |
| `souls` | terminaste la partida con muchas almas sin gastar | almas sin gastar de los ganadores |
| `slots` | terminaste con menos objetos que los ganadores | objetos medianos de un ganador |
| `split` | repartiste las almas muy distinto a los ganadores de tu héroe | reparto mediano por categoría |
| `imbue` | no imbuiste ninguna habilidad | tasa de imbuido del héroe |
| `sold` | vendiste algo que los ganadores que lo compran conservan | tasa de venta, descontando las mejoras |

**Una sola por familia.** Con tres lugares, tres familias distintas dicen tres
cosas distintas. Sin esta regla, la primera partida real devolvió "vendiste X",
"vendiste Y" y una tercera: el mismo consejo tres veces.

**Los counters por rival quedaron afuera de esta versión.** Están medidos y
publicados en `builds.json`, pero cargar ese archivo además del nuestro en la
página de una partida son 350 KB más para una sola familia. Entra cuando la
página tenga con qué justificar el peso.

## De dónde salen los datos

**Dos fuentes, y ninguna es nueva.**

- **La partida, en vivo**: `api.deadlock-api.com`. Verificado el 2026-08-11:
  `access-control-allow-origin: *`, así que **le pega el navegador directamente**
  y no hace falta pasar por el Worker. El Worker de Cloudflare existe para
  esconder la key de Riot, y acá no hay ninguna key que esconder. La metadata de
  una partida trae `Cache-Control: public, max-age=604800`.
- **La referencia, medida por nosotros**: `games/deadlock/data/report.json`
  (181 KB), que publica un `npm run build:report` nuevo contra el mismo snapshot
  y la misma ventana anclada al parche que usan las builds. Medido sobre
  **632.952 jugadores de 52.746 partidas**. Corre **una vez por día (18:30 UTC)**
  dentro de `publish-deadlock.yml`: cuesta ~5,5 minutos, casi todo en cargar la
  ventana, y "qué compra el que gana con este héroe" no cambia de una hora a la
  otra. Va después de `build:builds` porque le saca los pesos del mecanismo.

Lo verificado hoy pegándole a la API:

| Endpoint | Qué da | Medido |
|---|---|---|
| `players/steam-search` | cuentas por nombre, con avatar y partidas de 30 días | 6 resultados para "ZoTaD" |
| `players/{id}/steam` | avatar, nombre y país de una cuenta suelta | para el link directo, sin haber buscado |
| `players/{id}/match-history` | historial con héroe, KDA, patrimonio, duración, resultado y fecha | 461 partidas |
| `players/{id}/rank` | **el rango de verdad**, la calibración y el cambio de progreso de la última partida | badge 0, calibración 3 |
| `matches/{id}/metadata` | 12 jugadores con compras (minuto y si se vendió), series de stats cada ~4 min, muertes con coordenadas y `damage_matrix` | 1,2 MB |

**El rango NO sale del historial, y eso está medido**: de las 461 partidas de una
cuenta real, **ninguna** trae `ranked_display_badge` distinto de cero. Leerlo de
ahí mostraría "sin rango" a todo el mundo para siempre. `players/{id}/rank`
además distingue dos ceros que se ven iguales: el de una cuenta **calibrando**
—y dice cuántas lleva de las ocho— y el de una que nunca jugó ranked.

**El resumen del perfil no pide un endpoint más**: sale del mismo historial que
dibuja la lista.

**La curva de almas tampoco**: la serie `stats` de la metadata trae `net_worth`
muestreado cada ~4 minutos, que es la misma que ya se leía para sacar el daño
final. Doce curvas, coloreadas por equipo —ámbar `Team0` es Hidden King, zafiro
`Team1` es Archmother— y la del jugador elegido gruesa encima. **Adentro del SVG
no va ni una palabra**, que es la regla que salió de la dispersión de ítems.

**El `damage_matrix` sirve pero no dice el tipo de daño.** Trae
`damage_dealers → damage_sources → damage_to_players` con series acumuladas, y
`source_details` con `stat_type` (0-5) y `source_name`. Medido: `stat_type` **no
es** el tipo de daño —los tipos 0, 3 y 4 traen los mismos nombres de fuente—, así
que **de ahí sale quién te pegó y cuánto, no con qué**. El tipo se resuelve por
el otro lado, que ya está construido y validado: `damageSplit` de `buildCard.ts`
reparte las almas de una build por categoría de tienda (arma / vitalidad /
espíritu), que es la cuenta que hace el juego. El perfil del rival es la cuota de
espíritu de lo que gastó el equipo enemigo, pesada por quién te hizo daño.

## La nota

Tres señales —almas, daño a héroes y muertes—, cada una como **cuota del propio
equipo**. Se normalizan contra **mismo héroe × mismo tramo de duración**, se
combinan con los pesos del mecanismo y el compuesto se corta en nueve letras
(A+ … D) por los percentiles reales de esa celda, no por una tabla inventada.

**Que las señales sean cuotas y no números por minuto es el hallazgo de la
primera medición, y costó dos corridas.** Con almas por minuto y daño por
minuto, los rangos intercuartiles de ganadores y perdedores **no se solapaban en
nada** —el solapamiento medido dio **−21,8%**, o sea que quedaba un hueco entre
los dos grupos— y el peso más alto se lo llevaba el daño a objetivos, que es casi
la definición de ganar: el equipo que gana rompe las torres y se lleva las almas.
Dividiendo por el total del equipo, la suerte del equipo se cancela y el
solapamiento sube a **82%**.

**Los pesos no se re-estiman contra `won`, y también se probó.** Con las cuotas,
que suman 1 dentro de cada equipo, la regresión devuelve coeficientes de
milésimas y con el signo dado vuelta en objetivos: la letra la decidiría el
ruido. Se usan los del mecanismo, que contestan la pregunta correcta —cuánto vale
una muerte, un alma y un punto de daño **al margen**, medido sobre miles de
compras pareadas— y salen de `builds.json`, así se actualizan con cada corrida de
`build:builds`. Normalizados dan **almas 0,287 · daño 0,165 · muertes −0,548**.
El daño a objetivos y el mitigado quedan afuera por lo mismo: nadie midió cuánto
valen.

**Dos guardas, y son la parte importante.**

- **Sin muestra no hay letra.** Un héroe con menos de 300 jugadores en ese tramo
  no muestra nota. Un hueco es honesto; una letra inventada no.
- **La nota no puede ser un espejo del resultado.** El solapamiento se publica en
  `report.json` y hay un test que falla si baja de 0,4.

**Se mide en una sola banda**, la misma que las builds y por el mismo motivo de
peso. La página dice contra cuál está comparando en vez de callarlo.

## Dónde vive

- `/{lang}/deadlock/player` — el buscador. Pestaña nueva, "Jugador".
- `/{lang}/deadlock/player/{account_id}` — el historial.
- `/{lang}/deadlock/match/{match_id}` — el informe. **Sección sin pestaña**: se
  llega desde el historial o desde un link compartido.

**La URL de una partida es pública y funciona sola**, que es lo que se comparte
en Discord: el que abre el link no es el que buscó. Decidido explícitamente, no
por omisión. Es lo mismo que hacen Dotabuff y OpenDota desde hace años y la API
de la que sale ya es pública.

`report.json` se carga con `import()` dinámico y **no entra en el bundle**, por
lo mismo que las builds: nadie aterriza en una partida sin hacer clic.

## Cómo se prueba

- `report.ts` publica; la lectura vive en módulos puros con tests
  (`deadlockAdvice.ts`, `deadlockGrade.ts`), igual que `families.ts` o `tags.ts`.
- Tests que fijan el criterio, no los números: que un informe sin nada que decir
  devuelva cero consejos, que ninguno se muestre sin su número, que la nota se
  omita sin muestra, y el solapamiento ganadores/perdedores.
- La página se verifica **mirando la pantalla renderizada**, no el DOM. Ver
  [[verificar-mirando-la-pantalla]].

## El marcador, mirando cómo lo hacen los demás

Se miró la página de partida de **Statlocker** (2026-08-11) para no reinventar
qué columnas espera alguien que ya usa un tracker. Las suyas: rango, jugador,
casilla, su nota (`MVP`, de S+ a E−), almas, K, D, A, daño, objetivos, curación,
objetos y orden de habilidades, con vistas normal y compacta y pestañas de
resumen, MVP, carriles, mapa y gráficos.

**Se copió la lista de columnas y nada más**, porque eso es vocabulario del
género y no de ellos: sin nombres y sin daño, un marcador se lee como una demo.
Lo que **no** se copió es el fondo — su nota es la que no explican, y en la
partida que se miró el equipo perdedor entero sacaba E+/E−, que es la firma de
una letra que mide el resultado. La nuestra publica su solapamiento (82%) y se
abre en las tres señales que la forman.

Dos decisiones propias del marcador:

- **Los equipos van uno debajo del otro, a todo el ancho.** Lado a lado, ocho
  columnas en 570 px parten cada número en dos renglones.
- **Los números grandes van en `k`** (44,1k) y el exacto viaja en el `title` de
  la celda. En español `notation: "compact"` imprime "44,1 mil", que son ocho
  caracteres para una columna de tres.

Los nombres cuestan **un pedido más** (`players/steam` con las doce cuentas,
~90 KB) y se piden **después** de dibujar la partida: si no llegan, queda el
nombre del héroe en su lugar.

## Una trampa de los datos que ya se pagó

**El array `items` de una partida trae también lo que no se compra en la
tienda.** Sin filtrar por catálogo, un jugador terminaba con "16 objetos" cuando
el tope del juego es 12, y la familia que los cuenta comparaba contra la mediana
de los ganadores como si fueran lo mismo. El catálogo tiene los 156 de tienda y
es el filtro; hay un test que lo fija.

## Lo que queda afuera a propósito

- **Muertes, farmeo y habilidades**: no están medidas todavía.
- **Login con Steam**: no hace falta para nada de esto.
- **El perfil agregado**: es lo que sigue, y reusa el mismo motor.
