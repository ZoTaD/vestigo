# Cómo presentamos los datos: análisis y diseño

- **Fecha:** 2026-09-06
- **Estado:** análisis y diseño, **sin implementar**. Pedido de ZoTaD: mirar la
  competencia, revisar cómo ordenamos la información en la portada y en cada
  pestaña de Deadlock, y proponer cambios "con respaldo de papers o de gente que
  diga esta es la posta".
- **Método:** capturas del sitio en vivo (portada, Meta, Objetos, Rangos,
  Escalera, Parches, Jugador y la página de Viscoso) en escritorio a 1060 px y en
  móvil a 420 px; capturas de ocho competidores (Tracklock, Mobalytics Deadlock,
  tactics.tools, MetaTFT, op.gg, u.gg, Lolalytics, Dotabuff); los números de
  Google Analytics y Search Console del mismo día. Statlocker no se visitó (nos
  bloquea agentes, ver el doc del 2026-08-25).

---

## 0. El dato que ordena todo lo demás

Antes de discutir columnas y cajas, lo que dicen las visitas:

| Últimos 28 días | Valor |
|---|---|
| Usuarios activos (GA, sólo quien acepta cookies) | 11 |
| Sesiones directas / desde Google | 145 / 3 |
| Vistas por usuario | 64 |
| Impresiones en Google | 1.970 |
| Clics desde Google | 1 |
| Posición media | 43,7 |

Google nos muestra dos mil veces y nadie clickea, porque a posición 44 estamos
en la segunda página. Las páginas más vistas son la tier list de Deadlock,
Rangos, Escalera, Objetos y el perfil propio.

Consecuencia para este documento: **el diseño no tiene que convencer a nadie de
quedarse en la portada, tiene que hacer que la persona que cae en una página
interior desde Google encuentre lo que buscaba en el primer pantallazo y tenga
un motivo para volver mañana.** La portada importa menos de lo que parece: casi
nadie entra por ahí. Lo que entra por Google entra por `/tft/items/...`,
`/tft/meta/...` y `/deadlock/<héroe>`.

---

## 1. Lo que hace la competencia, y por qué les funciona

Ocho sitios, dos géneros (MOBA y autobattler), y los patrones se repiten tanto
que ya son convención del género. Lo que un visitante espera encontrar:

| Patrón | Quién lo hace | Qué resuelve |
|---|---|---|
| **Buscador de jugador arriba de todo**, en cada página | op.gg, u.gg, Tracklock, tactics.tools, MetaTFT, Dotabuff | El caso de uso número uno de un sitio de stats es "buscarme". Está a un tap desde cualquier lado. |
| **Franja "trending / qué cambió"** debajo del buscador | tactics.tools ("Top Trends" con deltas), u.gg (parche y fecha de actualización), Dotabuff ("Trends") | Da un motivo para mirar aunque no vengas a buscar nada. Es lo que convierte una visita en una vuelta. |
| **Marcadores / "recientes"** | tactics.tools (Bookmarks), op.gg (favoritos), Tracklock (login Steam) | La segunda visita cuesta cero. |
| **Tabla densa y ordenable** como vista principal de héroes | u.gg, Lolalytics, Dotabuff, Tracklock | Comparar 38 cosas se hace con columnas, no con tarjetas. |
| **Tier list como resumen**, tabla como detalle | u.gg (fila de S+/S/A arriba, tabla debajo), MetaTFT | Dos niveles de lectura: el que quiere la foto y el que quiere el número. |
| **Página de héroe con pestañas fijas** (Builds, Items, Skill path, Matches) | Tracklock, Mobalytics, Dotabuff | Contenido largo, navegación corta. |
| **Filas de partida codificadas por color** (borde verde/rojo, KDA, ítems como iconos) | Tracklock, op.gg, Dotabuff | Se escanea el historial sin leer una palabra. |
| **Filtros como chips visibles** (rango, región, ventana de días, modo) | Todos | El contexto del número está a la vista, no en un menú. |
| **"Última actualización: hace N minutos"** | u.gg, MetaTFT, tactics.tools | Confianza. Dice que el dato está vivo. |

Lo que **no** conviene copiar: publicidad que tapa el contenido (op.gg, MetaTFT,
tactics.tools), el popup "permití anuncios", un número de skill opaco, y el
banner de la app de escritorio. Nada de eso es diseño de información; es
monetización, y ya está decidido que Vestigo no va por ahí.

Lo que Vestigo tiene y ninguno tiene: identidad visual propia (la competencia es
intercambiable: fondo azul oscuro, tarjetas grises, fuente del sistema), textos
que explican qué mide cada número, y datos que nadie más publica (brecha de
habilidad, precisión por héroe, compañeros y rivales, el informe de partida).
**El problema no es el contenido, es que está más lejos de lo que debería.**

---

## 2. Diagnóstico página por página

### 2.1 Portada

Lo que hay: un eslogan a dos líneas, un párrafo, dos cifras de vanidad
("647.717 partidas leídas"), y dos bloques de juego con "Entrar". A 1060 px el
primer pantallazo termina antes del bloque de Deadlock; en móvil, antes del de
TFT.

- No hay **nada para hacer** en el primer pantallazo. Ni buscador, ni un dato
  del día, ni un enlace a una página concreta. Es una portada de producto, no
  de un sitio de datos.
- Las cifras grandes no responden ninguna pregunta del visitante. "647.717
  partidas" es un argumento de confianza, no de uso; puede ir chico y al pie.
- Los bloques de juego repiten el patrón: título, una frase, botón. Los dos
  números de cada bloque (3,42 · 624.224) son igual de decorativos.

Lo que sí funciona y hay que conservar: la identidad tipográfica, el contraste
crema/oscuro, y que se entiende en un segundo que hay dos juegos.

### 2.2 Cabecera común de Deadlock

Título ("Tier list de héroes"), tres líneas de bajada **truncadas con puntos
suspensivos**, selector de banda a la derecha con una aclaración también
truncada, y una línea de metadatos. Ocupa el 40 % del primer pantallazo en
escritorio, y en móvil empuja la primera fila de la tier list fuera de la
pantalla. **En móvil, la barra de pestañas se corta** ("Parches" a medias,
"Jugador" invisible) y la navegación superior también ("DEADLC").

### 2.3 Meta

La tier list en filas S/A/B/C/D con tarjetas de héroe es la convención correcta
del género y se lee bien. Problemas:

- **Media pantalla vacía** a la derecha de S (3 héroes) y B (5). El ojo lee
  filas de izquierda a derecha y encuentra aire.
- Cada tarjeta trae winrate y pickrate, y arriba un rombo diminuto que marca
  tendencia o dificultad. **No se puede ordenar ni filtrar**: si querés saber
  cuál se juega más tenés que leer 38 tarjetas.
- **El detalle de un héroe se despliega debajo de su fila**, así que la página
  de Viscoso empieza con la tier list entera, luego el detalle, y el resto de la
  tier list después. El que llega desde Google a `/deadlock/viscous` ve la tier
  list, no a Viscoso.
- Debajo de la tier list, vacío, y luego el pie legal. La página termina sin
  darle al visitante un siguiente paso.

### 2.4 Objetos

Es la mejor pantalla del sitio: dos columnas, a la izquierda la lista ordenada
con el número grande ("+5,74 ventaja"), a la derecha el gráfico de precio contra
rendimiento y dos listas cortas ("vale más de lo que se usa", "se compra más de
lo que rinde"). Es la estructura resumen → ranking → detalle. Lo que falta:

- La cabecera de columnas ("VENTAJA · VICTORIAS · USO") sólo aparece dentro de
  cada fila, en gris chico. No hay cabecera fija ni orden alternativo.
- El gráfico de dispersión no tiene etiquetas al pasar el mouse ni cuadrantes
  nombrados: es bonito y no se lee.
- Los filtros por categoría (arma/vitalidad/espíritu) y por precio están
  implícitos en los iconos de cada fila; deberían ser chips arriba.

### 2.5 Rangos

La distribución por rango y el apilado por día están bien elegidos (barras,
posición sobre un eje común). Lo que falta es **la pregunta que trae a la gente
a una página de rangos: "¿dónde estoy yo?"**. Un campo para ingresar tu rango
(o tomarlo del último perfil visto) que responda "estás por encima del 71 % de
los jugadores medidos" es lo que convierte esta página en algo para compartir.
Además: la leyenda de colores no está en el gráfico por día, y las barras
apiladas absolutas esconden la proporción (hace falta el toggle "en %").

### 2.6 Escalera

Tabla correcta (rango, jugador, rango del juego, puntaje, G/J), panel derecho
"por héroe" con la grilla de retratos, que es el patrón de búsqueda rápida de
Dotabuff. Faltan: cabecera fija al scrollear, buscador por nombre dentro de la
tabla, que clickear un jugador abra su perfil (hoy se ve el nombre y nada más),
y que "por héroe" muestre en la tabla al héroe elegido en vez de una lista
aparte.

### 2.7 Parches

Hoy la página dice "Todavía ningún héroe se movió lo suficiente como para
llamarlo un cambio" y debajo una lista de fechas con enlaces a las notas de
Valve. Es una página vacía la mayor parte del mes. Debería ser **el registro de
cambios del sitio**: para cada parche, qué héroes subieron y bajaron, qué ítems,
en cuánto y con cuánta muestra. El mismo dato que ya alimenta `patchMovers`.

### 2.8 Jugador

Orden actual de bloques: buscador → lista de partidas (15 filas) → tarjeta de
identidad (nombre, rango, KPIs) → forma reciente → más jugados → tus héroes →
compañeros → rivales → actividad. **La identidad del jugador aparece después de
quince filas de tabla.** Toda la competencia pone la tarjeta de identidad
arriba a la izquierda, y las partidas debajo o a la derecha.

La tabla de partidas no tiene el código de color por resultado en el borde de la
fila, que es el patrón que permite ver "cuatro derrotas seguidas" sin leer. Los
nombres de columna (K/M/A, GP/DN) suponen que ya sabés qué significan.

### 2.9 Página de héroe

El contenido es el más rico del sitio (inversión de almas, build core, orden de
habilidades, orden de compra por fase, situacionales, maestría). Los problemas
son de navegación, no de contenido: no hay ancla ni sub-pestañas, no hay
resumen arriba (cuatro números: winrate, uso, brecha, cambio de parche), y la
página arranca con la tier list de otros 38 héroes.

### 2.10 Móvil

- Pestañas de Deadlock y navegación superior cortadas sin indicador de scroll.
- El selector de banda ocupa tres filas.
- Las tarjetas de héroe de la tier list quedan de 4 por fila con texto de 10 px.
- El buscador de jugador no existe fuera de la pestaña Jugador.

---

## 3. Principios con respaldo, y qué le hacen a cada pantalla

Cada regla de abajo aparece en el diseño de la sección 4 con su etiqueta entre
corchetes. Las referencias completas, con URL, están al final.

**[Shneiderman 1996] Resumen primero, zoom y filtro, detalle a pedido.** El
"mantra" de la visualización de información: la vista inicial muestra el
conjunto entero, los controles reducen, y el detalle aparece cuando se lo pide.
Aplicado: tier list (resumen) → tabla ordenable con filtros (zoom) → página de
héroe (detalle). Hoy tenemos el resumen y el detalle, y nos falta el medio.

**[Nielsen 2006, 2017] Patrón F y "la gente no lee, escanea".** Los ojos
recorren la parte superior, luego el margen izquierdo, y de a poco menos hacia
abajo. Lo importante va arriba a la izquierda y al principio de cada línea.
Aplicado: la identidad del jugador arriba a la izquierda; la primera columna de
toda tabla es el nombre; los títulos de tarjeta empiezan con la palabra que
importa ("Compañeros", no "Con quién jugás").

**[NN/g 2018] El 57 % del tiempo de lectura va al primer pantallazo, y el 74 %
a las dos primeras.** Cada cosa que empuja contenido fuera del primer
pantallazo le cuesta la mitad de su audiencia. Aplicado: cabeceras de una
línea, bajadas plegadas, y en la portada un buscador y un dato del día antes del
pliegue.

**[Cleveland & McGill 1984] Jerarquía de codificaciones.** Lo que la gente
compara con precisión, en orden: posición sobre un eje común > longitud > ángulo
> área > color. Aplicado: los rankings van en barras alineadas, no en
dispersión; los porcentajes de una tarjeta se acompañan de una barra chica; el
color se usa para categoría (victoria/derrota, arma/vitalidad/espíritu), nunca
para magnitud.

**[Tufte 1983, 2006] Relación tinta/dato, múltiplos pequeños, sparklines.**
Sacar todo pixel que no lleve información; repetir el mismo gráfico chico para
cada elemento en vez de uno grande; una línea de tendencia del tamaño de una
palabra al lado del número. Aplicado: sparkline de winrate por día en cada fila
de héroe, y "multiplos pequeños" para las cuatro bandas en la página de héroe.

**[Few 2006] Un dashboard cabe en una pantalla, sin scroll, y ordena por
importancia.** Aplicado: el perfil de jugador como panel de dos columnas donde
lo esencial (rango, racha, forma, KPIs) está en el primer pantallazo.

**[Wertheimer 1923; Palmer 1992] Gestalt: proximidad y región común.** Las
cosas que están cerca o dentro del mismo borde se leen como un grupo; una caja
vale más que un título para decir "esto va junto". Aplicado: cada pregunta del
perfil es una caja con un título de una palabra; los filtros van dentro de la
caja que filtran.

**[Miller 1956; Cowan 2001] Chunks: cuatro, más o menos uno.** La memoria de
trabajo sostiene unos cuatro grupos. Aplicado: un máximo de cuatro KPIs en una
fila, cuatro sub-pestañas en la página de héroe, cuatro filtros visibles.

**[Hick 1952; Fitts 1954] Menos opciones, blancos más grandes.** El tiempo de
decidir crece con el logaritmo de las opciones, y el tiempo de apuntar con la
distancia y el tamaño. Aplicado: pestañas de Deadlock reducidas de seis a
cinco; controles de 44 px en móvil; el buscador como blanco grande arriba.

**[Sweller 1988] Carga cognitiva.** Todo lo que el lector tiene que decodificar
(abreviaturas, iconos sin etiqueta, colores sin leyenda) compite con lo que
quiere entender. Aplicado: "K/M/A" y "GP/DN" con etiqueta completa en la
cabecera y el tooltip; leyenda pegada al gráfico; cuadrantes del scatter con
nombre.

**[Pirolli & Card 1999; NN/g] Rastro de información.** La gente sigue enlaces
por el "olor" que desprenden: un enlace dice qué hay del otro lado o no lo
siguen. Aplicado: "Entrar" no dice nada; "Tier list de hoy · 38 héroes" sí.

**[NN/g, Progressive disclosure] Mostrar lo esencial, ofrecer el resto.**
Aplicado: bajadas y notas metodológicas plegadas detrás de un "cómo se mide";
página de héroe con resumen arriba y secciones ancladas.

**[NN/g, Data tables] Las cuatro tareas de una tabla: encontrar, comparar,
ordenar, filtrar.** Cabecera fija, ordenable por clic, filtro visible, primera
columna fija en móvil. Aplicado: Escalera y la vista tabla de Meta.

**[Fogg 2009; Eyal 2014] Disparador → acción → recompensa variable →
inversión.** El modelo de comportamiento y el "ciclo del gancho": para que
alguien vuelva hace falta un disparador (el parche salió, el sitio se
actualizó), una acción de un solo paso (buscarme), una recompensa que cambie
cada vez (mi nota de hoy, mi racha, qué se movió), y una inversión que deje
algo guardado (mi perfil marcado, mis héroes seguidos) que hace que la próxima
vuelta sea más fácil. Aplicado en la sección 5, y con un límite: lo honesto de
Vestigo es la recompensa real (el dato), no la fabricada (notificaciones,
puntos, rachas artificiales).

**[Fredrickson & Kahneman 1993] Regla del pico y del final.** Lo que se
recuerda de una experiencia es su momento más intenso y cómo termina. Aplicado:
cada página termina con un siguiente paso concreto y no con el pie legal; el
perfil termina con la lectura de la racha, no con "Actividad".

**[Zeigarnik 1927] Lo inconcluso se recuerda.** Aplicado, con cuidado: "faltan
3 partidas clasificatorias para medir tu racha" es información verdadera y un
motivo de vuelta; no lo es una barra de progreso inventada.

---

## 4. Diseño propuesto

Un principio transversal: **cada pantalla tiene un primer pantallazo que
responde una pregunta sin scroll, y un solo camino hacia el detalle.**

### 4.1 Portada: de folleto a puerta de entrada

Primer pantallazo (escritorio y móvil), de arriba a abajo:

1. **Navegación** como está.
2. **Eslogan a una línea** ("Toda partida deja rastro") con la bajada de una
   frase. El bloque tipográfico se conserva, pero ocupa un tercio de lo que
   ocupa hoy. [NN/g 2018]
3. **Buscador de jugador**, grande, con dos chips a la izquierda para elegir
   juego (Deadlock / TFT), y debajo en gris "último visto: ZoTaD · Emisario III"
   si hay algo en `lastSearch`. Un clic y estás en tu perfil. [Fitts; Fogg]
4. **Franja "Hoy en el meta"**: tres tarjetas chicas por juego con un dato que
   cambia todos los días y enlaza a la página que lo explica. Para Deadlock:
   el héroe que más subió desde el parche (de `patchMovers`), el S de la banda
   por defecto, y el ítem con más ventaja. Para TFT, cuando vuelva: la comp
   número uno y el ítem que más sube. Cada tarjeta lleva "medido hoy 20:42" en
   chico. [Shneiderman; Pirolli & Card; Eyal]

Debajo del pliegue, los dos bloques de juego como están, pero el botón dice a
dónde va ("Tier list de héroes · 38", "Tu perfil") y los dos números de vanidad
se van al pie con "647.717 partidas leídas desde julio". [Pirolli & Card]

Lo que esto cambia: alguien que entra por la portada tiene tres cosas para
hacer en el primer segundo, y todas llevan a una página interior con un dato
propio.

### 4.2 Cabecera de sección de Deadlock

Una sola fila: título a la izquierda ("Héroes"), selector de banda como
**control segmentado** a la derecha, y debajo una línea de metadatos con un
enlace "cómo se mide" que despliega la bajada y la aclaración de la banda. Nada
truncado, nada de tres líneas. [Progressive disclosure; NN/g 2018]

Pestañas: **Héroes · Objetos · Rangos · Escalera · Jugador.** Parches se
absorbe en Héroes como filtro "desde el parche" y como registro de cambios
dentro de la misma página (4.6). Cinco es el número que entra en 420 px sin
scroll horizontal; si algún día son seis, la barra scrollea con un degradado
en el borde que avise que sigue. [Hick]

### 4.3 Héroes (hoy "Meta"): dos vistas, un dato

Un toggle arriba a la derecha: **Tiers | Tabla**.

**Tiers** es la vista actual, con tres cambios:

- El espacio vacío a la derecha de las filas cortas lo ocupa una **columna
  lateral fija** de 280 px con dos cajas: "Desde el parche" (cinco que
  subieron, cinco que bajaron, con el delta en puntos y una flecha) y "Más
  jugados" (cinco, con pickrate). Las dos ya existen como datos. [Gestalt
  región común; Tufte]
- En cada tarjeta, el rombo de tendencia se reemplaza por **una flecha con el
  delta** ("▲ +1,8") cuando hay cambio publicable, y la etiqueta Difícil/Fácil
  por un borde de color con leyenda en la columna lateral. [Sweller]
- Clickear un héroe **navega a su página** (4.7), no despliega debajo.

**Tabla** es la pestaña Héroes diseñada el 2026-08-13, que hoy no está
publicada: 38 filas, columnas Héroe · Victorias (con barra chica) · Uso ·
Cambio desde el parche · Brecha de habilidad · Precisión, cabecera fija,
ordenable por clic, filtro por texto y por rol. Sparkline de winrate en los
últimos 15 días en cada fila cuando el pipeline lo exponga. [NN/g Data tables;
Cleveland & McGill; Tufte]

Pie de página: en vez de vacío, **"Seguir leyendo"** con tres enlaces: el héroe
S, la tier list de objetos, y tu perfil. [Peak-end]

### 4.4 Objetos: consolidar lo que ya funciona

- **Chips de filtro arriba de la lista**: categoría (Arma / Vitalidad /
  Espíritu) y nivel de precio (I a IV). Los iconos de cada fila se quedan como
  refuerzo. [NN/g Data tables]
- **Cabecera de columnas fija** con los tres nombres, y ordenable. "Ventaja" se
  renombra a "Sobre su precio" con tooltip "puntos de winrate por encima de lo
  que rinde un objeto de su costo", que es lo que mide. [Sweller]
- El gráfico de dispersión gana **nombre en cada cuadrante** ("caro y rinde",
  "barato y rinde", "caro y no rinde", "barato y no rinde"), y **etiqueta al
  pasar el mouse** con el nombre y los dos números. [Cleveland & McGill]
- Las dos listas cortas de la derecha se quedan: son el "detalle a pedido" del
  scatter. [Shneiderman]

### 4.5 Rangos: agregar "dónde estás vos"

Arriba de la distribución, una caja de una línea: **"¿Tu rango?"** con el
selector de rango y división (o pre-cargado con el último perfil visto), que
responde en la misma caja "Emisario III: por encima del 71 % de los 27.049
jugadores medidos hoy". El punto se dibuja sobre la distribución. [Fogg; Eyal:
recompensa variable honesta]

El gráfico por día: leyenda de colores dentro del gráfico, toggle **"Absoluto |
En %"**, y el último día resaltado. [Sweller; Cleveland & McGill]

### 4.6 Escalera: la tabla completa

Cabecera fija, buscador por nombre dentro de la tabla, columna de bandera con
tooltip del país, y **la fila entera es un enlace al perfil**. El panel "por
héroe" pasa a ser un filtro de la tabla misma: elegir un retrato reordena por
las partidas con ese héroe, y el panel muestra el top 3 como hoy. [NN/g Data
tables; Fitts]

### 4.7 Página de héroe: una página, no un desplegable

`/deadlock/viscous` deja de mostrar la tier list. Estructura:

1. **Cabecera**: retrato, nombre, y **cuatro cifras** en una fila: Victorias
   (con la banda), Uso, Brecha de habilidad, Cambio desde el parche. Debajo, la
   fila de bandas como control segmentado. [Miller/Cowan; Few]
2. **Sub-pestañas ancladas** (fijas al scrollear): Build · Habilidades ·
   Maestría · Enfrentamientos. Cuatro, no más. Las secciones actuales se
   reparten ahí: inversión de almas y build core y orden de compra en Build;
   orden de habilidades en Habilidades; "qué compra la práctica" en Maestría;
   situacionales (y los counters cuando existan) en Enfrentamientos.
   [Progressive disclosure; Hick]
3. **Múltiplos pequeños** de winrate por banda: cuatro barras chicas iguales,
   una por banda, en la cabecera de Maestría. [Tufte]
4. Al pie: **"Héroes cerca en la tier list"** con el anterior y el siguiente, y
   "Volver a la tier list". [Peak-end; Pirolli & Card]

### 4.8 Jugador: panel de dos columnas

Escritorio, en el primer pantallazo:

```
┌──────────────────────────────┬──────────────────────────┐
│ Buscador (chico, arriba)      │                          │
├──────────────────────────────┤  IDENTIDAD               │
│ PARTIDAS                      │  nombre · rango · Steam  │
│ [Todas 502][Clasif. 20]...    │  4 KPIs: partidas,       │
│ ▌VICTORIA  Siete  C  6/6/8 …  │  victorias, KDA, almas/m │
│ ▌VICTORIA  Hiedra C+ …        ├──────────────────────────┤
│ ▌DERROTA   Guardia C+ …       │  FORMA  ●●○●●  2 seguidas│
│ ▌DERROTA   Guardia C …        ├──────────────────────────┤
│ …                             │  TUS HÉROES (5)          │
│                               ├──────────────────────────┤
│                               │  COMPAÑEROS (4)          │
│                               ├──────────────────────────┤
│                               │  RIVALES (5)             │
└──────────────────────────────┴──────────────────────────┘
```

- La columna derecha es de 340 px y **fija al scrollear**; las partidas
  scrollean a la izquierda. La identidad está arriba a la derecha del primer
  pantallazo y no después de quince filas. [Nielsen F; Few]
- Cada fila de partida lleva **borde izquierdo verde o rojo**, y la nota (C+,
  B) como chip con color propio. Cabecera de columnas con nombres completos y
  abreviatura debajo ("Golpes / Denies", no "GP/DN"). [Sweller; Cleveland &
  McGill: el color para categoría]
- En móvil, la columna derecha pasa **arriba** de las partidas, plegada a la
  identidad y los cuatro KPIs, con "Más" para el resto. [NN/g 2018]
- La pestaña Jugador sin búsqueda muestra **"Vistos recientemente"** (los
  últimos tres, desde `lastSearch`) y los cinco primeros de la Escalera como
  ejemplo clickeable, en vez de un buscador solo. [Eyal: inversión]
- El final de la página es la lectura de la racha ("Ganaste 2 seguidas; las
  últimas 20 van 10-10"), y no la caja "Actividad". [Peak-end]

### 4.9 Móvil, transversal

- Navegación superior: el nombre del juego activo y un menú, no las cinco
  entradas en fila.
- Pestañas de sección: chips scrolleables con degradado en el borde.
- Selector de banda: control segmentado de 2×2, no cuatro botones anchos.
- Tarjetas de la tier list: 3 por fila, retrato de 64 px, texto de 12 px
  mínimo; blancos táctiles de 44 px. [Fitts]
- El buscador de jugador vive en la cabecera de todas las páginas de Deadlock,
  como icono que se despliega.

---

## 5. Que vuelvan mañana, sin trucos

La palabra del pedido fue "adictivo". Lo que hace volver a la gente a un sitio
de stats, según lo que miden los que lo hacen bien y lo que dice el modelo de
Fogg y Eyal, son cuatro cosas, y las cuatro se pueden hacer con datos que ya
tenemos y sin login:

| Pieza del ciclo | Qué es en Vestigo | Qué hace falta |
|---|---|---|
| **Disparador** | "El parche salió", "el sitio midió hoy a las 20:42", "tu racha cambió" | La franja "Hoy en el meta" en portada y el sello de hora en cada página. Un `localStorage` con la última visita permite decir **"desde tu última visita: 3 héroes cambiaron de tier"**. |
| **Acción** | Buscarme | El buscador arriba en todas las páginas, con el último visto a un clic. |
| **Recompensa variable** | Mi nota de la última partida, mi racha, mi percentil de rango, qué subió | Ya existe casi todo; hay que ponerlo en el primer pantallazo del perfil y en Rangos. |
| **Inversión** | Marcar mi perfil y hasta tres jugadores más; seguir tres héroes | Favoritos en `localStorage`, sin cuenta. La portada muestra "tus héroes" con su tier de hoy y su delta: es el motivo de volver que hoy no existe. |

Lo que **no** se hace, porque es la antítesis de la línea del sitio y porque el
mismo Eyal lo señala como el límite ético del modelo: notificaciones, rachas de
visita ("volviste 5 días seguidos"), barras de progreso sin dato detrás,
números de skill inventados, scroll infinito, popups. La recompensa es el dato
que el visitante no tenía; si el dato no cambió, la página lo dice.

---

## 6. Prioridad: rinde dividido cuesta

| # | Cambio | Sección | Costo | Por qué en este orden |
|---|---|---|---|---|
| 1 | Móvil: pestañas, nav, selector de banda, cabecera de una línea | 4.2, 4.9 | Bajo (CSS y dos componentes) | Afecta todas las páginas y a todo el que llega desde Google en el teléfono. |
| 2 | Página de héroe como página propia, con cabecera de 4 cifras y sub-pestañas | 4.7 | Medio | Es la URL que Google indexa. Hoy le muestra la tier list a quien buscó un héroe. |
| 3 | Perfil en dos columnas con identidad arriba y filas por color | 4.8 | Medio | La página con más tiempo de lectura; el reordenamiento no toca datos. |
| 4 | Portada: buscador, último visto, "Hoy en el meta" | 4.1 | Medio | Necesita el 1 y datos que ya existen (`patchMovers`, `lastSearch`). |
| 5 | Héroes: columna lateral, deltas en tarjeta, vista Tabla | 4.3 | Medio-alto (la tabla es la pestaña del 08-13) | Es el zoom que falta entre tiers y detalle. |
| 6 | Rangos: "dónde estás vos" | 4.5 | Bajo | Un cálculo sobre `ranks.json` y un control. Es la página más compartible. |
| 7 | Objetos: chips, cabecera fija, cuadrantes | 4.4 | Bajo | Pulido de la mejor pantalla. |
| 8 | Escalera: fila-enlace, buscador, filtro por héroe | 4.6 | Bajo | Pulido. |
| 9 | Parches como registro de cambios dentro de Héroes | 4.3 | Bajo | Elimina una pestaña vacía. |
| 10 | Favoritos locales y "desde tu última visita" | 5 | Medio | Cierra el ciclo; conviene después del 4. |

Cada fila es un diseño y una implementación aparte; ninguna depende de un
backend, de un login ni de datos que el pipeline no publique hoy, salvo la
sparkline de 4.3, que espera a que el pipeline exponga la serie diaria.

---

## 7. Lo que hay que aceptar

- **Esto no arregla el tráfico.** Con 3 sesiones orgánicas por mes, el orden
  de la información le cambia la experiencia a once personas. El tráfico lo
  traen el set nuevo de TFT y los 140 problemas de canónica que marca Search
  Console; van en otro documento.
- **La tier list en filas se queda.** Es la convención del género y la gente
  la busca por ese nombre. La tabla es un complemento, no un reemplazo.
- **La identidad visual se queda.** Es lo único que ningún competidor tiene, y
  ninguno de los cambios de arriba la toca: son cambios de orden, de
  agrupación y de qué va antes del pliegue.

---

## 8. Referencias

Cada URL fue abierta el 2026-09-06. Donde el editor bloquea robots, el DOI se
confirmó contra Crossref y se anota. Lo que no se pudo confirmar está dicho.

### Percepción y lectura

- Nielsen, J. (2006). *F-Shaped Pattern For Reading Web Content*. NN/g.
  https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/
- Pernice, K. (2017). *F-Shaped Pattern of Reading on the Web: Misunderstood,
  But Still Relevant (Even on Mobile)*. NN/g.
  https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
  — el patrón F aparece cuando el contenido no tiene jerarquía; con
  encabezados y bloques se rompe.
- Nielsen, J. (1997). *How Users Read on the Web*. NN/g.
  https://www.nngroup.com/articles/how-users-read-on-the-web/
- Fessenden, T. (2018). *Scrolling and Attention*. NN/g.
  https://www.nngroup.com/articles/scrolling-and-attention/
  — 57 % del tiempo de lectura en el primer viewport, 74 % en los dos primeros.
- Cleveland, W. S. y McGill, R. (1984). *Graphical Perception: Theory,
  Experimentation, and Application to the Development of Graphical Methods*.
  JASA 79(387). https://doi.org/10.1080/01621459.1984.10478080 (DOI
  confirmado; el editor bloquea robots).
- Laubheimer, P. (2017). *Dashboards: Making Charts and Graphs Easier to
  Understand*. NN/g. https://www.nngroup.com/articles/dashboards-preattentive/
- Palmer, S. E. (1992). *Common region: A new principle of perceptual
  grouping*. Cognitive Psychology 24(3).
  https://doi.org/10.1016/0010-0285(92)90014-S (DOI confirmado).
- Harley, A. (2020). *The Principle of Common Region: Containers Create
  Groupings*. NN/g. https://www.nngroup.com/articles/common-region/
- Harley, A. (2020). *Proximity Principle in Visual Design*. NN/g.
  https://www.nngroup.com/articles/gestalt-proximity/

### Organización y jerarquía

- Shneiderman, B. (1996). *The Eyes Have It: A Task by Data Type Taxonomy for
  Information Visualizations*. IEEE Symposium on Visual Languages.
  https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf ·
  https://doi.org/10.1109/VL.1996.545307
- Nielsen, J. (2006). *Progressive Disclosure*. NN/g.
  https://www.nngroup.com/articles/progressive-disclosure/
- Gordon, K. (2021). *Visual Hierarchy in UX: Definition*. NN/g.
  https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- Moran, K. (2016). *How Chunking Helps Content Processing*. NN/g.
  https://www.nngroup.com/articles/chunking/
- Miller, G. A. (1956). *The magical number seven, plus or minus two*.
  Psychological Review 63(2). https://doi.org/10.1037/h0043158
- Cowan, N. (2001). *The magical number 4 in short-term memory*. Behavioral
  and Brain Sciences 24(1). https://doi.org/10.1017/S0140525X01003922
- Sweller, J. (1988). *Cognitive Load During Problem Solving: Effects on
  Learning*. Cognitive Science 12(2).
  https://doi.org/10.1207/s15516709cog1202_4 (DOI confirmado).
- Hick, W. E. (1952). *On the rate of gain of information*. Quarterly Journal
  of Experimental Psychology 4(1). https://doi.org/10.1080/17470215208416600
- Fitts, P. M. (1954). *The information capacity of the human motor system in
  controlling the amplitude of movement*. Journal of Experimental Psychology
  47(6). https://doi.org/10.1037/h0055392
- Pirolli, P. y Card, S. (1999). *Information foraging*. Psychological Review
  106(4). https://doi.org/10.1037/0033-295X.106.4.643
- Budiu, R. (2020). *Information Scent: How Users Decide Where to Go Next*.
  NN/g. https://www.nngroup.com/articles/information-scent/
- Wroblewski, L. (2009). *Mobile First*. https://www.lukew.com/ff/entry.asp?933

### Tablas, tarjetas y dashboards

- Laubheimer, P. (2022). *Data Tables: Four Major User Tasks*. NN/g.
  https://www.nngroup.com/articles/data-tables/
- Laubheimer, P. (2016). *Cards: UI-Component Definition*. NN/g.
  https://www.nngroup.com/articles/cards-component/ — una tarjeta es buena
  para una unidad; para comparar muchas, tabla.
- Scott, E. (2022). *4 Ways to Optimize the Comparison Feature for Scanning*.
  Baymard. https://baymard.com/blog/user-friendly-comparison-tools —
  cabeceras fijas, atributos agrupados, filas que se siguen con la vista.
- Crowley, M. (2022). *Product Comparison UX: Always Provide Comparison
  Features for Spec-Driven Industries*. Baymard.
  https://baymard.com/blog/provide-comparison-features
- Scott, E. (2019). *Filter List Design: Have Filters for All Displayed List
  Item Info*. Baymard. https://baymard.com/blog/have-filters-for-list-item-info
  — todo atributo que se muestra en una lista tiene que poder filtrarse.
- Baymard. *What Is an Ecommerce Filter? UI Best Practices*.
  https://baymard.com/learn/ecommerce-filter-ui
- Tufte, E. R. (1983; 2ª ed. 2001). *The Visual Display of Quantitative
  Information*.
  https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/
- Tufte, E. R. (2006). *Beautiful Evidence*, cap. "Sparklines".
  https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Few, S. (2006). *Information Dashboard Design*. O'Reilly.
  https://www.perceptualedge.com/library.php

### Retención y hábito

- Fredrickson, B. L. y Kahneman, D. (1993). *Duration neglect in retrospective
  evaluations of affective episodes*. Journal of Personality and Social
  Psychology 65(1). https://doi.org/10.1037/0022-3514.65.1.45
- Kahneman, D., Fredrickson, B. L., Schreiber, C. A. y Redelmeier, D. A.
  (1993). *When More Pain Is Preferred to Less: Adding a Better End*.
  Psychological Science 4(6).
  https://doi.org/10.1111/j.1467-9280.1993.tb00589.x
- Eyal, N. (2014). *Hooked: How to Build Habit-Forming Products*.
  https://www.nirandfar.com/hooked/
- Fogg, B. J. (2009). *A behavior model for persuasive design*. Persuasive '09.
  https://doi.org/10.1145/1541948.1541999 · https://behaviormodel.org/ —
  conducta = motivación × habilidad × disparador; bajar la fricción rinde más
  que subir la motivación.
- Budiu, R. (2024). *Memory Recognition and Recall in User Interfaces*. NN/g.
  https://www.nngroup.com/articles/recognition-and-recall/ — fundamento de
  "vistos recientemente".
- Cardello, J. (2014). *Social Proof in the User Experience*. NN/g.
  https://www.nngroup.com/articles/social-proof-ux/ — fundamento de
  "trending" y "más buscados".
- Zeigarnik, B. (1927). *Das Behalten erledigter und unerledigter Handlungen*.
  Psychologische Forschung 9. **Sin URL confirmada**: el DOI de Springer exige
  cookie y no se pudo leer el texto; se cita como fuente histórica.

### Rendimiento web

- web.dev. *Largest Contentful Paint (LCP)*. https://web.dev/articles/lcp
- web.dev. *Optimize Largest Contentful Paint*.
  https://web.dev/articles/optimize-lcp
- Google Search Central. *Understanding page experience in Google Search
  results*. https://developers.google.com/search/docs/appearance/page-experience

### Sitios de estadísticas de videojuegos

- Kou, Y. y Gui, X. (2018). *Entangled with Numbers: Quantified Self and
  Others in a Team-Based Online Game*. Proc. ACM HCI 2 (CSCW).
  https://doi.org/10.1145/3274362 — los jugadores sacan el dato de sitios
  como op.gg pero les cuesta interpretarlo; explicar cada métrica en contexto.
- Rapp, A. y Boldi, A. (2026). *The quantification of the gaming experience:
  Self-tracking practices and game metrics among casual players, esports
  players, and streamers*. Computers in Human Behavior.
  https://doi.org/10.1016/j.chb.2025.108826 (DOI confirmado).
- Su, C. (2023). *U.GG App Design*, caso de estudio con 10 entrevistas.
  https://www.suchanggg.com/u-gg-app-design — evidencia débil, anecdótica: 8
  de 10 dicen que los sitios de stats abruman con datos.

**No existe** un estudio publicado sobre el diseño de op.gg, u.gg, Dotabuff,
tactics.tools o Mobalytics en términos de retención. Los patrones de la
sección 1 son observación directa de este documento, y su respaldo son los
principios generales de arriba (reconocimiento contra recuerdo, prueba social,
Fogg y Eyal).
