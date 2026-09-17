# Vestigo News: la pestaña Parches como periódico

Fecha: 2026-09-17 · Estado: aprobado por ZoTaD en el brainstorming del mismo día.

## Qué es

La pestaña **Parches** de Deadlock deja de ser una lista de links al foro y pasa
a ser **Vestigo News**: una edición de periódico por parche que muestra de un
vistazo qué se nerfeó, qué se buffeó y qué cambió para todos. Está pensada para
compartir en X.

## Decisiones

| Tema | Decisión |
|---|---|
| Diseño | **Modelo A**: estética de Deadlock, papel oscuro, dorado degradado y las fuentes del juego (Reaver, Radiance y Retail Demo). El modelo B, de periódico clásico, quedó descartado. |
| Contenido | **Todos los cambios**, sin "+N más". Los cambios de cada héroe van agrupados por habilidad, con el ícono y el nombre de la habilidad. Los objetos llevan todas sus líneas. La edición puede ser larga. |
| Archivo | Cada parche tiene su edición, y `/deadlock/patches/<fecha>` la abre. `/deadlock/patches` muestra la última, con la hemeroteca debajo. |
| Publicación | **Automática y en inglés** con cada parche. **El español se carga a mano**: mientras falte, la edición en español muestra las líneas en inglés y avisa que la traducción está en camino. |
| Nerf o buff | **Reglas**, más un archivo de correcciones por parche para lo que las reglas no pueden saber ("ahora rebota con Ricochet"). |
| Titular | Sale de un banco de plantillas según el balance del parche, y se puede fijar a mano por parche. El del 16/9 es **"Thanks Yoshi"**. |
| Nota de análisis | **Se sacó el mismo 2026-09-17**, a pedido de ZoTaD, para dar todo el ancho a los cambios de los héroes (tres columnas). Estuvo publicada unas horas. |

## De dónde salen los datos

- **Las notas de parche vienen de la API de Steam News**
  (`ISteamNews/GetNewsForApp/v2`, app 1422450, `feedname =
  steam_community_announcements`). Es pública y trae el texto completo en
  BBCode.
  - El feed `/v1/patches` de deadlock-api sólo trae un recorte que apunta a
    Steam.
  - El foro frena a los agentes con una página de verificación.
  - Otra rareza del foro: el 16/9 republicó juntos los parches del 12/8, del
    22/8 y del 16/9. Steam tiene la fecha real de cada uno.
- **Las habilidades** (ícono y nombre en inglés y español) salen de
  `/v1/assets/items` de deadlock-api, filtrando `type = ability` por héroe.
- **Los objetos** salen del mismo endpoint, con `type = upgrade`, y los héroes
  salen de `catalog.json`.

## Piezas

### Pipeline (`games/deadlock/pipeline`)

- **`src/news.ts`, puro y testeable.** Hace cuatro cosas:
  - `parseNotes(bbcode)` separa las secciones (`General`, `Items`, `Heroes`) y
    sus líneas.
  - `classify(line)` devuelve `up`, `down`, `mid` o `fix`. La regla base es que
    un número más grande es mejor, salvo en atributos donde más es peor
    (cooldown, costo, penalización, reaparición).
  - `compact(line)` convierte "X reduced from A to B" en "X: A → B".
  - `buildEdition(...)` arma la edición: agrupa por héroe y habilidad, da el
    veredicto de cada héroe y objeto y cuenta los totales.
- **`src/news-run.ts` es el script de CI** (`npm run build:news`). Baja Steam
  News y los assets, lee las correcciones y escribe
  `data/news/<fecha>.json`, además del índice `data/news.json`.
  - **Sólo reescribe la edición del parche vigente**, para que tome las
    correcciones que se carguen a mano. Las ediciones viejas quedan congeladas.
- **Las correcciones van en `pipeline/news-overrides/<fecha>.json`**, a mano:
  `{ headline?, dirs: { "<línea original>": "up" | "down" | "mid" | "fix" } }`.
- **El español va en `data/news/<fecha>.es.json`**, a mano. Incluye las
  líneas, el sistema y, si se quiere, el titular. El pipeline nunca escribe un
  `.es.json`.
- **Workflow:** el paso va después de `build heroes`, con
  `continue-on-error`. Si Steam no contesta, la tier list se publica igual y la
  edición queda como estaba.
  - El índice `news.json` vive en la raíz de `data/` para que el guardián vea
    la edición nueva.

### Sitio (`games/tft/ui`)

- `deadlockNewsData.ts` carga el índice y cada edición a demanda, con
  `import.meta.glob`.
- `DeadlockNews.tsx`, `newsCopy.ts` y `styles/news.css` dibujan la edición. Los estilos van
  acotados bajo `.vn`.
- Las fuentes se cargan del bucket de deadlock-api, que responde con
  `Access-Control-Allow-Origin: *`. No se re-alojan, igual que las imágenes
  (ver `catalog.ts`).
- `route.ts`: `patches` pasa a aceptar un detalle, la fecha de la edición.
- En la página de Parches, el periódico reemplaza a la caja de "qué cambió", y
  el historial de parches queda como hemeroteca. Los que más suben y bajan
  desde el parche siguen en el rail de la tier list.

## Riesgos anotados

- **Licencia de las fuentes:** Reaver, Radiance y Retail Demo son tipografías
  comerciales que vienen del juego. ZoTaD eligió el modelo A sabiéndolo. Se
  referencian por URL y no se copian, que es la misma regla que ya siguen las
  imágenes.
- **Formato de las notas:** si Valve cambia cómo las escribe, el parseo puede
  fallar. Una línea que no reconoce va a `unparsed` y se muestra igual, sin
  clasificar.
- **Enlaces sin vista previa:** las ediciones con fecha no están en el sitemap
  todavía. Un link a `/patches/<fecha>` compartido en X muestra la vista previa
  genérica de Parches.

## Cómo se carga el español en cada parche

1. El workflow publica sola la edición en inglés en
   `games/deadlock/data/news/<fecha>.json`. El log del paso `build news` lista
   las líneas que quedaron sin clasificar y avisa que falta la traducción.
2. Si alguna línea quedó mal clasificada, se corrige en
   `games/deadlock/pipeline/news-overrides/<fecha>.json` (`dirs`, y
   opcionalmente `headline`), y se corre `npm run build:news` o se espera a la
   próxima corrida.
3. Se crea `games/deadlock/data/news/<fecha>.es.json` con este formato:
   `{ "headline"?: "…", "lines": { "<línea original de Valve>": "traducción" } }`.
   La clave es el `src` de cada línea de la edición. Las líneas que falten se
   muestran en inglés.
4. Commit y push. El sitio toma el archivo solo, porque `import.meta.glob` lo
   encuentra en el build.
