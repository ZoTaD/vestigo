# Rust — Servidor (plan, 2026-10-09)

Diseño: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, punto 5. TDD; commit al final con todo verde.

## Fuente

Las convars y los comandos de consola no están en los datos del cliente: son atributos del código. Salen del
decompilado público github.com/MillionthOdin16/RustChangelog (rama `release`, último commit 8d288b3 del 2024-08-03):
cada `[ServerVar]` / `[ClientVar]` con su `Help`, su nombre (`Name` o el del campo), el prefijo de la clase
(`[Factory("server")]`, o el nombre de la clase en minúsculas) y el valor inicial del campo. Es de 2024: lo que sumó
Facepunch después (Livestock, Power Trip) no está. La página dice la fecha de la lista ("puede faltar alguna más
nueva") sin explicar de dónde sale (regla de la casa); la fuente queda en este plan y en `server.json`.

## Tareas

1. `games/rust/tools/convars.py` + `tests/test_convars.py`: clona (o usa) el decompilado en `games/rust/.cache/`,
   parsea los `.cs` y escribe `games/rust/data/server.json` (nombre, lado servidor/cliente, variable o comando, tipo,
   valor por defecto, ayuda, si se guarda en `cfg`, si es de admin) más el commit y la fecha de la fuente.
2. Ruta `server` (`/en/rust/server`, `/es/rust/servidor`), sin fichas.
3. Pestaña: calendario de los próximos wipes forzados (`wipe.ts`), generador de línea de arranque + `server.cfg`
   (las convars más usadas, con los valores por defecto del juego) y la referencia buscable con `LazyRows`.
4. SEO ("Rust server commands and convars", "Comandos y convars del servidor de Rust"), prerender, sitemap, perf.

## Resultado (2026-10-09)

- `server.json` (160 KB, ~35 KB gzip): 1.384 convars y comandos, 1.247 del servidor, 395 comandos; 760 con valor por
  defecto y ~390 con ayuda. Se suman `[ReplicatedVar]` (del servidor, la ve el cliente), `[ServerUserVar]`/`[ServerAllVar]`
  (comandos que puede usar cualquier jugador) y las propiedades con campo de respaldo (`fps.limit` = 240). Una convar del
  cliente y del servidor a la vez queda en una sola fila con los dos lados.
- `rcon.*` no son convars (son parámetros de arranque de `Facepunch.RCon`): van a mano en el generador.
- La ayuda sólo existe en inglés: en la página en español va marcada `lang="en"`, sin traducir (son ~390 frases que
  cambian con cada parche; se puede sumar un diccionario a mano como el de Parches si hace falta).
- Wipes: los próximos seis, en la hora de quien mira (el prerender los escribe en UTC). Generador: Windows/Linux, con los
  valores por defecto del juego y una contraseña RCON "CHANGE_ME" con aviso.
- Build: 88 s, `vite build` 1 min 15 s, 24.488 páginas (+2). Perf: `/en/rust/server` 28 pedidos, 1 imagen, 710 nodos.
