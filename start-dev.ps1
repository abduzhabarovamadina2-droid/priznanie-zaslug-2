<#
  Локальный запуск модуля «Признание заслуг» без Docker.
  Поднимает backend (порт 4000) и статический сервер фронтенда (порт 8010)
  в отдельных окнах.

  Запуск:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
           .\start-dev.ps1 -Force   — сначала гасит занявшие порты процессы

  Пути нигде не зашиты: всё считается от папки самого скрипта, поэтому
  корневую папку проекта можно переименовывать и переносить свободно.

  ВАЖНО: файл сохранён в UTF-8 с BOM. Windows PowerShell 5.1 читает .ps1
  без BOM как ANSI и портит кириллицу.
#>

[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# $PSScriptRoot пуст, если содержимое скрипта вставили в консоль руками —
# тогда отталкиваемся от текущей папки.
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

Write-Host "Корень проекта: $root" -ForegroundColor DarkGray

foreach ($dir in @($backend, $frontend)) {
    if (-not (Test-Path $dir)) {
        Write-Warning "Не найдена папка $dir."
        Write-Host '  Запускайте start-dev.ps1 из корня проекта — рядом должны лежать backend\ и frontend\.' -ForegroundColor DarkGray
        exit 1
    }
}

function Get-PortOwner([int]$Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        return Get-Process -Id $conn.OwningProcess -ErrorAction Stop
    } catch { return $null }
}

function Assert-PortFree([int]$Port, [string]$Name) {
    $owner = Get-PortOwner $Port
    if (-not $owner) { return $true }

    if ($Force) {
        Write-Host "Порт $Port занят процессом $($owner.ProcessName) (PID $($owner.Id)) — останавливаю." -ForegroundColor Yellow
        Stop-Process -Id $owner.Id -Force
        Start-Sleep -Milliseconds 500
        return $true
    }

    Write-Warning "$Name : порт $Port уже занят процессом $($owner.ProcessName) (PID $($owner.Id))."
    Write-Host "  Закройте старое окно, либо: Stop-Process -Id $($owner.Id) -Force" -ForegroundColor DarkGray
    Write-Host "  Либо перезапустите скрипт с ключом -Force" -ForegroundColor DarkGray
    return $false
}

if (-not (Test-Path (Join-Path $backend '.env'))) {
    Write-Warning "Не найден $backend\.env — скопируйте .env.example и заполните DATABASE_URL и JWT_SECRET."
    exit 1
}

if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
    Write-Host 'Ставлю зависимости backend...' -ForegroundColor Yellow
    Push-Location $backend
    npm install
    Pop-Location
}

$okApi = Assert-PortFree 4000 'Backend'
$okWeb = Assert-PortFree 8010 'Фронтенд'
if (-not ($okApi -and $okWeb)) { exit 1 }

Start-Process powershell -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command',
    "Set-Location -LiteralPath `"$backend`"; npm run dev"
)

Start-Process powershell -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command',
    "Set-Location -LiteralPath `"$frontend`"; npm start"
)

Write-Host ''
Write-Host 'Backend  : http://localhost:4000/api/health' -ForegroundColor Green
Write-Host 'Фронтенд : http://localhost:8010/'            -ForegroundColor Green
Write-Host ''
Write-Host 'Адрес API правится в frontend\config.js' -ForegroundColor DarkGray
