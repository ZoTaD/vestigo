# Noche del 29 al 30/9 — lista de trabajo (plazo: 9 am del 30)

Pedido de ZoTaD al irse. Rama `feat/deadlock-cns`, `localhost:5177`. Nada se
publica en `main` ni se tocan workflows. Cada tarea: probar en el navegador
(1440 y 375), commitear, tachar acá.

## A. Arreglos de lo que vio
- [x] A1. Tarjetas de la tienda enormes en la vista de una categoría y en el
      Armador: achicarlas.
- [x] A2. Rangos, "Por día": de la más nueva a la más vieja.
- [x] A3. La ficha del objeto a veces aparece en cualquier lado con un
      rectángulo rojo alrededor: diagnosticar (sospecha: un ancestro con
      transform/filter/container-type vuelve "fixed" relativo) y arreglar.
- [x] A4. Populares sin separar por fase: todos juntos como en el juego.

## B. Página de build rehecha con la tienda del juego
- [x] B1. Reemplazar "Orden de compra" por el papel de la tienda (el de
      Populares, estirado o con más assets), con adentro: orden de compra,
      senda de habilidades e inversión de almas.
- [x] B2. En lugar de las fases, los botones de build (las populares y la
      nuestra en beta).
- [x] B3. Una forma fachera de mostrar cómo subir habilidades.

  Hecho en `DeadlockBuildShop.tsx`: pestañas Populares / builds medidas /
  nuestra (beta); el cartel del juego o la franja cian con el nombre; las tres
  barras de inversión; el papel de la tienda con cada compra en su escalón y
  familia, con su número, los componentes apagados y la cinta "Clave"; la tira
  del orden de compra por tramo; la pizarra con la prioridad 1.º–4.º y la
  tablatura de tiza (◆ desbloqueo, I–III mejoras, la III en círculo). En
  Populares la pizarra aclara de qué build sale. De paso: "VN Retail" (la demo
  del bucket) no trae tildes y en español rompía "Duración" → Barlow Condensed
  en español.

## C. Diseño alternativo "mucho más Deadlock"
- [x] C1. Tier list de héroes y de objetos en una segunda dirección visual,
      comparable con la actual (conmutador en la página o ruta aparte).
      Hecho: `docs/design/2026-09-30-deadlock-diseno-b.md` (botón A/B y
      `?diseno=b`), más la vista "Por letra" de Objetos en los dos diseños.
- [x] C2. Propuestas para otras pestañas con mejores visuales.

## D. Jugador
- [x] D1. Redistribuir la pestaña Jugador (hoy desperdicia espacio).
      Hecho: tres pisos (ficha a lo ancho; partidas + contra tu banda, forma y
      actividad; héroes y gente en columnas de diario).

## E. Revisión de método
- [x] E1. Revisar cómo se toman y cruzan los objetos en las tier lists y las
      builds; anotar problemas y arreglar lo seguro.
      Hecho (9f2b357): corruptas enteras fuera, anchorPatch (hotfix a < 4 días
      no reinicia la ventana), enfrentamientos de partida entera, counters 7.º+,
      BADGE > 0, coeficiente de almas, y la tier list de objetos contra el
      winrate del héroe. Quedan para decidir: la §1b (la build pierde el objeto
      corrompido) y el §5 completo (coeficientes estandarizados en el informe).

## F. Pestaña nueva para la comunidad
- [x] F1. Investigar foros (preguntas sin respuesta, cosas que ninguna página
      hace) y proponer/prototipar una pestaña.
      Hecho: pestaña **Remontadas** (2205940, 78b9a6c). La investigación
      (Reddit bloqueado; Steam, foro oficial, prensa) marcó como hueco total
      "si perdés la línea, ¿perdiste?". Segunda idea, sin hacer: "Ranked,
      medido" quedó como recuadro en Rangos ("Cuántos puntos da cada partida":
      +300, racha +370/+390/+410/+430, −300, escudo ≈ −41; build:rank-points).

## G. Estilo Cartel en todo Deadlock (pedido de ZoTaD a la 1 h)
- [x] G1. B fijo, sin botón (d5b65ef).
- [x] G2. Toda caja en papel crema con tokens de tinta; pizarra de rangos
      sigue pizarra; Héroes lado a lado, ficha de héroe, build, armador,
      jugador (27a1380, a63a99b, dc07a22).

## Informe de la mañana
- [ ] Resumen con capturas para ZoTaD.
