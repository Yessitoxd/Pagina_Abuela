<#
upload_and_push.ps1

Uso:
- Arrastra uno o varios archivos desde el Explorador sobre este .ps1 (se pasan como argumentos).
- Si no pasas argumentos, añadirá todos los ficheros encontrados en ./uploads/.

El script añadirá los ficheros al índice, esperará a que pulses Enter para commitear
y otra vez Enter para pushear. Está pensado para ejecutarse desde la raíz del repo
al arrastrar archivos sobre el script.
#>
Set-StrictMode -Version Latest
try{
    $RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
}catch{
    $RepoRoot = Get-Location
}

Push-Location $RepoRoot
Write-Host "Repo root: $RepoRoot"

# Build list of files to add
$filesToAdd = @()
if($args.Count -gt 0){
    foreach($a in $args){
        try{ $p = (Resolve-Path -LiteralPath $a).ProviderPath } catch { $p = $a }
        if(Test-Path $p){ $filesToAdd += $p } else { Write-Warning "No existe: $a" }
    }
} else {
    # Interactive mode: let user choose to add all files in uploads/ or pick specific files
    $uploadsDir = Join-Path $RepoRoot 'uploads'
    Add-Type -AssemblyName System.Windows.Forms
    $choice = $null
    while(-not $choice){
        Write-Host "No se pasaron argumentos. Elige: [A]ñadir todo uploads/  [P]ick files  [Q]uitar/Salir"
        $choice = Read-Host "A/P/Q"
        if(!$choice) { continue }
        $choice = $choice.ToUpper().Trim()
        if($choice -eq 'A'){
            if(Test-Path $uploadsDir){
                $filesToAdd = Get-ChildItem -LiteralPath $uploadsDir -File -Recurse | ForEach-Object { $_.FullName }
            } else { Write-Error "No existe la carpeta uploads/ en $RepoRoot"; Pop-Location; exit 1 }
        } elseif($choice -eq 'P'){
            $ofd = New-Object System.Windows.Forms.OpenFileDialog
            $ofd.Multiselect = $true
            $ofd.InitialDirectory = (if(Test-Path $uploadsDir) { $uploadsDir } else { [Environment]::GetFolderPath('MyPictures') })
            $ofd.Filter = 'Imágenes|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp|Todos los archivos|*.*'
            $res = $ofd.ShowDialog()
            if($res -ne [System.Windows.Forms.DialogResult]::OK){ Write-Host "No se seleccionaron archivos. Abortando."; Pop-Location; exit 0 }
            $filesToAdd = $ofd.FileNames
        } elseif($choice -eq 'Q'){
            Write-Host "Abortado por usuario."; Pop-Location; exit 0
        } else { $choice = $null }
    }
}

if($filesToAdd.Count -eq 0){ Write-Host "No hay ficheros para añadir. Abortando."; Pop-Location; exit 0 }

# Normalize to relative paths for git
$relativePaths = @()
foreach($f in $filesToAdd){
    $full = [System.IO.Path]::GetFullPath($f)
    if($full.StartsWith($RepoRoot, [System.StringComparison]::InvariantCultureIgnoreCase)){
        $rel = $full.Substring($RepoRoot.Length).TrimStart('\','/')
    } else {
        # If file is outside repo, copy to uploads (overwrite existing files to avoid duplicate names)
        $uploadsDir = Join-Path $RepoRoot 'uploads'
        if(-not (Test-Path $uploadsDir)){ New-Item -ItemType Directory -Path $uploadsDir | Out-Null }
        $dest = Join-Path $uploadsDir ([System.IO.Path]::GetFileName($full))
        Write-Host "El fichero $full no está dentro del repo. Se copiará a: $dest (se sobrescribirá si existe)"
        Copy-Item -LiteralPath $full -Destination $dest -Force
        $rel = "uploads/" + [System.IO.Path]::GetFileName($full)
    }
    $relativePaths += $rel
}

Write-Host "Ficheros que se van a añadir (relativos al repo):"
$relativePaths | ForEach-Object { Write-Host "  $_" }

Write-Host "Pulsa Enter para ejecutar 'git add'..."
[void][System.Console]::ReadLine()

# Run git add
$gitAddArgs = @('add','--') + $relativePaths
& git @gitAddArgs
if($LASTEXITCODE -ne 0){ Write-Error "git add falló (exit $LASTEXITCODE)."; Pop-Location; exit $LASTEXITCODE }

Write-Host "Staged files:"; & git diff --staged --name-only

Write-Host "Pulsa Enter para commitear los cambios..."
[void][System.Console]::ReadLine()

$commitMessage = "chore: add uploads/ " + ((Get-Date).ToString('yyyyMMdd_HHmm'))
& git commit -m $commitMessage
if($LASTEXITCODE -ne 0){ Write-Warning "git commit no añadió cambios (probablemente nada nuevo que commitear). Continuando..." }

Write-Host "Pulsa Enter para pushear al remoto 'origin main'..."
[void][System.Console]::ReadLine()
& git push origin main
if($LASTEXITCODE -ne 0){ Write-Error "git push falló (exit $LASTEXITCODE)."; Pop-Location; exit $LASTEXITCODE }

Write-Host "Hecho. Archivos subidos y repo actualizado." -ForegroundColor Green
Pop-Location
