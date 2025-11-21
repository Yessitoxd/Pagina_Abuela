<#
remove_from_repo.ps1

Uso:
- Arrastra uno o varios archivos desde el Explorador sobre este .ps1 (se pasan como argumentos).
  Los paths deben apuntar a ficheros dentro del repo (p. ej. uploads/mi-foto.jpg).

Funcionamiento:
- Ejecuta 'git rm --cached' sobre los ficheros indicados (los eliminará del repositorio en el próximo commit,
  por defecto conserva la copia local). Después esperará a que pulses Enter para commitear y otra vez para pushear.

Opcional: si quieres eliminar también el fichero local, responde S cuando se pregunte.
#>
Set-StrictMode -Version Latest
try{ $RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition } catch { $RepoRoot = Get-Location }
Push-Location $RepoRoot
Write-Host "Repo root: $RepoRoot"

if($args.Count -eq 0){
    # No args: open file picker so the user can select files to remove
    Add-Type -AssemblyName System.Windows.Forms
    $uploadsDir = Join-Path $RepoRoot 'uploads'
    $ofd = New-Object System.Windows.Forms.OpenFileDialog
    $ofd.Multiselect = $true
    $ofd.InitialDirectory = (if(Test-Path $uploadsDir) { $uploadsDir } else { $RepoRoot })
    $ofd.Filter = 'Archivos (típicamente uploads)|*.*'
    $res = $ofd.ShowDialog()
    if($res -ne [System.Windows.Forms.DialogResult]::OK){ Write-Host "No se seleccionaron archivos. Abortando."; Pop-Location; exit 0 }
    $args = $ofd.FileNames
}

$targets = @()
foreach($a in $args){
    try{ $p = (Resolve-Path -LiteralPath $a).ProviderPath } catch { $p = $a }
    if(-not (Test-Path $p)){ Write-Warning "No existe: $p"; continue }
    $full = [System.IO.Path]::GetFullPath($p)
    if(-not $full.StartsWith($RepoRoot, [System.StringComparison]::InvariantCultureIgnoreCase)){
        Write-Warning "El fichero no está dentro del repo: $full"; continue
    }
    $rel = $full.Substring($RepoRoot.Length).TrimStart('\','/')
    $targets += @{ Full = $full; Rel = $rel }
}

if($targets.Count -eq 0){ Write-Host "No hay archivos válidos para procesar."; Pop-Location; exit 0 }

Write-Host "Ficheros que se van a eliminar del repo (git rm --cached):"
$targets | ForEach-Object { Write-Host "  $($_.Rel)" }

Write-Host "Pulsa Enter para ejecutar 'git rm --cached'..."
[void][System.Console]::ReadLine()

foreach($t in $targets){
    & git rm --cached -- "$($t.Rel)"
}

Write-Host "Staged removals:"; & git diff --staged --name-only

Write-Host "¿Quieres también eliminar los ficheros localmente? (S/N) [N]:"
$ans = Read-Host
if($ans -and $ans.ToUpper().StartsWith('S')){
    foreach($t in $targets){
        try{ Remove-Item -LiteralPath $t.Full -Force; Write-Host "Eliminado local: $($t.Full)" } catch { Write-Warning "No se pudo eliminar local: $($t.Full)" }
    }
}

Write-Host "Pulsa Enter para commitear los cambios (eliminaciones)..."
[void][System.Console]::ReadLine()
& git commit -m "chore: remove uploads files "

Write-Host "Pulsa Enter para pushear los cambios al remoto 'origin main'..."
[void][System.Console]::ReadLine()
& git push origin main
if($LASTEXITCODE -ne 0){ Write-Error "git push falló (exit $LASTEXITCODE)."; Pop-Location; exit $LASTEXITCODE }

Write-Host "Hecho. Archivos eliminados del repo y push completado." -ForegroundColor Green
Pop-Location
