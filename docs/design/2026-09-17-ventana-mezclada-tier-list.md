# La tier list de héroes en los días de un parche: mezcla con peso que se desvanece

Fecha: 2026-09-17 · Pedido de ZoTaD el mismo día, unas horas después de la regla
del corte con piso.

## El problema

Con la regla de la mañana (`measureWindow`), la tier list tenía dos regímenes:
los últimos 15 días con todas las partidas al mismo peso, y en cuanto el parche
nuevo juntaba 8.000 partidas en la banda, corte seco a "sólo desde el parche".
Entre medio un héroe nerfeado bajaba lento, porque cada partida vieja pesaba lo
mismo que una nueva; y el día del corte la lista pegaba un salto.

## La regla

Para cada héroe se juntan dos cuentas: victorias y partidas **desde el parche**
(n₁) y las de los **15 días anteriores al parche** (n₀). Las viejas entran con
un peso α que baja a medida que el parche junta muestra en la banda:

- α = 1 − (partidas del parche en la banda / 8.000), sin bajar de 0
  (`prePatchWeight`, en `patches.ts`).
- winrate = (victorias₁ + α·victorias₀) / (n₁ + α·n₀), y después el
  encogimiento hacia 50% de siempre (`blendRows`, en `build.ts`).
- El uso se mezcla con la misma α. El "antes → después" y los que más suben y
  bajan no cambian: ya comparaban las dos ventanas por separado.

Cómo se comporta:

| Momento | α | Qué se ve |
|---|---|---|
| Día del parche | ≈1 | La lista se ve igual que antes, llena. |
| A las horas | <1 | Cada partida nueva vale 1 y cada vieja menos: un nerf pesa desde la primera hora. |
| 4.000 partidas | 0,5 | Una partida nueva vale el doble que una vieja. |
| 8.000 partidas | 0 | Exactamente "medido desde el parche". Sin salto en ningún momento. |

## Lo que se publica

- `crossesPatch: true` mientras α > 0 y hay partidas de antes.
- `patchShare`: qué parte de la muestra medida es del parche nuevo. La línea de
  medición del sitio lo dice: *"las partidas de 09-16-2026 Update ya pesan el
  63% de la lista"*.
- `provisional` se decide por las partidas **desde el parche**, no por el total
  mezclado, que está lleno desde el primer día.
- `matches` por héroe y por banda son la muestra pesada, redondeada.

## Alcance

Sólo la tier list de héroes. La de objetos sigue con el corte de
`measureWindow`: cada objeto se mide contra su precio, y una mezcla de dos
parches confundiría esa comparación. Las builds también siguen como estaban.

## Lo que se dejó abierto

La bajada de α es lineal porque es la más fácil de explicar. Si con el próximo
parche se ve que el parche nuevo tarda en mandar, se puede hacer que caiga más
fuerte al principio (raíz cuadrada: a 2.000 partidas ya pesaría el 50%).
