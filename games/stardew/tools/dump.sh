#!/usr/bin/env bash
# Compila Dump.cs con el csc de Visual Studio contra el runtime .NET 6 instalado
# y las DLL del juego, y vuelca los datos a games/stardew/raw/ (ignorada por git).
# `dump.sh MapDump` compila y corre MapDump.cs (los mapas de las granjas) en vez de Dump.cs.
#
# Hace falta: Stardew Valley instalado (1.6), el runtime Microsoft.NETCore.App 6
# y el csc de Visual Studio (Build Tools o Community). Corre en Git Bash.
set -euo pipefail

JUEGO="${STARDEW_DIR:-C:/Program Files (x86)/Steam/steamapps/common/Stardew Valley}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
SALIDA="$RAIZ/games/stardew/raw"
OBJ="$RAIZ/games/stardew/raw/.bin"
PROG="${1:-Dump}"

CSC="$(ls -d "/c/Program Files/Microsoft Visual Studio"/*/*/MSBuild/Current/Bin/Roslyn/csc.exe \
             "/c/Program Files (x86)/Microsoft Visual Studio"/*/*/MSBuild/Current/Bin/Roslyn/csc.exe 2>/dev/null | head -1)"
NET="$(ls -d "/c/Program Files/dotnet/shared/Microsoft.NETCore.App"/6.* | tail -1)"
[ -n "$CSC" ] || { echo "no encontré csc.exe de Visual Studio" >&2; exit 1; }

mkdir -p "$OBJ"
refs=()
for d in "$NET"/System.*.dll "$NET"/Microsoft.*.dll "$NET"/netstandard.dll "$NET"/mscorlib.dll; do
  # Sólo las DLL administradas: las nativas rompen el compilador.
  case "$(basename "$d")" in System.IO.Compression.Native.dll|Microsoft.DiaSymReader.Native*) continue ;; esac
  refs+=("-r:$(cygpath -w "$d")")
done
refs+=("-r:$(cygpath -w "$JUEGO/MonoGame.Framework.dll")")

"$CSC" -nologo -noconfig -nostdlib -target:exe -langversion:latest -nowarn:1701,1702 \
  -out:"$(cygpath -w "$OBJ/$PROG.dll")" "${refs[@]}" "$(cygpath -w "$AQUI/$PROG.cs")"

cat > "$OBJ/$PROG.runtimeconfig.json" <<'JSON'
{ "runtimeOptions": { "tfm": "net6.0", "framework": { "name": "Microsoft.NETCore.App", "version": "6.0.0" } } }
JSON

dotnet "$(cygpath -w "$OBJ/$PROG.dll")" "$JUEGO" "$(cygpath -w "$SALIDA")"
