# Maquetas: nuevo Armador / Builds de Deadlock (2026-11-14)

HTML estático, sin build. No es parte del sitio.

    cd docs/maquetas/2026-11-14-builds
    python -m http.server 4300     # o: npx serve -l 4300

Abrir http://localhost:4300/ (Biblioteca, Ficha, Editor, Publicar: barra abajo a la derecha).

Datos reales de Abrams: catálogo y habilidades (`games/deadlock/data`), build medida
(`builds.json`), builds de los 20 mejores (`top-players.json`) y 13 builds públicas
del juego bajadas de deadlock-api `/v1/builds` el 2026-11-14. Login y "tus builds" son simulados.
