param (
    [string]$TargetVault = "C:\Users\ttang\.antigravity\ttangttang\지식베이스",
    [string]$GitVault = "C:\Users\ttang\Documents\Codex\2026-07-20\go\work\github-sync\Lunar-Lagoon-Agent-Army-sparse\지식베이스"
)

# sync-to-obsidian.ps1
# 바로견적(BaroQuote) 지식 문서를 로컬 Obsidian 및 GitHub 동기화 디렉터리로 원클릭 동기화하는 스크립트

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$SourceDir = Join-Path $PSScriptRoot "..\docs\obsidian-notes"

Write-Host "=== 바로견적(BaroQuote) Obsidian 지식 동기화 시작 ===" -ForegroundColor Cyan
Write-Host "소스 경로: $SourceDir"
Write-Host "대상 Vault 1 (로컬 Obsidian): $TargetVault"
Write-Host "대상 Vault 2 (GitHub 지식베이스): $GitVault"

if (-not (Test-Path $TargetVault)) {
    New-Item -ItemType Directory -Path $TargetVault -Force | Out-Null
}

$files = Get-ChildItem -Path $SourceDir -Filter "*.md"
foreach ($file in $files) {
    Copy-Item -Path $file.FullName -Destination $TargetVault -Force
    if (Test-Path $GitVault) {
        Copy-Item -Path $file.FullName -Destination $GitVault -Force
    }
    Write-Host "  ✓ 복사 완료: $($file.Name)" -ForegroundColor Green
}

Write-Host "`n총 $($files.Count)개 지식 문서가 성공적으로 동기화되었습니다!" -ForegroundColor Cyan
