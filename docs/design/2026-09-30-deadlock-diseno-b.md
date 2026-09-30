# Deadlock, diseño B "Cartel" (prototipo para comparar)

Fecha: 2026-09-30 · Rama `feat/deadlock-cns` · Pedido de ZoTaD: "otro diseño
alternativo al que tenemos que sea mucho más Deadlock", al menos para la tier
list de héroes y la de objetos.

## Cómo verlo

En `localhost:5177`, la tier list y la pestaña Objetos tienen abajo a la
derecha el botón **Diseño: A · Diario / B · Cartel**. También se puede abrir
directo con `?diseno=b` (por ejemplo `/es/deadlock?diseno=b`). La elección dura
mientras se navega por Deadlock; no se guarda en el navegador.

## Qué cambia

**Tier list de héroes: la pared de carteles.**

- Cada letra es una tira de papel crema pegada un poco torcida (trama de tinta
  del juego, canto de arriba rasgado), con la letra estampada en VN Reaver sobre
  la placa de su color, sobresaliendo a la izquierda como la solapa de un cartel.
- Cada héroe es la foto impresa de su carta de selección (`*_card`) sobre su arte
  de fondo del juego (`backgrounds/*_bg`), en el cartón de la tarjeta de la tienda
  (`card-backer`), sujeta con cinta y torcida.
- **Caras de ánimo**: los de S festejan (`_card_gloat`, la de la racha) y los de
  D están golpeados (`_card_critical`, la de poca vida). El resto, el retrato de
  siempre.
- El nombre va sobre la pincelada negra del juego; el % de victorias en un sello
  del color de la letra; el % de uso debajo.
- El rail (En votación, Desde el parche, Más jugados, Baneados, Registro de
  parches) pasa a recortes de diario crema con tinta.

**Objetos: vista "Por letra".** Una banda por letra (S…D, con el rango de puntos)
y adentro las tres familias de la tienda en columnas, cada una del mejor al
peor, con las cabeceras "Stock up! / Big deal! / Feel good!" del juego. Existe en
los dos diseños (es una vista más del selector Tienda / Por letra / Lista); en B
es la vista por defecto y va en las mismas tiras de papel.

## Archivos

- `site/src/deadlockDesign.tsx`: contexto, estado y el botón.
- `site/src/styles/deadlock-alt.css`: todo lo de B, bajo `[data-dl-design="b"]`.
- `site/src/Deadlock.tsx`: `HeroTile` elige la cara y pasa el fondo en B.
- `site/src/DeadlockItemsTiers.tsx`: la vista por letra.

Cuando ZoTaD elija: si queda A, se borran `deadlock-alt.css`, `deadlockDesign.tsx`
y las dos ramas de `design` en `Deadlock.tsx`/`DeadlockItems.tsx`; si queda B, se
pasa lo de `deadlock-alt.css` a `deadlock-cns.css` sin el prefijo y se borra el
botón.
