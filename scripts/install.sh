#!/usr/bin/env bash
set -euo pipefail

REPO="JohanBellander/flip"
BRANCH="${FLIP_BRANCH:-main}"

WORKDIR="$(mktemp -d -t flip-install-XXXXXX)"

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$BRANCH" "https://github.com/${REPO}.git" "$WORKDIR"
else
  curl -fsSL -o "$WORKDIR/source.zip" "https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}"
  mkdir -p "$WORKDIR/src"
  unzip -q "$WORKDIR/source.zip" -d "$WORKDIR/src"
  WORKDIR="$WORKDIR/src/flip-${BRANCH}"
fi

cd "$WORKDIR"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
npm link

echo "Installed flip CLI from ${REPO}@${BRANCH}. Try: flip --help"


