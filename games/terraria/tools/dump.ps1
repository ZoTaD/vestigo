# Compila y corre Dump.cs contra la instalación de Terraria. Deja todo en games/terraria/cache (sin versionar).
# Uso: powershell -File games/terraria/tools/dump.ps1 [-Game "C:\...\Terraria"]
param([string]$Game = "C:\Program Files (x86)\Steam\steamapps\common\Terraria")

$ErrorActionPreference = "Stop"
$tools = $PSScriptRoot
$cache = Join-Path (Split-Path $tools -Parent) "cache"
New-Item -ItemType Directory -Force $cache | Out-Null

# XNA no hace falta instalarlo: las DLL se sacan del instalador que trae el juego (`/a` extrae, no instala).
$xna = Join-Path $cache "xna"
if (-not (Test-Path $xna)) {
    $msi = Join-Path $Game "xnafx40_redist.msi"
    $p = Start-Process msiexec -ArgumentList '/a', "`"$msi`"", '/qn', "TARGETDIR=`"$xna`"" -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "msiexec devolvió $($p.ExitCode)" }
}

# El juego es de 32 bits: hace falta el compilador x86 de .NET Framework 4, que viene con Windows.
$csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
$exe = Join-Path $cache "Dump.exe"
& $csc /nologo /platform:x86 /out:"$exe" (Join-Path $tools "Dump.cs")
if ($LASTEXITCODE -ne 0) { throw "csc devolvió $LASTEXITCODE" }

& $exe (Join-Path $Game "TerrariaServer.exe") $xna $cache
if ($LASTEXITCODE -ne 0) { throw "Dump.exe devolvió $LASTEXITCODE" }
