## FLIP — From LUMA Into Penpot

Deterministic, offline CLI that converts a structural UI "Scaffold JSON" into a Penpot‑compatible JSON‑in‑ZIP package. FLIP standardizes validation, layout, and basic affordances before visual implementation.

FLIP is designed to be used together with **LUMA** — generate/validate the scaffold with LUMA, then visualize the same scaffold in **Penpot** using FLIP.

- LUMA — Layout & UX Mockup Analyzer: `https://github.com/JohanBellander/luma`
- Penpot — Open‑source design tool: `https://penpot.app/`

#### Typical workflow (LUMA ➜ FLIP)
1. Create or refine a scaffold with LUMA until it passes its checks
2. Feed that scaffold JSON to FLIP to compute frames and export a Penpot bundle
3. Import the `.penpot` in Penpot to inspect and iterate visually

### What It Does
- **Validate** a scaffold against a strict schema
- **Compute layout** frames for chosen viewport(s)
- **Map to Penpot** layers and **export** a ZIP Penpot can import
- **Deterministic** output for identical inputs; no network access

### Requirements
- Node.js ≥ 18

### Install (one line)

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/JohanBellander/flip/main/scripts/install.ps1 | iex
```

macOS/Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/JohanBellander/flip/main/scripts/install.sh | bash
```

Develop branch (latest in-progress features):

PowerShell:
```powershell
$env:FLIP_BRANCH='develop'; irm https://raw.githubusercontent.com/JohanBellander/flip/main/scripts/install.ps1 | iex
```

Bash:
```bash
FLIP_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/JohanBellander/flip/main/scripts/install.sh | bash
```

### Install (from source)
```bash
git clone https://github.com/your-org/FLIP.git
cd FLIP
npm install
npm run build
npm link
```

This installs the `flip` CLI from `dist/cli.js`.

### Quick Start
Use the bundled examples in `examples/` to try the CLI:

```bash
# Describe capabilities (JSON by default)
flip describe --format json

# Step 1: validate and normalize input
flip ingest --input examples/minimal.json

# Step 2: compute layout artifacts for multiple viewports
flip layout --input examples/minimal.json --viewports 1280x800,768x1024

# Step 3: export Penpot ZIP (optionally apply a theme)
flip export --input examples/minimal.json --viewport 1280x800 \
  --out out/flip-minimal-1280x800.zip \
  --theme examples/themes/dark.json

# Orchestrate all steps in one command
flip pipeline --input examples/minimal.json --viewport 1280x800 \
  --out out/flip-minimal-1280x800.zip
```

Artifacts and diagnostics are written to a timestamped run folder under `.flip/runs/<YYYYMMDD-HHMMSS-mmm>/`.

### Commands
- `flip describe` — Output supported schema and capabilities (`--format json|text`)
- `flip ingest` — Validate and normalize the scaffold (`--input <file>`)
- `flip layout` — Compute frames per viewport (`--input <file> --viewports <WxH[,WxH,...]> [--out <dir>]`)
- `flip export` — Produce a Penpot JSON‑in‑ZIP bundle (.zip or .penpot) (`--input <file> --viewport <WxH> --out <bundle> [--theme <json>]`)
- `flip pipeline` — Run ingest → layout → export (`--input <file> --viewport <WxH> --out <bundle> [--theme <json>]`)

### Documentation
- `FLIP-SPEC.md` — Full data and behavior specification
- `IMPLEMENTATION_PLAN.md` — Architecture and delivery milestones
- `examples/README.md` — Example scaffolds and themes
- `AGENTS.md` — Repository workflow and task tracking rules

### Penpot bundles (.penpot)
- **What is produced**: A Penpot‑compatible JSON‑in‑ZIP package. You may keep the `.zip` extension or rename it to `.penpot`; Penpot accepts both when importing.
- **How to use**: In Penpot, choose File → Import and select the generated `.zip` or `.penpot` file.
- **Current limitations**:
  - Single page with one artboard per export (per chosen viewport)
  - Supported layer types (subset): `group`, `frame`, `rect`, `text`
  - No interactions, prototyping links, or components/instances
  - Basic styles only; custom fonts are not embedded unless provided as assets
  - Round‑trip editing back into FLIP is not supported

### Related projects / links
- LUMA (generate and evaluate scaffolds): `https://github.com/JohanBellander/luma`
- Penpot (import and inspect designs): `https://penpot.app/`

### Testing
```bash
npm test
```

### Notes
- Output and exit codes follow the spec: 0 (success), 2 (invalid input), 3 (blocking analysis), 4 (I/O error), 5 (unsupported schema).
- The CLI is deterministic and performs only local file I/O.


