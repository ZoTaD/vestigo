# CoH1: enciclopedia (etapa 3), plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `/coh1` tenga Unidades, Armas, Doctrinas, Penetración y Mapas con fichas indexables, sacadas del Company of Heroes relanzado instalado (app 228200, con Opposing Fronts y Tales of Valor), con los íconos y emblemas del juego.

**Architecture:**
- La misma idea que CoH2 (`docs/superpowers/plans/2026-11-06-coh2-enciclopedia.md`): un armador propio, `games/coh1/tools/site_data.py`, escribe los formatos de CoH3. Las doctrinas van en `doctrines/`, con la forma de los battlegroups (dos ramas de mejoras con costo en puntos de mando).
- Los íconos de CoH1 son texturas `.rgt`: Relic Chunky con `TFMT` (ancho, alto) y `TDAT` (DXT5 comprimido con zlib, con 16 bytes de encabezado). Se leen con `games/coh/tools/rgt.py` y hay que darlas vuelta verticalmente.
- **Daño en CoH1:** cada arma tiene multiplicadores por tipo de blanco (`target_table/tp_*`: precisión, daño, penetración, penetración trasera) y cada entidad su tipo (`type_ext/type_target_weapon`). La penetración es una probabilidad directa.
  - La calculadora reutiliza el motor de CoH3: el arma se convierte contra el tipo de blanco elegido (precisión, daño y penetración multiplicados), con blindaje 1 y tamaño de blanco 1.
  - Distancias: `short`/`medium`/`long` hacen de cerca, media y lejos.

**Spec:** `docs/superpowers/specs/2026-11-06-coh-unificado-design.md` (etapa 3).

## Global Constraints

- Las mismas de la etapa 2. **NADA a producción.**
- Facciones de CoH1 (carpeta del juego → clave del sitio): `allies` → `american`, `allies_commonwealth` → `british`, `axis` → `wehrmacht`, `axis_panzer_elite` → `panzer_elite`.
- Sólo multijugador: fuera los archivos con `_sp`, `sp_`, `_m0`, `test`, `battle_sim`, `tutorial` y `la_fiere`/`trun`/`villers` (doctrinas de campaña). Los edificios de multijugador no tienen sufijo.
- **Textos:** CoH1 está instalado en español, así que por ahora sólo hay `RelicCOH.Spanish.ucs`. Mientras ZoTaD no baje el inglés, `name.en` es el español. Cuando esté, se vuelve a correr la extracción y no cambia nada más.

## Review Focus

1. Una unidad de campaña que se cuela por compartir edificio (los `hq_sp_m06`, `battle_sim_*`): la lista no las muestra. Test en Task 2.
2. Un arma sin entrada para el tipo de blanco elegido: multiplicador 1, no se rompe. Test en Task 3.
3. Un `.rgt` con otro formato (DXT1, sin zlib): se decodifica o se saltea sin cortar la extracción. Test en Task 1.

---

### Task 1: Texturas `.rgt`
- Create: `games/coh/tools/rgt.py` (`decode(data: bytes) -> PIL.Image | None`), y `tests/test_rgt.py` con un `.rgt` armado en memoria (DXT5 y DXT1, con y sin zlib).
- [ ] Tests primero, implementar, en verde, commit `coh: texturas .rgt de CoH1`.

### Task 2: Datos de la enciclopedia de CoH1
- Create: `games/coh1/tools/site_data.py`, `games/coh1/tools/tests/test_site_data.py`.
- Unidades: escuadras que producen los edificios de multijugador de cada raza (`spawner_ext/squad_table`). Las de doctrina, por las habilidades de las mejoras del árbol (`ability`/`squad` convocadas) o porque la mejora es requisito de la escuadra.
- Armas: los campos de CoH3 más `targets: {tp_x: [acc, dmg, pen, rearPen]}`. Las unidades suman `target: "tp_x"`.
- Doctrinas: los 12 árboles de multijugador (`allied_*`, `axis_*`, `pe_*`, `royal_*`), con `branches: [{name, upgrades: [{slug, name, icon, desc, cp, unlocks}]}]`.
- Íconos: `art/ui/ingame/<icon_name>.rgt` (`WW2Art.sga` y los `DLC*`) → `site/public/coh1/i/<nombre>.webp`. Emblemas de facción, si están.
- [ ] Tests primero (`es_multijugador`, `faccion`, `tabla_blancos`), implementar, correr, revisar a ojo (Riflemen 5+1, 55 de vida; Sherman 636), commit.

### Task 3: Sitio
- `data.ts`: `coh1` en `JUEGOS`. `route.ts`: CoH1 con `units`, `weapons`, `doctrines` (es `doctrinas`), `penetration` y `maps`, y `doctrines` ↔ `battlegroups` ↔ `commanders` en `switchGame`.
- `Icon`: `/coh1/i/`. Página `CohDoctrines.tsx` (a partir de Battlegroups: dos ramas con CP).
- Penetración de CoH1: elegir arma y unidad blanco; el arma se convierte con `statsContra(w, tipo)`. Test: el Garand contra infantería usa su multiplicador `tp_infantry`.
- SEO, sitemap y perf de las páginas nuevas.
- [ ] Tests primero, implementar, mirar en el navegador, commit.

### Task 4: Build, perf, revisión y push
- [ ] Build medido, perf de CoH1, revisión final con revisor nuevo, arreglos con test, push al PR 91 (borrador).
