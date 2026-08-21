# El recomendador de builds de Deadlock

**2026-08-03.** La cuarta tarjeta: además de las 2-3 builds **medidas** —que
describen lo que la gente hace— una **recomendada por nosotros**. Es el salto de
describir a recomendar, y la afirmación más fuerte que el sitio hace hasta hoy.

Leer junto con `2026-08-02-arquetipos-de-build-deadlock-design.md`, que describe
de dónde salen las builds medidas. **Este módulo no toca ese motor**: lo consume.

## Lo que NO se puede hacer, y por qué

**Publicar los doce objetos de mayor aporte.** Cada aporte se mide por separado
—esa compra contra quien gastó lo mismo en otra cosa— así que sumarlos asume que
los objetos no interactúan. Interactúan.

Sumando se puede publicar un conjunto que **nadie combinó nunca**, sin una sola
partida que respalde que junto funciona. Es el error del k-means otra vez: el
promedio de dos builds buenas es una build que no juega nadie.

## El método: búsqueda local adentro de lo observado

1. **Partir de la build más jugada** del héroe. Ya está medida, es jugable,
   respeta el presupuesto de almas y el tope de doce.
2. **No tocar los objetos marcados KEY.** Son los que el pareo dice que están
   cargando la build; sacarlos es sacar lo que la hace funcionar.
   **El criterio sale de la medición y no de un tope inventado** — decisión de
   ZoTaD, y es mejor que el máximo numérico que yo había propuesto: no hay un
   número de cambios permitido, hay objetos protegidos y objetos candidatos.
3. **Los candidatos son los que no pagan**: prevalencia alta y aporte bajo o
   negativo. Ésos son además **lo más valioso que le podemos decir a alguien** —
   "esto lo compra todo el mundo y no rinde".
4. **Reemplazar sólo por objetos del mismo escalón de precio y el mismo estante**,
   así el presupuesto y la forma de la build se mantienen sin modelarlos.
5. **Aceptar un cambio sólo con las dos evidencias**: que el aporte del entrante
   le gane al del saliente **por más de lo que explica el ruido**, y que la
   combinación resultante **exista en partidas reales** de ese héroe.
6. **Repetir hasta que ningún cambio mejore.**

## Por qué se actualiza solo

**No hace falta ningún mecanismo especial, y ésa es la parte elegante.**

La ventana de builds arranca en el parche vigente. Si nerfean un objeto, su
aporte medido cae dentro de esa ventana —no hay memoria del parche anterior— y el
cambio que lo saca se propone y se acepta **en la siguiente corrida**, dos veces
por día.

El caso que lo motivó (ZoTaD): Bebop dejó de usar Echo Shard tras el nerf. La
ventana anclada al parche lo detecta sola. Lo mismo si Bebop empieza a ganar más
con daño de arma: los aportes de los objetos de arma en Bebop suben y la
recomendación migra sin que nadie la toque.

**La opinión de la comunidad NO entra como insumo.** No es medible ni auditable,
y nuestros datos la detectan igual o antes, con la ventaja de que podemos mostrar
el número.

## Lo mecánico ya está adentro, aunque no lo parezca

ZoTaD señaló que a Bebop se le arma Spirit Strike porque su primera habilidad
pega como un puñetazo y escala con espíritu. **Eso ya está en el cálculo**: el
aporte se mide por `(héroe, objeto)`, no por objeto en abstracto. Si rinde en
Bebop por esa mecánica, la medición lo captura sin que nosotros sepamos por qué.

Modelar el escalado de cada habilidad sería para **explicar**, no para decidir. Y
para explicar ya hay algo mejor y construido: la regresión de mecanismo dice si el
aporte viene de **muertes evitadas, economía o daño**. Medido, no afirmado.

## El límite, escrito antes de construirlo

**Sólo encuentra la mejor build entre cosas que la gente ya hace.** Si nadie
compró un objeto en ese héroe no hay aporte confiable, y el algoritmo no lo va a
proponer nunca. **No descubre builds nuevas: encuentra la mejor de las
conocidas.**

Es exactamente el alcance que pidió ZoTaD — combinación de lo que la gente
arma, lo que al héroe le sirve, y nuestra medición.

Y **no es infalible.** Lo que sí promete: nunca peor que la build más jugada
según nuestra propia medición, siempre respaldado por partidas reales, y que se
mueva cuando los datos se muevan.

## El backtest, que se PUBLICA en vez de ser una compuerta

1. Calcular la recomendación con la primera parte de la ventana (W1).
2. Medir cómo le fue de verdad en la segunda (W2).
3. Compararla contra la build más jugada en W2.

**Decisión de ZoTaD: se publica igual, marcada Beta**, en vez de esperar a que
el backtest dé bien. Con lo cual ese número deja de ser una compuerta y pasa a ser
**algo que se muestra**: si la recomendada no le gana a la más jugada fuera de
muestra, la etiqueta Beta más el número son divulgación honesta en vez de una
falla silenciosa.

Es el mismo criterio con el que entró el mecanismo (0,506 solo contra 0,683 la
medición directa, 0,703 mezclados).

Ojo con la ventana: el corpus ranked arranca el 2026-07-29 y el parche es del 28,
así que **todo cae dentro de un mismo parche** — bueno para el backtest, porque no
hay confusión de parches. Se parte por tiempo, no al azar.

## La pantalla

- **Pestaña aparte, a la derecha de las builds medidas**, con **Beta** al lado.
- Una línea breve: en base a nuestras métricas se recomiendan unos cambios
  chicos sobre la build más jugada.
- **La cuenta a la vista**: de qué build se partió, qué se cambió, el aporte de
  cada cambio y las partidas que lo respaldan.
- **Si no encuentra nada mejor, lo dice.** Ese resultado tiene que ser posible o
  el algoritmo va a inventar mejoras para justificarse.
- Visualmente distinta de las medidas: si se ve igual, el lector no distingue
  "esto lo hace la gente" de "esto opinamos nosotros", y el que pierde
  credibilidad es el resto de la tarjeta.

## El winrate de referencia

Pedido de ZoTaD: que cada tarjeta de build muestre un winrate promedio.

**La lectura que le encuentro sentido es el promedio del HÉROE como referencia.**
Hoy cada build dice su propio winrate ("2.395 partidas, 56,0%") y falta el punto
de comparación: 56,0% no se sabe si es bueno hasta saber que el héroe promedia
54,3%. Con la referencia, cada build se lee como **+1,7 sobre su propio héroe**.

Un promedio *entre* las builds sería un número sin pregunta detrás: nadie juega
el promedio de tres builds.

## Módulo aparte

`src/recommend.ts`, consumiendo lo que ya existe —aportes pareados, arquetipos,
co-ocurrencia de objetos, ventana del parche— sin tocar el motor actual. Si hay
que apagarlo, se apaga sólo esa pestaña.
