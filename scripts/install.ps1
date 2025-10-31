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
  npm run build
  npm link
} finally {
  Pop-Location
}

Write-Host "Installed flip CLI from $repo@$branch. Try: flip --help"


