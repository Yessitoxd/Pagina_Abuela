<#
Simple helper to add, commit and push all files in the uploads/ folder.

Usage:
  .\commit_uploads.ps1              # commits with default message containing timestamp
  .\commit_uploads.ps1 -Message "Add fotos feria"

Notes:
- Run this from the repository root (where .git exists).
- This is a convenience helper for small sites where you prefer to keep images in the repo
  instead of external storage. Be mindful of GitHub file size limits and repo bloat.
#>

param(
  [string]$Message = "Add uploads $(Get-Date -Format 'yyyy-MM-dd_HH-mm')"
)

Write-Host "Checking for changes in uploads/ ..."
$status = git status --porcelain uploads\* 2>$null
if (-not $status) {
  Write-Host "No changes detected in uploads/. Nothing to commit." -ForegroundColor Yellow
  exit 0
}

Write-Host "Staging uploads/..."
git add uploads\*

Write-Host "Committing: $Message"
git commit -m "$Message"

Write-Host "Pushing to origin/main..."
git push origin main

Write-Host "Done. If push failed, check your credentials and network."
