# Armador de builds (Deadlock) — 2026-09-22

Pestaña `/deadlock/builder`. Pedido de ZoTaD en una sola sesión, en este orden.

## 1. La tienda del juego (publicado, `2df6c32`)

- Papel entero del juego por categoría (`catalog_shop_bg_*`, con los recuadros
  impresos a la medida de cada una) y las tarjetas ubicadas en % dentro de cada
  recuadro. Coordenadas medidas con grilla al 5 % y verificadas contra capturas
  del juego. Texturas bajadas del bucket de deadlock-api y achicadas a
  `public/deadlock/shop/`.
- Tarjeta del juego: dibujo a todo el ancho, cintas ACTIVO/IMBUIR
  (`is_active_item` / `imbue` de la API), estrella azul (build más jugada),
  ADQUIRIDO, cinta MEJORA con brillo.
- La tienda a la izquierda y la build con sus números a la derecha, pegada; la
  tienda nunca más alta que la ventana.

## 2. Dos modos

"Build final" (el clic llena las 12 casillas, de ahí salen las stats) y "Guía de
compra" (el clic llena la categoría elegida). Elegido por ZoTaD entre tres
opciones.

## 3. Editor de la guía (el editor de builds del juego)

Categorías con nombre y nota, objetos en orden de compra, arrastrar para
reordenar o pasar de categoría (también desde la tienda), esquina para cambiar
el ancho de a una columna de tarjeta, subir/bajar/borrar. "Empezar de la build
medida" arma Inicio / Medio / Final con el orden de compra real.

## 4. Orden de los puntos de habilidad

La grilla del juego: clic en una habilidad le da su próximo punto; rombo =
desbloqueo, 1 / 2 / 5 = costo de cada mejora (lo muestra la grilla del juego,
captura de ZoTaD). Debajo, "Qué mejorar primero". "Cargar el orden medido".

## 5. Estadísticas del héroe

Base del juego (`hero-kit.json`) + lo que cada objeto da **siempre**: sólo las
propiedades de la sección `innate` de su tarjeta, con `provided_property_type`
y sin `ConditionallyApplied` (`modsDe` en `catalog.ts`). La API no marca como
condicional lo que viene con el activo (Colossus +30% cuerpo a cuerpo) ni con un
pasivo (Spiritual Overflow +25% cadencia); por eso manda la sección.

Reglas de combinación (a validar contra el panel del juego **antes de
publicar**): porcentajes del mismo tipo se suman; resistencias 1 − Π(1 − r);
inversión de arma = daño de arma %, de espíritu = poder espiritual plano, de
vitalidad = vida % sobre la vida con objetos; sin boons.

## En el link

`b=` build, `g=` guía, `a=` orden de habilidades. Sin cuentas.

## Pendiente de decisión

- Publicar builds con login de Steam y estrellas (ver la respuesta a ZoTaD en la
  sesión del 2026-09-22).
- Cargar una build en el juego: el juego no importa builds; su buscador acepta
  el ID de una build pública, que sólo existe si alguien la publicó desde el
  juego.
