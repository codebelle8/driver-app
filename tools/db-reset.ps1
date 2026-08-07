<#
.SYNOPSIS
  ローカル検証用データベースを作り直し、マイグレーション適用とテストを実行する。

.DESCRIPTION
  Supabase プロジェクトを用意しなくても、スキーマの実挙動を検証できる。
  db/migrations/ の SQL は一切改変せずに適用するため、ここで通れば
  Supabase でもそのまま適用できる（db/local/ のスタブは適用しないこと）。

.EXAMPLE
  powershell -File tools/db-reset.ps1
  powershell -File tools/db-reset.ps1 -SkipTests
#>
param(
  [string] $PgBin = 'C:\pgtest\pgsql\bin',
  [string] $PgData = 'C:\pgtest\data',
  [int]    $Port = 55432,
  [string] $Database = 'kurumayose',
  [switch] $SkipTests
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$psql = Join-Path $PgBin 'psql.exe'
$pgctl = Join-Path $PgBin 'pg_ctl.exe'

if (-not (Test-Path $psql)) {
  throw "psql が見つかりません: $psql  (tools/README.md の手順で PostgreSQL を用意してください)"
}

# --- サーバーが起動していなければ起動する -----------------------------------
& $pgctl -D $PgData status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'PostgreSQL を起動します...'
  & $pgctl -D $PgData -o "-p $Port -c listen_addresses=127.0.0.1" -l (Join-Path (Split-Path $PgData) 'server.log') start
  Start-Sleep -Seconds 3
}

$conn = @('-h', '127.0.0.1', '-p', "$Port", '-U', 'postgres', '-v', 'ON_ERROR_STOP=1')

Write-Host "データベース $Database を作り直します..."
& $psql @conn -d postgres -q -c "drop database if exists $Database;"
& $psql @conn -d postgres -q -c "create database $Database;"

# db/local/ はローカル検証専用。Supabase には適用しない。
$scripts = @(
  'db/local/0000_supabase_stub.sql'
) + (Get-ChildItem (Join-Path $repo 'db/migrations') -Filter '*.sql' |
       Sort-Object Name | ForEach-Object { "db/migrations/$($_.Name)" }
) + (Get-ChildItem (Join-Path $repo 'db/seed') -Filter '*.sql' |
       Sort-Object Name | ForEach-Object { "db/seed/$($_.Name)" })

foreach ($s in $scripts) {
  $full = Join-Path $repo $s
  & $psql @conn -d $Database -q -f $full
  if ($LASTEXITCODE -ne 0) { throw "適用に失敗しました: $s" }
  Write-Host "  適用 $s"
}

if ($SkipTests) {
  Write-Host "`n完了（テストはスキップ）"
  exit 0
}

Write-Host "`nテストを実行します..."
$testFiles = Get-ChildItem (Join-Path $repo 'db/tests') -Filter '*.sql' | Sort-Object Name
$passed = 0
foreach ($t in $testFiles) {
  # psql は合格報告を NOTICE (stderr) に出す。ネイティブ exe の stderr を
  # 2>&1 で取り込むと PowerShell 5.1 が NativeCommandError として扱い、
  # ErrorActionPreference='Stop' 下では停止してしまうため、ここだけ緩める。
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = (& $psql @conn -d $Database -q -f $t.FullName 2>&1 | Out-String) -split "`r?`n"
  $ErrorActionPreference = $prev
  $out | Where-Object { $_ -match 'NOTICE:\s+ok\s' } | ForEach-Object {
    Write-Host ('  PASS  ' + ($_ -replace '^.*NOTICE:\s+ok\s+', '').TrimEnd())
    $script:passed++
  }
  if ($out -match 'FAILED|^psql.*ERROR') {
    $out | Where-Object { $_ -match 'FAILED|ERROR' } | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "テストが失敗しました: $($t.Name)"
  }
}

Write-Host "`n全 $passed 件の検証項目に合格しました。"
