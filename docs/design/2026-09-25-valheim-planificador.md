# Planificador de Valheim (2026-09-25)

Pedido de ZoTaD: una pestaña "como un carrito de compras pero que no se llame
así". Eliges varias cosas que quieres fabricar (por ejemplo, toda la armadura
de hierro y Krom), una por una, con cantidad; al terminar, una página te dice
cuánto necesitas de cada material y de dónde sale: bioma, qué criatura lo
suelta, qué veta se mina, si se cultiva.

Decisiones de ZoTaD:

- Nombre: **Planificador**.
- Niveles: se elige el nivel por objeto (1 a 4) y se suma la fabricación
  más las mejoras hasta ese nivel.
- Desglose: las dos vistas con un interruptor, **"Lo que va a la mesa"** y
  **"Hasta lo crudo"**.
- Entra todo lo que se fabrica: armas, armaduras, herramientas, comidas,
  hidromieles, construcción y estaciones, materiales procesados, y las
  ofrendas de los altares de jefes.
- Diseño: la maqueta **B, "Hoja de ruta"**, del lienzo
  https://claude.ai/artifact/L4XbqFiH1Ea9tHL9C2mKPJ.
- Se prueba en localhost y se publica cuando ZoTaD lo apruebe.

## Pantallas

**`/valheim/planner`, paso 1, "Elegir".** A la izquierda, una caja con un
buscador, fichas por categoría (Todo, Armas, Armaduras, Herramientas, Comidas,
Hidromieles, Construcción, Materiales, Jefes) y fichas de bioma. Debajo va una
tabla con el ícono, el nombre, el tipo, dónde se hace y el bioma, y un botón
"+ Agregar" por fila. Si el objeto ya está en la lista, el botón dice
"✓ En la lista · N" con tinte dorado. A la derecha, la columna **Tu lista**:
- cada renglón tiene el ícono, el nombre y un selector de nivel si el objeto
  se mejora;
- la cantidad se cambia con − y +, y lleva una nota cuando la receta sale de a
  varios ("De a 4 por tanda: salen 12");
- abajo, dos cifras (materiales crudos y biomas por recorrer), el botón
  **"Siguiente: materiales →"** y el enlace "Vaciar".

En el celular, la columna pasa a ser una barra fija abajo
("Tu lista · 5 · Siguiente →") que abre la lista.

**`/valheim/planner/route`, paso 2, "Hoja de ruta".** Arriba, "← Volver a la
lista" y tres cifras: el peso total (con los viajes de 300 de carga), los
minutos de horno de fundición y cuántos biomas hay que recorrer.
- A la izquierda, **Desglose**, con el interruptor mesa/crudo:
  - en "mesa", cada material que va a la mesa con su cantidad y para qué
    objetos es;
  - en "crudo", además el árbol hasta lo que se junta a mano, con la
    estación de cada paso ("horno de fundición", "forja, de a 5").
- A la derecha, **Para juntar**: los materiales crudos ordenados de mayor a
  menor cantidad. Cada uno lleva una casilla "ya lo tengo", el bioma en
  versalitas y de dónde sale ("Draugr 1 · Draugr élite 2–3",
  "Vetas de cobre, con pico").
- Debajo, **Estaciones que necesitas**, con su nivel (la forja nivel 3 para
  mejorar la armadura de escamas a nivel 2) y los caminos elegidos ("El
  hierro sale de chatarra. Usar mineral de hierro").
- Sin bordes ni barras de color en las tarjetas: se usa tinte, texto o cifra.

**En la enciclopedia**, cada ficha que se fabrica o se construye suma un
botón **"Agregar al Planificador"**, y cada jefe uno para sus ofrendas.

## Datos

**Extractor (`pipeline/extract.py`).** Del componente `Smelter` se lee además
`m_fuelItem` y `m_fuelPerProduct`: la fundición, el alto horno y la
refinería de eitr llevan combustible; el horno de carbón no. Se guarda en
`data/conversions.json` como `fuel: {item, perProduct}`.

**`pipeline/site.py` escribe `data/site/planner.json`**, un archivo aparte que
sólo carga esta pestaña:

- `items`: todo lo que aparece en una receta, una conversión o una fuente, con
  el nombre `{en, es}`, el ícono, el peso, el slug y la pestaña de su ficha,
  la categoría para el filtro y el bioma de progresión (`tier`).
- `recipes`: por objeto, estación, nivel mínimo, lo que sale por tanda, los
  requisitos con `amount` y `perLevel`, si es de "uno cualquiera" y el nivel
  máximo.
- `pieces`: las piezas de construcción con sus requisitos y la herramienta.
- `convert`: por producto, las conversiones (estación, entrada, tiempo,
  rendimiento, combustible).
- `sources`: por material crudo, las fuentes resumidas (bioma, cómo, de quién,
  probabilidad y cantidad) con el nombre ya resuelto.
- `summons`: por jefe, lo que pide su altar.
- `prefer`: el camino por defecto de cada material que tiene varios.

**Los ídolos (`Upgrader*`) quedan fuera del cálculo.** Según la wiki se
encuentran en cofres y se llevan a una forja oculta para intentar una mejora
extra; no hacen falta para fabricar nada.

**Camino por defecto.** Lo fabricado o procesado va antes que lo encontrado en
cofres o vasijas. Hay dos excepciones a mano en `pipeline/fixes.py`: el hierro
sale de chatarra (el mineral de hierro sólo sale de meteoritos y del hierro
de pantano) y el carbón sale de madera en el horno de carbón. Cualquier
material con varios caminos se puede cambiar en la hoja de ruta, y la
elección viaja en la URL.

## Cálculo (`games/tft/ui/src/valheimPlanner.ts`, sin React)

- **Nivel:** el costo hasta el nivel `q` es `amount + perLevel × (q − 1)`
  por requisito. La estación pedida es el nivel mínimo de la receta más
  `q − 1`.
- **Tandas:** `ceil(cantidad pedida / lo que sale por receta)`. Lo que sobra
  se muestra ("pediste 10, salen 12").
- **Mesa:** la suma de los requisitos de todo lo elegido.
- **Crudo:** cada material se expande por su camino elegido (receta o
  conversión, con su combustible) hasta llegar a algo sin receta ni
  conversión, o a una fuente directa elegida a mano. Un material que ya
  apareció en la cadena corta el ciclo y se trata como crudo.
- **"Uno cualquiera":** se usa el primer ingrediente de la lista, con un
  selector para cambiarlo.
- **Totales:** el peso (`Σ cantidad × peso` de lo crudo), los viajes
  (`ceil(peso / 300)`), el tiempo por estación (`Σ tandas × tiempo`) y los
  biomas (la unión de los biomas de las fuentes elegidas).
- **"Ya lo tengo":** es sólo visual; se guarda en el navegador y no cambia
  el cálculo.

## Estado y URL

- La lista va en la query: `?l=HelmetIron.2,THSwordKrom.1,Sausages*10`
  (id, `.nivel` opcional, `*cantidad` opcional).
- Los caminos elegidos van en `&via=Iron:IronOre`.
- También se guarda en `localStorage` (con try/catch): al entrar sin `?l=` se
  recupera la última lista.
- La casilla "ya lo tengo" se guarda en `localStorage`, por lista.

## Rutas y SEO

- `route.ts` suma la sección `planner` de Valheim, con el detalle opcional
  `route`.
- La sub-navegación suma "Planificador" entre "Mapa" y "La Crónica".
- `/es/valheim/planner` y `/en/valheim/planner` van al sitemap y al prerender
  con título y descripción propios. La hoja de ruta no se indexa
  (`noindex`), porque depende de cada lista.
- Los textos en español van en tú, como el resto del sitio.

## Pruebas

- **Vitest (`test/valheimPlanner.test.ts`):**
  - el ejemplo de la maqueta tiene que dar en la mesa 105 de hierro, 20 de
    bronce, 6 de piel de ciervo, 5 de piel escamosa, 12 de vísceras, 3 de
    carne y 3 de cardo;
  - en crudo, 105 de chatarra, 40 de mineral de cobre, 20 de mineral de
    estaño y 330 de madera, con 330 de carbón intermedio;
  - la forja tiene que pedir nivel 3;
  - además: las tandas, cambiar de camino, "uno cualquiera", un ciclo y
    leer y escribir la URL.
- **Pytest (`pipeline/tests`):** el combustible en las conversiones y la
  forma de `planner.json`, con el hierro por chatarra y los ídolos afuera.
- Verificación en el navegador del localhost antes de pedirle el visto bueno
  a ZoTaD.
