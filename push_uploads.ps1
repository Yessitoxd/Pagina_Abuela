<#
push_uploads.ps1

Commit y push de todos los archivos dentro de la carpeta uploads/
Diseñado para ejecutarse desde la raíz del repo o mediante el .bat en uploads\
#>
Set-StrictMode -Version Latest
try{ $RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition } catch { $RepoRoot = Get-Location }
Push-Location $RepoRoot

Write-Host "Repo root: $RepoRoot"

$uploads = Join-Path $RepoRoot 'uploads'
if(-not (Test-Path $uploads)){
    Write-Error "No existe la carpeta uploads/ en $RepoRoot"
    Pop-Location; exit 1
}

$files = Get-ChildItem -LiteralPath $uploads -File -Recurse | ForEach-Object { $_.FullName }
if($files.Count -eq 0){ Write-Host "No hay archivos en uploads/"; Pop-Location; exit 0 }

Write-Host "Archivos detectados en uploads/:"
$files | ForEach-Object { Write-Host "  $_" }

Write-Host "Ejecutando git add -- uploads/..."
& git add -- uploads/*
if($LASTEXITCODE -ne 0){ Write-Error "git add falló (exit $LASTEXITCODE)"; Pop-Location; exit $LASTEXITCODE }

Write-Host "Staged:"; & git diff --staged --name-only

Write-Host "Commitando con mensaje automático..."
$msg = "chore: add uploads/ " + (Get-Date -Format "yyyyMMdd_HHmmss")
& git commit -m $msg
if($LASTEXITCODE -ne 0){ Write-Warning "git commit no añadió cambios (probablemente ya estaban commitados). Continuando..." }

Write-Host "Pusheando a origin main..."
& git push origin main
if($LASTEXITCODE -ne 0){ Write-Error "git push falló (exit $LASTEXITCODE)"; Pop-Location; exit $LASTEXITCODE }

Write-Host "Hecho: uploads/ empujado al remoto." -ForegroundColor Green
Pop-Location
