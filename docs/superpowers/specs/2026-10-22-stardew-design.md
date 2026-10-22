# Stardew Valley en Vestigo — diseño

2026-10-22. Juego 1.6.15 instalado en la PC de ZoTaD. Rama `feat/stardew`,
worktree `Desktop/vestigo-stardew`.

## Para qué

Pedido de ZoTaD: una wiki **explorable, intuitiva y gráfica**, más
**herramientas que los otros no tienen o que hacemos mejor**, en inglés y
español por igual. La idea es competir, no traducir.

La competencia (relevada el 22/10):

- **stardewvalleywiki.com** domina con ~32 M de visitas por mes. Es MediaWiki:
  texto denso, tablas fijas, sin filtros ni cruces. Licencia CC BY-NC-SA, así
  que **no se copia texto**. Los datos salen del juego.
- **stardew.app**: lee la partida y lleva la cuenta de la perfección. Es el
  rival directo del lector de partidas.
- **Stardew Checkup / Predictor** (MouseyPounds): funcionan, pero son técnicos y
  viejos de interfaz.
- Planificadores de granja y calculadoras de cultivos: varios y dispersos, ninguno
  con todo junto.

## Qué hay en los datos (medido)

`games/stardew/tools/dump.sh` le pide al propio juego que lea sus XNB y deja
313 JSON en `games/stardew/raw/` (ignorada por git): 807 objetos, 50 cultivos,
8 frutales, 48 aldeanos, gustos de regalos, 31 paquetes, 150 recetas de
fabricación más las de cocina, 74 peces, 91 lugares (con lo que se pesca y se
encuentra en cada uno), 77 tiendas, 39 máquinas con sus reglas de producción,
67 armas, 51 monstruos con su botín y 25 edificios. Los textos vienen en inglés
y en español oficial (`Strings/*.es-ES`). `textures.py` pasa el arte a PNG.

## Pestañas, por etapas

Cada etapa se publica sola. Las fichas se cruzan entre sí: un objeto dice a quién
le gusta, en qué paquete va, qué máquina lo procesa, dónde se consigue y con qué
receta se usa.

**Etapa 1: la base**
1. **Portada**: buscador, el día de hoy en el valle (cumpleaños, festival,
   temporada) y la entrada a cada pestaña.
2. **Objetos**: grilla filtrable por categoría, temporada y fuente, y una ficha
   por objeto con precio por calidad (y con las profesiones), de dónde sale y
   para qué sirve.
3. **Aldeanos**: retratos, cumpleaños y una tabla de regalos que se lee al
   revés también (qué hago con este objeto: a quién le encanta).
4. **Centro Comunitario**: los paquetes con checklist guardado en el navegador,
   lo que falta y dónde conseguirlo esta temporada.

**Etapa 2: el día a día**
5. **Cultivos + calculadora de ganancias**: oro por día de cada cultivo según
   la temporada, el día en que se planta, el fertilizante, la profesión y si se
   vende o se procesa (barril, jarra, deshidratador). Es lo que hoy está
   repartido en varias herramientas viejas.
6. **Pesca**: los 74 peces con un filtro de "qué puedo pescar ahora" (lugar,
   temporada, clima y hora), más estanques y cangrejeras.
7. **Recetas y máquinas**: fabricación, cocina y las cadenas de artesanía
   (qué entra y qué sale de cada máquina).
8. **Calendario**: cumpleaños, festivales, peces y cosechas en una sola vista.

**Etapa 3: las herramientas que nos diferencian**
9. **Lector de partida**: subir el archivo de la partida y ver, 100 % en el
   navegador (no se sube a ningún servidor), qué falta para la perfección, los
   paquetes, los regalos de la semana por aldeano y "qué conviene hacer hoy".
   Compite con stardew.app; la diferencia es que se cruza con todas las fichas.
10. **Minas y combate**: armas, monstruos y su botín, pisos.

**Después (proyectos aparte):** planificador de granja en grilla (aspersores,
espantapájaros, compartible por URL) y predictor (geodas, clima, pisos
infestados), que obliga a replicar el generador aleatorio de la 1.6.

## Reglas que se aplican (de `CLAUDE.md` y la memoria)

- Rendimiento por página (`npm run perf`), `LazyRows` en listas largas,
  imágenes `lazy` con tamaño fijo, datos fuera del chunk de entrada y las fichas
  partidas en pedazos (`pzShardOf`).
- `games/stardew/data` en los `paths` de `deploy.yml` y en el `ignore` de
  `netlify.toml`.
- Medir RAM y tiempo del build antes y después.
- SEO: sitemap propio con lastmod, títulos con lo que se busca.
- Sin "sacado de los archivos del juego" en la interfaz; sí créditos y aviso de
  no afiliación.

## Lo que decide ZoTaD

- **La estética** (hay maquetas para elegir).
- **Sprites del juego con publicidad.** ConcernedApe no tiene una política
  escrita para sitios de fans con anuncios; la guía del foro para merch pide no
  usar sus assets. Los demás juegos del sitio usan su arte. Mientras el sitio
  no tenga anuncios, el riesgo es bajo; antes de ponerlos, conviene
  preguntarle por correo.

## Decisiones mías (ZoTaD puede cambiarlas)

- Arrancar por la etapa 1 y dejar el lector de partida para la 3: necesita las
  fichas para valer más que stardew.app.
- La calculadora de cultivos usa las reglas de precio del juego (calidad,
  profesiones Labrador/Artesano, multiplicadores de máquinas) leídas de los
  datos, no de la wiki.
