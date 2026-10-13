# Genera mundos con el propio servidor de Terraria, para contar qué trae cada cofre. Los deja en
# games/terraria/cache/worlds (sin versionar). Corre después de `dump.ps1`, que compila Dump.exe y extrae XNA.
# Uso: powershell -File games/terraria/tools/worlds.ps1 [-Count 18]
# De a un mundo por vez (chico, mediano, grande, y vuelta a empezar): cada uno tarda menos de un minuto y ocupa menos
# de 1 GB de memoria. Las semillas son fijas, así los mundos salen siempre iguales.
param(
    [string]$Game = "C:\Program Files (x86)\Steam\steamapps\common\Terraria",
    [int]$Count = 18
)

$ErrorActionPreference = "Stop"
$cache = Join-Path (Split-Path $PSScriptRoot -Parent) "cache"
$exe = Join-Path $cache "Dump.exe"
$xna = Join-Path $cache "xna"
$worlds = Join-Path $cache "worlds"
New-Item -ItemType Directory -Force $worlds | Out-Null

for ($i = 1; $i -le $Count; $i++) {
    $name = "w$i"
    $wld = Join-Path $worlds "$name.wld"
    if (Test-Path $wld) { Write-Output "$name ya está"; continue }
    # La mitad con Corrupción y la mitad con Carmesí: cambian los cofres y lo que se pesca.
    $evil = if ($i % 2) { "corruption" } else { "crimson" }
    $size = 1 + ($i - 1) % 3
    $cfg = Join-Path $worlds "$name.cfg"
    @(
        "world=$wld", "autocreate=$size", "worldname=$name", "seed=vestigo$i", "difficulty=0", "worldevil=$evil",
        "port=$(7790 + $i)", "maxplayers=1", "upnp=0", "secure=0"
    ) | Set-Content -Encoding ascii $cfg
    $log = Join-Path $worlds "$name.log"
    $stdin = Join-Path $worlds "stdin.txt"
    Set-Content -Encoding ascii $stdin ""
    $p = Start-Process $exe -ArgumentList '--server', "`"$(Join-Path $Game 'TerrariaServer.exe')`"", "`"$xna`"", '-config', "`"$cfg`"", '-savedirectory', "`"$(Join-Path $worlds 'save')`"" `
        -RedirectStandardOutput $log -RedirectStandardInput $stdin -PassThru -WindowStyle Hidden
    $start = Get-Date
    # El servidor guarda el mundo apenas termina de generarlo: ahí se lo cierra, antes de que se quede esperando jugadores.
    while (-not (Test-Path $wld) -and -not $p.HasExited -and ((Get-Date) - $start).TotalSeconds -lt 600) { Start-Sleep -Seconds 2 }
    Start-Sleep -Seconds 3
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    if (-not (Test-Path $wld)) { Get-Content $log -Tail 5; throw "no se generó $name" }
    Write-Output "$name (tamaño $size, $evil): $([int]((Get-Date) - $start).TotalSeconds) s"
}
