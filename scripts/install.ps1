$ErrorActionPreference = 'Stop'

$repo = 'JohanBellander/flip'
$branch = if ($env:FLIP_BRANCH) { $env:FLIP_BRANCH } else { 'main' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$base = Join-Path $env:TEMP "flip-install-$stamp"
New-Item -ItemType Directory -Force -Path $base | Out-Null

$workDir = Join-Path $base 'src'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

if (Get-Command git -ErrorAction SilentlyContinue) {
  git clone --depth 1 --branch $branch "https://github.com/$repo.git" $workDir | Out-Null
} else {
  $zip = Join-Path $base 'source.zip'
  $zipUrl = "https://codeload.github.com/$repo/zip/refs/heads/$branch"
  Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zip | Out-Null
  Expand-Archive -Force -Path $zip -DestinationPath $base | Out-Null
  $unzipped = Join-Path $base "flip-$branch"
  if (-not (Test-Path $unzipped)) {
    throw "Unable to locate unzipped folder flip-$branch"
  }
  $workDir = $unzipped
}

Push-Location $workDir
try {
  if (Test-Path 'package-lock.json') { npm ci } else { npm install }
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }

  npm link
  if ($LASTEXITCODE -ne 0) { throw "npm link failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "Installed flip CLI from $repo@$branch. Try: flip --help"

# Ensure Windows shims exist and invoke Node explicitly
try {
  $globalBin = & npm prefix -g
  if (-not (Test-Path $globalBin)) { $globalBin = "$env:APPDATA\npm" }
  $shimCmd = Join-Path $globalBin 'flip.cmd'
  $shimPs1 = Join-Path $globalBin 'flip.ps1'
  $targetJs = Join-Path $globalBin 'node_modules/flip/dist/cli.js'

  $cmdContent = @"
@echo off
node "%~dp0node_modules\flip\dist\cli.js" %*
"@
  Set-Content -Encoding ASCII -Path $shimCmd -Value $cmdContent

  $ps1Content = @"
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'node_modules/flip/dist/cli.js'
node "$script" @args
"@
  Set-Content -Encoding UTF8 -Path $shimPs1 -Value $ps1Content
} catch {}


