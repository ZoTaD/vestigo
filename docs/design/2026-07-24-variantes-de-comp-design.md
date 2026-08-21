# Variantes de comp

**Fecha:** 2026-07-24
**Estado:** aprobado, pendiente de implementación

## El problema

La tier list muestra comps que en esencia son el mismo set con uno o dos
campeones distintos. Medido sobre las 50 comps publicadas de global, hay **32
pares con ≥50% de core compartido**. El caso más claro:

> **FlexTrait/Fiora+Illaoi [S]** vs **FlexTrait/Fiora+Jinx [S]** → 100% del core
> igual, las dos en S. Mismo set, cambia un carry.

Nuestra fusión (Jaccard ≥70% + identidad por carry+arquetipo+≥3 traits) no las
junta porque difieren en carry o arquetipo, y ahí paramos a propósito.

## Lo que NO es este cambio

**No toca el análisis.** Seguimos midiendo comp por comp igual que ahora. Esto
es presentación: agrupar visualmente comps que ya publicamos por separado.

**No fusiona en los datos.** Aflojar la fusión iría contra la decisión de abajo:
mezclaría una variante buena con una mala y borraría el dato por variante.

## Verificación de la premisa

Se confirmó contra los datos que **hoy NO conservamos las variantes de forma
usable**: cada comp guarda un `signatures[]` con las grafías fusionadas, pero eso
es ruido ("qué unidad llevó los ítems esa partida": DRX/Vex+Graves tiene 31
grafías como `ResistTank|Blitzcrank`). No sirve para mostrar variantes.

Pero **las variantes ya son comps publicadas por separado**, cada una con su
tier, placement y win rate. Así que agruparlas no parte la muestra más fina: solo
junta y deja alternar. Por eso el trabajo vive en la UI, no en el pipeline.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Qué es una variante | **Estricta**: mismo core Y tier parecido |
| Cuál va de principal | La de **mejor posición promedio** (consistente con la tabla) |
| Win rate | Visible en el desplegable, no es el criterio de orden |
| Cambio de tier | **Se avisa**: si la variante es de otro tier que la principal, se marca |
| Dónde vive la lógica | **UI**, función pura sobre `comps.json` |

## Diseño

### 1. Agrupamiento (`ui/src/families.ts`, puro y con tests)

`groupFamilies(comps: Comp[]): CompFamily[]`, donde
`CompFamily = { lead: Comp; variants: Comp[] }`.

- **Core de una comp** = unidades con `frequency >= 0.5` (misma definición que
  `selectRoster`).
- **Misma familia** = core Jaccard **≥ 0.85** **y** distancia de tier **≤ 1**
  (S↔A sí, S↔D no). Umbrales calibrados contra los 32 pares reales.
- **Agrupamiento**: greedy sobre las comps ordenadas por placement. Cada comp se
  une a una familia existente solo si matchea contra su **líder** (no
  encadenado), o abre una familia nueva. El líder es la primera (mejor placement).
- Verificado contra datos: junta las dos Fiora (100%, ambas S); NO junta
  Akali-S con Kindred-D (63%, 3 tiers).

### 2. Tier list por familias (`data.ts`)

`buildTiers` agrupa en familias y ubica cada familia en el tier de su **líder**.
Las hermanas salen de sus propios grupos de tier: solo aparecen vía el desplegable
de su familia. Resultado: menos filas, cada una un set de verdad.

### 3. UI (`MetaView.tsx`)

- La fila principal se ve igual que hoy, con una **flecha "Variantes (N)"** si la
  familia tiene hermanas.
- Al tocarla, la fila se **reemplaza in-situ** por la variante elegida (su roster,
  ítems, stats), y aparece **"Volver a la original"**.
- Si la variante mostrada es de otro tier que la principal, se marca claro:
  **"En esta variante: Tier B"** (la principal era S). Es el aviso que pediste.
- La selección de variante es estado local, no va en la URL (v1).

### 4. Deep links (no romper lo existente)

Las URLs `/tft/meta/<comp-slug>` del sitemap deben seguir funcionando aunque el
slug sea el de una variante (una hermana, no el líder). Al abrir por slug: se
busca la familia que contiene esa comp, se muestra esa variante seleccionada y
expandida. Sin esto, cada link compartido a una variante se rompería.

### 5. Copia (`i18n.ts`, EN/ES)

`Variantes (N)` / `Variants (N)`, `Volver a la original` / `Back to the main
build`, `En esta variante: Tier {x}` / `This variant: Tier {x}`.

## Fuera de alcance

- URLs propias por variante (compartir una variante puntual). La selección es
  estado local en v1.
- Agrupar variantes que no entraron al top 50 publicado: si no está en la lista,
  no la tenemos para mostrar. Limitación aceptada.
- Cualquier cambio al pipeline o a cómo se miden las comps.

## Riesgo

El umbral de core (85%) y la distancia de tier (1) definen cuánto agrupa. Muy
laxo esconde distinciones reales (bueno vs malo); muy estricto no agrupa nada y la
feature no se nota. Se calibran contra los 32 pares medidos y se cubren con un test
que verifica que ninguna familia mezcle comps que no deba.
