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

1. [x] Rust con las reglas de rendimiento (`LazyRows`, imágenes, `perf.mjs`,
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
- Paso 1: `LazyRows` en Objetos de Rust y `decoding="async"`. Build con
  Rust: `vite build` 99 s, 2,3 GB, 24.292 páginas. `npm run perf` en verde;
  Objetos de Rust: 148 pedidos, 731 nodos al abrir.
- Cajas contra la wiki oficial (wiki.facepunch.com/rust/elite-crate), caja de
  élite: chatarra, HQM, fragmento avanzado, L96, LR-300, lanzacohetes, señal
  de suministro y MLRS coinciden. **Distintos:** AK y cerrojo 3,9 % (nuestro)
  vs 4,4 % (wiki); C4 y explosivos 1,9 vs 2,4; cuerpo de rifle 22,7 vs 27,7.
  Nuestros máximos son más altos porque cuentan todas las tiradas (diseño).
  No se sabe cuál está al día (la wiki dice "este año"): revisar el extractor
  (`world.py`) con el juego.
