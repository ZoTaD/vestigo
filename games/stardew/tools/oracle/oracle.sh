#!/usr/bin/env bash
# Compila Oracle.cs contra las DLL del juego instalado y corre todos los
# comandos del oráculo del predictor de Stardew. Cada comando escribe un JSON en
# site/test/fixtures/stardew-predict/: son los valores esperados de los tests.
#
# No va al sitio y no copia código del juego: sólo lo invoca desde afuera.
# Los binarios quedan en games/stardew/raw/.bin (ignorada por git).
#
# Hace falta: Stardew Valley 1.6 instalado, el runtime Microsoft.NETCore.App 6
# y el csc de Visual Studio (Build Tools o Community). Corre en Git Bash.
#
# Uso: oracle.sh            (corre todos los comandos)
#      oracle.sh rng        (sólo los comandos nombrados)
set -euo pipefail

JUEGO="${STARDEW_DIR:-C:/Program Files (x86)/Steam/steamapps/common/Stardew Valley}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../../.." && pwd)"
OBJ="$RAIZ/games/stardew/raw/.bin"
SALIDA="$RAIZ/site/test/fixtures/stardew-predict"

# Un comando por entrada; sumar acá los que vayan apareciendo.
COMANDOS=(rng geodes cart)
[ "$#" -gt 0 ] && COMANDOS=("$@")

CSC="$(ls -d "/c/Program Files/Microsoft Visual Studio"/*/*/MSBuild/Current/Bin/Roslyn/csc.exe \
             "/c/Program Files (x86)/Microsoft Visual Studio"/*/*/MSBuild/Current/Bin/Roslyn/csc.exe 2>/dev/null | head -1)"
NET="$(ls -d "/c/Program Files/dotnet/shared/Microsoft.NETCore.App"/6.* | tail -1)"
[ -n "$CSC" ] || { echo "no encontré csc.exe de Visual Studio" >&2; exit 1; }

mkdir -p "$OBJ" "$SALIDA"
refs=()
for d in "$NET"/System.*.dll "$NET"/Microsoft.*.dll "$NET"/netstandard.dll "$NET"/mscorlib.dll; do
  # Sólo las DLL administradas: las nativas rompen el compilador.
  case "$(basename "$d")" in System.IO.Compression.Native.dll|Microsoft.DiaSymReader.Native*) continue ;; esac
  refs+=("-r:$(cygpath -w "$d")")
done
for x in "Stardew Valley.dll" MonoGame.Framework.dll StardewValley.GameData.dll Netcode.dll xTile.dll; do
  [ -f "$JUEGO/$x" ] && refs+=("-r:$(cygpath -w "$JUEGO/$x")")
done

"$CSC" -nologo -noconfig -nostdlib -target:exe -langversion:latest -nowarn:1701,1702 \
  -out:"$(cygpath -w "$OBJ/Oracle.dll")" "${refs[@]}" "$(cygpath -w "$AQUI/Oracle.cs")"

cat > "$OBJ/Oracle.runtimeconfig.json" <<'JSON'
{ "runtimeOptions": { "tfm": "net6.0", "framework": { "name": "Microsoft.NETCore.App", "version": "6.0.0" } } }
JSON

for c in "${COMANDOS[@]}"; do
  dotnet "$(cygpath -w "$OBJ/Oracle.dll")" "$JUEGO" "$c" "$(cygpath -w "$SALIDA/$c.json")"
done
