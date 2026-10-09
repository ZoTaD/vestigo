# Rust — Servidor (plan, 2026-10-09)

Diseño: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, punto 5. TDD; commit al final con todo verde.

## Fuente

Las convars y los comandos de consola no están en los datos del cliente: son atributos del código. Salen del
decompilado público github.com/MillionthOdin16/RustChangelog (rama `release`, último commit 8d288b3 del 2024-08-03):
cada `[ServerVar]` / `[ClientVar]` con su `Help`, su nombre (`Name` o el del campo), el prefijo de la clase
(`[Factory("server")]`, o el nombre de la clase en minúsculas) y el valor inicial del campo. Es de 2024: lo que sumó
Facepunch después (Livestock, Power Trip) no está; se dice en la página como "lista del juego de 2024" no — se dice la
fecha de la lista sin explicar de dónde sale (regla de la casa), en el plan queda la fuente.

## Tareas

1. `games/rust/tools/convars.py` + `tests/test_convars.py`: clona (o usa) el decompilado en `games/rust/.cache/`,
   parsea los `.cs` y escribe `games/rust/data/server.json` (nombre, lado servidor/cliente, variable o comando, tipo,
   valor por defecto, ayuda, si se guarda en `cfg`, si es de admin) más el commit y la fecha de la fuente.
2. Ruta `server` (`/en/rust/server`, `/es/rust/servidor`), sin fichas.
3. Pestaña: calendario de los próximos wipes forzados (`wipe.ts`), generador de línea de arranque + `server.cfg`
   (las convars más usadas, con los valores por defecto del juego) y la referencia buscable con `LazyRows`.
4. SEO ("Rust server commands and convars", "Comandos y convars del servidor de Rust"), prerender, sitemap, perf.
