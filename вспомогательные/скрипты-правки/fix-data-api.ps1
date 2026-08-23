$ErrorActionPreference = 'Stop'
$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'
$n = 1
while (Test-Path -LiteralPath (Join-Path $dir ("PREV{0}.html" -f $n))) { $n++ }
$prev = Join-Path $dir ("PREV{0}.html" -f $n)
Copy-Item -LiteralPath $path -Destination $prev
Write-Host ("Резервная копия -> " + $prev)
$before = (Get-Item -LiteralPath $path).Length
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$old = [System.IO.File]::ReadAllText((Join-Path $env:TEMP 'old_boot.txt'), [System.Text.Encoding]::UTF8)
$new = [System.IO.File]::ReadAllText((Join-Path $env:TEMP 'new_boot.txt'), [System.Text.Encoding]::UTF8)
$c = ([regex]::Matches($text, [regex]::Escape($old))).Count
if ($c -ne 1) { throw ("Якорь startup: найдено " + $c + ", ожидалось 1. Правка отменена.") }
$text = $text.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
$after = (Get-Item -LiteralPath $path).Length
Write-Host "  OK  startup: загрузка через MR_api"
Write-Host ("  размер: " + $before + " -> " + $after + " (+" + ($after-$before) + ")")
