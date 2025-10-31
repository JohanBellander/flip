## FLIP v1.0 — Implementation Plan (TypeScript CLI)

This plan implements the FLIP CLI per `FLIP-SPEC.md` without introducing markdown task tracking; Beads is used for issue tracking.

### Architecture
- Language: TypeScript on Node.js ≥ 18; pure file I/O, no network.
- Package layout:
  - `src/cli/` — command entrypoints (`ingest`, `layout`, `export`, `pipeline`, `describe`)
  - `src/schema/` — scaffold types and validation (per §4, §4.4)
  - `src/overrides/` — responsive overrides engine (per §5)
  - `src/layout/` — layout computation (measurement, containers, policies) (per §6)
  - `src/export/` — Penpot mapping + ZIP packaging (per §7, §8)
  - `src/theme/` — theme merge and defaults (per §10)
  - `src/run/` — run-folder management and timestamping (per §11)
  - `src/errors/` — diagnostics model and exit codes (per §3, §13)
  - `examples/` — minimal scaffold and themes (per §4.5, §10)
  - `tests/` — unit + e2e tests (validation, layout, export, CLI)

### Dependencies
- CLI: `commander` or `yargs`.
- Validation: `zod` or `ajv` (strict mode) for schema + custom rules.
- ZIP: `archiver`.
- UUID/time: `uuid`, `dayjs` (or `Intl` + small util) for timestamps.
- FS: Node `fs`, `path`, `fs/promises`.

### Commands (incremental delivery)
1) `flip describe` (per §9.5)
   - Outputs supported node types, required fields, defaults, layer types, exit codes in JSON.

2) `flip ingest` (per §9.1)
   - Parse JSON, validate per §4.4; write normalized `ingest.json` to `.flip/runs/<ts>/`.
   - Exit codes: `0` on success, `2` on invalid.

3) `flip layout` (per §9.2)
   - Apply overrides per §5 for each viewport; compute frames per §6; write `layout_<WxH>.json`.
   - Exit `0` or `3` on blocking analysis.

4) `flip export` (per §9.3)
   - Use latest run folder artifacts or compute in-memory; map per §8; assemble ZIP per §7.
   - Support `--theme` merge per §10; exit `0`/`4` on I/O error.

5) `flip pipeline` (per §9.4)
   - Orchestrates ingest → layout (selected viewport) → export in one run folder.

### Core modules
- Schema & validation (per §4):
  - Types for nodes and top-level; strict enum/value checks; uniqueness of `id`s; spacing and breakpoint rules.
  - Normalization: defaults for optional fields; pruning unknown keys.

- Responsive overrides (per §5):
  - Apply `>=X` (ascending) then `<=Y` (descending); shallow-merge; arrays replace.

- Layout engine (per §6):
  - Measurement heuristics for text; enforce minTouchTarget for Button/Field; policies `hug|fill|fixed`.
  - Containers: Stack (vertical/horizontal + wrap), Grid (effective columns, gaps), Box (padding).
  - Advisory issues collection (`overflow-x`, `primary-below-fold`, `spacing-off-scale`).

- Export (per §7, §8):
  - Penpot JSON generation: `manifest.json`, `document.json`, `pages/page-1.json`.
  - Layers: `group|rectangle|text`; Z-order = document order.
  - Node mappings for Text, Button (role-based fills), Field (label/input/help), Form, Stack/Grid/Box, Table.
  - ZIP packaging to `--out`.

- Theming (per §10):
  - Merge supplied theme with defaults; stable fallback behavior.

- Run folders (per §11):
  - `.flip/runs/<YYYYMMDD-HHMMSS-mmm>/`; helpers to read/write artifacts and discover latest run.

- Errors & determinism (per §3, §12, §13):
  - Standard exit codes; diagnostic JSON writer with `issues[]` structure; stable ordering for deterministic output.

### Testing & samples
- Unit tests for validation, overrides, layout policies, mapping of each node type.
- E2E: run `pipeline` on minimal example; verify ZIP structure and selected layer properties.
- Fixtures: minimal scaffold (per §4.5), table/form examples; sample theme.

### Delivery milestones
- M0: Repo bootstrap, CLI skeleton, `describe` command.
- M1: Schema + `ingest` with run folders and diagnostics.
- M2: Overrides engine + layout computation for Stack/Grid/Box/Text/Button/Field.
- M3: Export ZIP with Penpot mapping and theming; `export` command.
- M4: `pipeline` orchestration; E2E tests; acceptance criteria pass (per §14).


