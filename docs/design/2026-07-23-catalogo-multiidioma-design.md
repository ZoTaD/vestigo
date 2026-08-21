# Catálogo multiidioma: ítems, campeones y traits en español

**Fecha:** 2026-07-23
**Estado:** aprobado, pendiente de implementación

## El problema

El sitio tiene EN/ES en toda su prosa, pero el catálogo del juego quedó siempre en inglés:
un jugador con la UI en español lee "Meta" y "Unidades" traducidos y abajo
"Bloodthirster", "Challenger" y "Gain 18% max Health".

La causa no es que falten traducciones. Es que **el catálogo nunca pasó por el sistema de
i18n**. `catalog.ts` baja un solo locale (`en_us`) y `data.ts` hornea los nombres en tiempo
de importación:

```ts
export const comps: Comp[] = file.comps.map(...)   // resuelve catalog.items[id].name una vez
```

Cuando ese módulo se evalúa, el idioma activo todavía no existe. Por eso cambiar la
constante `CDRAGON` a `es_mx.json` no traduciría el sitio: lo dejaría **fijo** en español y
rompería el inglés, que es el idioma por defecto y el que leen Riot y Overwolf.

Hay un segundo defecto, independiente del idioma y ya visible en producción: **44 de los 54
ítems que la UI muestra tienen la descripción rota** con placeholders crudos, porque
`cleanDesc()` limpia `<tags>` y `{hex}` pero no `@Variable@`.

```
Warmog's Armor → "Gain @BonusPercentHP*100@% max Health."
```

## Lo verificado antes de diseñar

Medido contra el `catalog.json` del Set 17, no asumido:

| Dato | Valor |
|---|---|
| Locales que sirve CommunityDragon | 28 (incluye `es_mx`, `es_es`, `es_ar`) |
| Ítems con nombre traducido | 832 de 894 |
| Ítems con descripción traducida | 812 de 894 |
| Traits traducidos | 42 de 44 |
| Campeones traducidos | 19 de 78 |
| Ítems visibles en la UI | 54 |
| De esos, con descripción rota | 44 |
| Resueltos por el prototipo del resolver | 44 de 44 |
| Tamaño de `catalog.json` | 0,34 MB |

Los campeones traducidos son casi todos unidades neutrales u objetos de armería (Training
Dummy, yunques, Tome of Traits). De los jugables solo cambian los de nombre descriptivo:
Bard→Bardo, Master Yi→Maestro Yi, Nunu & Willump→Nunu y Willump, The Mighty Mech→El Mega
Mecha, Apex Primordian→Primordiano Supremo. Jinx, Briar e Illaoi son idénticos.

## Decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Variante de español | `es_mx` | Es el locale de Riot para LAS/LAN, la región del proyecto. Neutro, sin "vosotros". |
| Alcance | ítems + campeones + **traits** | Los traits son 42 de 44 y muy visibles. Traducir ítems y dejarlos en inglés deja la pantalla mitad y mitad: peor que el estado actual, que al menos es coherente. |
| Placeholders | resolver con `effects` | Traducir una descripción rota solo la deja rota en dos idiomas. |
| Idioma por defecto | sigue siendo **inglés** | Los primeros lectores del sitio son la revisión de terceros de Riot y el equipo de Overwolf. |

## Diseño

### 1. Pipeline — catálogo bilingüe

`catalog.ts` baja los dos locales y los fusiona por `apiName`:

```jsonc
"items": {
  "TFT_Item_Bloodthirster": {
    "img": "…", "composition": ["…", "…"],
    "name": { "en": "Bloodthirster", "es": "Sanguinaria" },
    "desc": { "en": "Gain 18% max Health.", "es": "Obtienes un 18% de Vida máxima." }
  }
}
```

Igual para `champions` y `traits`. Las entradas sin traducción quedan con el mismo string en
ambos idiomas: sale de los datos, sin lista escrita a mano que se desactualice con cada set.

El inglés manda la estructura. Si un `apiName` existe en `en_us` pero falta en `es_mx`, se
usa el inglés como valor español antes que dejar el campo vacío.

Costo: `catalog.json` pasa de 0,34 MB a ~0,5 MB. Irrelevante.

### 2. Pipeline — resolver de placeholders

Un paso nuevo en `cleanDesc()`, aplicado por idioma (la descripción cambia, los `effects` no):

- `@Var@` → `effects[Var]`
- `@Var*N@` → `effects[Var] * N`
- Redondeo a 2 decimales, porque CDragon serializa float32 con ruido (`0.15000000596…` → `15`)
- Si la variable no existe o es `null`, **se deja el placeholder crudo**: preferimos texto feo
  a un número inventado

```
"Gain @BonusPercentHP*100@% max Health."  →  "Gain 18% max Health."
"Gain @DamageAmp*100@% Damage Amp…"       →  "Gain 15% Damage Amp…"
```

### 3. UI — el catálogo entra al i18n

Los cuatro módulos que importan `catalog.json` (`data.ts`, `unitsData.ts`, `itemsData.ts`,
`analyzer.ts`) dejan de exportar constantes y pasan a exportar builders memoizados por
idioma, expuestos como hooks:

```ts
// antes
import { comps } from "./data";
// después
const comps = useComps();
```

Cada idioma se construye una vez y queda cacheado en un `Map`. La forma de los datos no
cambia, así que las vistas solo cambian la línea que los obtiene.

### Testing

El resolver de placeholders y la fusión de locales son funciones puras: van con tests
unitarios propios en `games/tft/pipeline/test/`, junto a los que ya existen. Los casos que
importan son el multiplicador, el redondeo del ruido float32, la variable ausente y el
`apiName` que falta en español.

## Fuera de alcance

- Reducir los 894 ítems del catálogo a los ~54 que la UI muestra.
- Traducir el analizador post-partida (`games/tft/analysis/src/copy.ts`), que es un sistema
  aparte con su propia prosa.
- Los otros 26 locales. La estructura los admite sin rediseño, pero hoy la UI ofrece EN/ES.

## Riesgo conocido

El cambio del punto 3 toca cuatro módulos de datos y las vistas que los consumen. Es el
único tramo invasivo. Se mitiga manteniendo idéntica la forma de los datos: si compila,
las vistas siguen funcionando, porque lo único que cambia es de dónde sale el objeto.
