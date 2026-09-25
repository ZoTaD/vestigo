# Vestigo

Tier lists, builds, enciclopedias y herramientas hechas con los datos de cada juego.

https://vestigo.gg

## Cómo está armado

```
site/                 El sitio (React + Vite), prerenderizado y publicado en Netlify.
  src/areas.ts        Cada vista (portada, Deadlock, PoE2, Valheim, legales) es un chunk aparte.
  public/<juego>/     Imágenes y fuentes de cada juego, servidas desde el dominio.
games/<juego>/
  pipeline/           Lo que baja y arma los datos del juego.
  data/               Lo que produce el pipeline; el sitio lo lee en tiempo de build.
  tools/              Scripts sueltos (extraer imágenes del juego instalado, etc.).
```

Juegos hoy: **Deadlock** (tier lists medidas, builds, perfiles), **Path of Exile 2**
(economía, enciclopedia, árbol de pasivas, regex) y **Valheim** (enciclopedia, mapa por
semilla, planificador).

Los datos **son** el sitio: cada `games/<juego>/data/*.json` se empaqueta en el build.
Por eso `netlify.toml` reconstruye cuando cambia cualquiera de esas carpetas, y la
Action `publish-deadlock.yml` publica la tier list de Deadlock cuatro veces por día
con sólo commitear sus JSON.

## Trabajar en el sitio

```bash
npm --prefix site install
npm --prefix site run dev     # http://localhost:5173
npm --prefix site test        # vitest
npm --prefix site run build   # tsc + vite + prerender de todas las páginas
```

## Rendimiento: las reglas que sostienen la velocidad

- **Cada juego es un chunk, y cada pestaña de Deadlock otro.** Una pantalla de
  un juego se importa desde su área (`DeadlockArea.tsx`, `Poe2Area.tsx`,
  `Valheim.tsx`), nunca desde `App.tsx`. El HTML de cada página anuncia el CSS y
  el JS que necesita (`areaFiles.ts`), así no hay viajes de más.
- **Tres archivos estables.** React va en `vendor`, la cáscara (barra, idioma,
  rutas) en `shell`, y la entrada es un archivo de 3 KB con los nombres de los
  chunks. Por eso **ningún módulo de la cáscara importa `areas.ts`**: lo recibe
  por `areasRegistry.ts` (lo cuida `test/areas.test.ts`). Así una publicación
  de datos de Deadlock sólo cambia los archivos de Deadlock.
- **Cada juego trae su CSS y su copia.** Las hojas de un juego se importan en su
  área, y sus textos viven en su propio módulo (`deadlockCopy.ts`, `poe2Copy.ts`,
  `valheimCopy.ts`), no en `i18n.ts`.
- **Los datos pesados se piden con `import()`** cuando la pestaña los necesita.
- **Imágenes al tamaño en que se dibujan.** Las de Deadlock tienen variantes de
  48, 96 y 160 px (`games/deadlock/tools/thumbs.py`) y `GameImg` elige la justa
  con `srcset`.
- **Caché:** `/assets/*` lleva hash y se guarda un año; las carpetas de
  `public/<juego>/` un día con `stale-while-revalidate` (ver `netlify.toml`).
- **Fuentes** en `woff2`, servidas desde el dominio.

## Sumar un juego

1. `games/<juego>/pipeline` escribe en `games/<juego>/data`; las imágenes van a
   `site/public/<juego>/`.
2. En `site/vite.config.ts` y `site/tsconfig.json`, un alias `@<juego>` a su `data`.
3. En `site/src/route.ts`, la vista y sus pestañas; en `sitemap.ts` y
   `prerender.ts`, sus páginas y sus títulos.
4. Un área `site/src/<Juego>Area.tsx` que importa sus pantallas y sus hojas, y su
   entrada en `areas.ts`, `areaFiles.ts` y el `switch` de `App.tsx`.
5. En `netlify.toml`: su `games/<juego>/data` en `ignore`, y una regla de caché
   por cada carpeta de `site/public/<juego>/`.

## Legal

Vestigo no está avalado por Valve Corporation, Grinding Gear Games, Iron Gate AB ni
Coffee Stain Publishing. Deadlock, Path of Exile 2, Valheim y todas sus propiedades
asociadas son marcas comerciales o registradas de sus respectivos dueños.
