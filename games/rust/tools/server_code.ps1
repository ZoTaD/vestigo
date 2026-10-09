# Rust: los valores por defecto que el servidor dedicado pone en código (2026-10-09). Lo llama `extract_server.py`.
#
# Lee `RustDedicated_Data/Managed/Assembly-CSharp.dll` del servidor con el Mono.Cecil que trae el mismo servidor (no
# hace falta instalar nada: PowerShell 5.1 de Windows). Por cada clase pedida saca:
#   - las constantes (`const`) con su valor;
#   - los campos estáticos que el constructor estático (`.cctor`) inicializa con un número o un booleano literal
#     (`ldc.*` seguido de `stsfld`): así se definen las convars (`[ServerVar]`/`[ReplicatedVar]`) y su valor por
#     defecto.
# Escribe JSON a la salida estándar: {"Clase": {"campo": valor, ...}, ...}. Las clases van por nombre corto (`Powergrid`)
# o completo (`ConVar.ApartmentCommands`).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File server_code.ps1 -Server C:\RustServer -Types "RentableShop,Powergrid"
param([string]$Server, [string]$Types)

$managed = Join-Path $Server "RustDedicated_Data\Managed"
[void][Reflection.Assembly]::LoadFrom((Join-Path $managed "Mono.Cecil.dll"))
$asm = [Mono.Cecil.AssemblyDefinition]::ReadAssembly((Join-Path $managed "Assembly-CSharp.dll"))
$want = $Types.Split(",")
$out = [ordered]@{}

function Literal($ins) {
    $op = $ins.OpCode.Code.ToString()
    if ($op -match "^Ldc_I4_M1$") { return -1 }
    if ($op -match "^Ldc_I4_(\d)$") { return [int]$Matches[1] }
    if ($op -in @("Ldc_I4", "Ldc_I4_S", "Ldc_I8", "Ldc_R4", "Ldc_R8")) { return $ins.Operand }
    return $null
}

foreach ($t in $asm.MainModule.GetTypes()) {
    if (($want -notcontains $t.Name) -and ($want -notcontains $t.FullName)) { continue }
    $vals = [ordered]@{}
    foreach ($f in $t.Fields) {
        if ($f.HasConstant -and $f.Constant -ne $null -and -not ($f.Constant -is [string])) { $vals[$f.Name] = $f.Constant }
    }
    $cctor = $t.Methods | Where-Object { $_.Name -eq ".cctor" -and $_.HasBody }
    if ($cctor) {
        $ins = $cctor.Body.Instructions
        for ($k = 1; $k -lt $ins.Count; $k++) {
            if ($ins[$k].OpCode.Code.ToString() -ne "Stsfld") { continue }
            $v = Literal $ins[$k - 1]
            if ($v -eq $null) { continue }
            $field = $ins[$k].Operand
            if ($field.DeclaringType.FullName -ne $t.FullName) { continue }
            if ($field.FieldType.FullName -eq "System.Boolean") { $v = [bool]$v }
            $vals[$field.Name] = $v
        }
    }
    $key = if ($want -contains $t.FullName) { $t.FullName } else { $t.Name }
    $out[$key] = $vals
}
$out | ConvertTo-Json -Depth 4 -Compress
