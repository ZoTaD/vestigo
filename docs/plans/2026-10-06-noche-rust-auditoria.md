# Noche del 2026-10-06: Rust y auditoría de datos

Pedido de ZoTaD antes de irse a dormir:
- **Rust:** aplicar las optimizaciones de `CLAUDE.md` y hacer las pestañas que
  se puedan con los datos ya extraídos, contrastando con wikis.
- **Valheim, D2R y Zomboid:** revisar datos y descripciones contra fuentes de
  internet y corregir lo que esté mal.

Rama: `claude/deadlock-patch-tweet-ebd02e`, armada desde `feat/rust` con
`main` mergeado. No se mergea a `main`.

**Sin la máquina de ZoTaD no se puede correr el extractor** (`games/rust/tools`
lee el juego instalado). Las pestañas nuevas usan sólo lo que ya está en
`games/rust/data`. Un dato generado que esté mal no se edita a mano en el JSON:
se anota acá para corregirlo en el extractor.

## Pasos

1. [ ] Rust con las reglas de rendimiento (`LazyRows`, imágenes, `perf.mjs`,
   build medido).
2. [ ] Rust · Cajas: qué trae cada caja (`loot.json`).
3. [ ] Rust · Tiendas: qué vende cada monumento (`shops.json`).
4. [ ] Rust · Reciclador: qué da cada objeto, ordenado por chatarra.
5. [ ] Auditoría Valheim.
6. [ ] Auditoría D2R.
7. [ ] Auditoría Zomboid.

## Bitácora

- `main` mergeado en `feat/rust` sin conflictos; `tsc` limpio; tests como en
  `main` (sólo falla `deadlockBuilds.test.ts`, que ya fallaba).
