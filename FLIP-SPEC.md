# FLIP — From LUMA Into Penpot
Specification v1.0 (TypeScript CLI)

---

## 0. Intent & Scope
FLIP is a deterministic, offline CLI that converts a structural UI "Scaffold JSON" (defined in this document) into a Penpot-compatible JSON-in-ZIP package containing one or more static artboards. It standardizes layout, hierarchy, and basic affordances before any visual implementation.

- Goals:
  - Validate a scaffold against a strict schema
  - Compute absolute frames for all nodes at chosen viewport(s)
  - Map nodes to a minimal Penpot JSON package (layers: group, rectangle, text)
  - Package JSON (and optional assets) into a ZIP Penpot can import
- Non-goals:
  - Interactive prototyping or transitions
  - Full visual design tokens (color systems, typography beyond basics)
  - Round-trip import from Penpot

## 1. Terminology
- Scaffold: A JSON file describing one screen’s structural UI tree per this spec.
- Viewport: Target screen size string "WxH" (e.g., "1280x800").
- Frame: Absolute rectangle `{ x, y, w, h }` in pixels.
- Focusable: Nodes that participate in tab order (Button, Field, or explicit `focusable: true`).
- Run Folder: Output directory for intermediate artifacts (e.g., `.flip/runs/<timestamp>/`).

## 2. Runtime and Tech
- Runtime: Node.js ≥ 18
- Language: TypeScript
- CLI style: `flip <command> <args>`
- Execution model: Pure file I/O, no network access; deterministic output for identical inputs.

## 3. CLI Overview and Exit Codes
Commands:
- `flip ingest` — Validate and normalize input scaffold
- `flip layout` — Compute frames per viewport
- `flip export` — Produce a Penpot JSON-in-ZIP package
- `flip pipeline` — Run ingest → layout → export in one go
- `flip describe` — Print supported schema and options (machine-readable)

Exit codes:
- `0` Success
- `2` Invalid input/schema
- `3` Blocking analysis/validation issue
- `4` Internal/file I/O error
- `5` Unsupported `schemaVersion`

## 4. Input Scaffold Schema (Normative)
FLIP accepts a single-screen scaffold JSON with the following structure. Unknown fields MUST be ignored.

### 4.1 Top-level
```json
{
  "schemaVersion": "1.0.0",
  "screen": {
    "id": "string",
    "title": "optional string",
    "root": { /* Node */ }
  },
  "settings": {
    "spacingScale": [4, 8, 12, 16, 24, 32],
    "minTouchTarget": { "w": 44, "h": 44 },
    "breakpoints": ["320x640", "768x1024"]
  }
}
```

### 4.2 Base Node Properties (apply to all nodes)
```json
{
  "id": "string",                    
  "type": "Stack|Grid|Box|Text|Button|Field|Form|Table",
  "visible": true,
  "widthPolicy": "hug|fill|fixed",
  "heightPolicy": "hug|fill|fixed",
  "minSize": { "w": 44, "h": 44 },
  "maxSize": { "w": 600, "h": 200 },
  "at": { ">=768": { /* overrides */ }, "<=320": { /* overrides */ } }
}
```

### 4.3 Specific Node Types
- Stack
```json
{
  "type": "Stack",
  "direction": "vertical|horizontal",
  "gap": 16,
  "padding": 24,
  "align": "start|center|end|stretch",
  "wrap": false,
  "children": [ /* Node[] */ ]
}
```
- Grid
```json
{
  "type": "Grid",
  "columns": 3,
  "gap": 16,
  "minColWidth": 150,
  "children": [ /* Node[] */ ]
}
```
- Box
```json
{
  "type": "Box",
  "padding": 16,
  "child": { /* Node */ }
}
```
- Text
```json
{
  "type": "Text",
  "text": "non-empty string",
  "fontSize": 16,
  "maxLines": 2,
  "intrinsicTextWidth": 200
}
```
- Button
```json
{
  "type": "Button",
  "text": "optional",
  "roleHint": "primary|secondary|danger|link",
  "focusable": true,
  "tabIndex": 0,
  "minSize": { "w": 44, "h": 44 }
}
```
- Field
```json
{
  "type": "Field",
  "label": "non-empty",
  "inputType": "text|email|password|number|date",
  "required": true,
  "helpText": "optional",
  "errorText": "optional",
  "focusable": true
}
```
- Form
```json
{
  "type": "Form",
  "title": "optional",
  "fields": [ /* Field nodes, len >= 1 */ ],
  "actions": [ /* Button nodes, len >= 1 */ ],
  "states": ["default", "error"]
}
```
- Table
```json
{
  "type": "Table",
  "title": "non-empty",
  "columns": ["Name", "Email"],
  "rows": 10,
  "responsive": { "strategy": "wrap|scroll|cards", "minColumnWidth": 160 },
  "states": ["default", "loading"]
}
```

### 4.4 Hard Validation Rules
- `schemaVersion === "1.0.0"`
- `screen.id` non-empty; `screen.root` is one allowed node object
- All node `id` values are unique within the screen
- Form: non-empty `fields[]`, `actions[]`, and `states[]` includes "default"
- Table: non-empty `title`, non-empty `columns[]` (string array), valid `responsive.strategy`
- All `gap`/`padding` values ∈ `settings.spacingScale`
- `settings.minTouchTarget` ≥ `{w:44,h:44}`
- `settings.breakpoints` list of "WxH" strings

### 4.5 Minimal Valid Scaffold Example
```json
{
  "schemaVersion": "1.0.0",
  "screen": {
    "id": "minimal-example",
    "title": "Minimal Example",
    "root": {
      "id": "root-stack",
      "type": "Stack",
      "direction": "vertical",
      "gap": 16,
      "padding": 24,
      "children": [
        { "id": "welcome-text", "type": "Text", "text": "Welcome to FLIP", "fontSize": 24 },
        { "id": "action-button", "type": "Button", "text": "Get Started", "roleHint": "primary", "minSize": { "w": 44, "h": 44 } }
      ]
    }
  },
  "settings": {
    "spacingScale": [4,8,12,16,24,32],
    "minTouchTarget": { "w": 44, "h": 44 },
    "breakpoints": ["320x640","768x1024","1280x800"]
  }
}
```

## 5. Responsive Overrides (Normative)
For viewport width `W`:
1. Apply all `>=X` where `X ≤ W` in ascending order (smallest first → largest last)
2. Apply all `<=Y` where `Y ≥ W` in descending order (largest first → smallest last)
3. Shallow-merge objects; arrays replace entirely

## 6. Layout Computation (Normative)
The layout pass produces absolute frames for all visible nodes per viewport.

### 6.1 Measurement
- Text width heuristic: `width = round(fontSize × 0.55 × charCount)`
- Text height: `ceil(lineCount × fontSize × 1.4)`; wrap when width insufficient
- `maxLines` limits height (no ellipsis rendering, just bounding)
- Button/Field size: enforce `minSize` and `settings.minTouchTarget` (max of both); if text implies larger, use larger

### 6.2 Containers
- Stack
  - Vertical: place children top→bottom inside (containerWidth - 2×padding), spacing via `gap`
  - Horizontal: left→right; if `wrap: true`, start new row when remaining width insufficient
  - `align` controls cross-axis (`start|center|end|stretch`)
- Grid
  - Effective columns:
    - If `minColWidth` present: `cols = max(1, min(configuredCols, floor(innerWidth / minColWidth)))`
    - Else `cols = configuredCols`
  - Flow children row-major; each cell width = `innerWidth / cols`
  - `gap` applies on both axes
- Box
  - Inner frame = parent frame minus `padding`

### 6.3 Policies
- `hug`: minimal to fit content in that axis
- `fill`: occupy container’s inner size in that axis
- `fixed`: respect given min/max; if none, treat as `hug`

### 6.4 Advisory Issues (Non-blocking)
- `overflow-x`
- `primary-below-fold` (primary button outside initial viewport)
- `spacing-off-scale`

## 7. Penpot JSON-in-ZIP Package (Interoperability Subset)
FLIP outputs a ZIP that contains a minimal Penpot-compatible JSON structure. All units are pixels; colors are hex.

### 7.1 ZIP Structure
```
/manifest.json
/document.json
/pages/page-1.json
/assets/            (optional; embedded images, fonts)
```

### 7.2 manifest.json
```json
{
  "format": "penpot-json",
  "formatVersion": 1,
  "generator": { "name": "FLIP", "version": "1.0.0" },
  "createdAt": "2025-10-31T12:00:00Z",
  "document": "document.json",
  "pages": ["pages/page-1.json"],
  "assets": []
}
```

### 7.3 document.json
```json
{
  "id": "doc_<uuid>",
  "name": "FLIP Export",
  "pages": [
    { "id": "page_1", "name": "Screen", "artboards": ["artboard_1"] }
  ],
  "styles": {
    "colors": {
      "primary": "#0B5FFF",
      "secondary": "#6B7280",
      "danger": "#DC2626",
      "text": "#111827",
      "muted": "#9CA3AF",
      "surface": "#FFFFFF",
      "fieldBorder": "#D1D5DB"
    },
    "typography": {
      "fontFamily": "Inter, Arial, sans-serif",
      "fontSize": 16,
      "lineHeight": 1.4
    },
    "radii": { "button": 6, "field": 4 }
  }
}
```

### 7.4 pages/page-1.json
```json
{
  "id": "page_1",
  "name": "Screen",
  "artboards": [
    {
      "id": "artboard_1",
      "name": "screen-1280x800",
      "frame": { "x": 0, "y": 0, "w": 1280, "h": 800 },
      "layers": [ /* back→front */ ]
    }
  ]
}
```

### 7.5 Layer Union (Minimal)
```json
{
  "id": "layer_<uuid>",
  "type": "group|rectangle|text",
  "name": "string",
  "visible": true,
  "frame": { "x": 0, "y": 0, "w": 100, "h": 32 },
  "children": [ /* for group only */ ],
  "fills": [{ "type": "solid", "color": "#FFFFFF" }],
  "strokes": [{ "color": "#D1D5DB", "weight": 1 }],
  "cornerRadius": 4,
  "text": {
    "value": "string",
    "fontFamily": "Inter, Arial, sans-serif",
    "fontSize": 16,
    "lineHeight": 1.4,
    "align": "left|center|right"
  }
}
```

Notes:
- Z-order equals document order; children render above parents.
- Only `group`, `rectangle`, and `text` are required. Additional types are extensions.

## 8. Node → Penpot Mapping (Normative)
All mappings use computed frames from the target viewport. Invisible nodes are omitted.

- Text → `text` layer
  - `text.value = node.text`, `fontSize = node.fontSize || styles.typography.fontSize`
  - Fill color = `styles.colors.text` (stroke none)

- Button → `group` containing:
  - `rectangle` (button body)
    - Fills by `roleHint`:
      - `primary`: `colors.primary`, text color `#FFFFFF`
      - `secondary`: `colors.surface` with stroke `colors.fieldBorder`, text `colors.primary`
      - `danger`: `colors.danger`, text `#FFFFFF`
      - `link`: optional rectangle with transparent fill and no stroke; text `colors.primary`
    - `cornerRadius = styles.radii.button`
  - `text` centered within the rectangle; horizontal padding = 12px for centering calculations

- Field → `group` containing:
  - Label `text` at `(x, y - 20)` with `fontSize: 14`; append " *" if `required`
  - Input `rectangle` with fill `colors.surface`, stroke `colors.fieldBorder`, radius `styles.radii.field`, height ≥ `max(settings.minTouchTarget.h, 40)`
  - Optional help `text` below input with `fontSize: 12–14`, fill `colors.muted`

- Form → `group` that wraps mapped `fields` then `actions` in document order

- Stack/Grid/Box → `group` with mapped children; no inherent fill/stroke

- Table → `group` containing:
  - Header row: `text` layers for `columns[]` positioned across the header area; optional bottom rule via stroke on a thin `rectangle`
  - Body rows: render `rows` if provided, otherwise 3 sample rows; each cell `text` placeholder; gridlines optional
  - Clamp to artboard height; content beyond may be omitted or truncated

## 9. CLI Commands (Normative)

### 9.1 `flip ingest`
Validate and normalize the scaffold.

- Args: `--input <file>`
- Behavior:
  - Parse JSON; validate schema per §4.4
  - On success: write normalized scaffold to `.flip/runs/<ts>/ingest.json`; exit `0`
  - On failure: write `.flip/runs/<ts>/ingest.json` with issues; exit `2`

### 9.2 `flip layout`
Compute frames for one or more viewports.

- Args: `--input <file> --viewports <WxH[,WxH,...]> [--out <dir>]`
- Behavior:
  - Apply responsive overrides per §5 for each viewport
  - Compute frames per §6
  - Write `layout_<WxH>.json` per viewport to run folder; exit `0` or `3` on blocking issues

### 9.3 `flip export`
Produce a Penpot JSON-in-ZIP package for a single viewport.

- Args: `--input <file> --viewport <WxH> --out <zip> [--theme <json>]`
- Behavior:
  - Use latest run folder’s `layout_<WxH>.json` if present; otherwise compute layout in-memory
  - Map nodes to Penpot layers per §8
  - Assemble package per §7 and write ZIP to `--out`; exit `0`, or `4` on I/O error

### 9.4 `flip pipeline`
Run ingest → layout → export.

- Args: `--input <file> --viewport <WxH> --out <zip> [--theme <json>]`
- Behavior: Executes §9.1, §9.2 (for the chosen viewport), then §9.3, using a single run folder

### 9.5 `flip describe`
Output machine-readable capabilities and schema.

- Args: `--format json|text` (default `json`)
- Includes: supported node types, required fields, default styles, layer types, exit codes

## 10. Theming & Configuration
Optional theme file to override defaults used during export.

```json
{
  "colors": {
    "primary": "#0B5FFF",
    "secondary": "#6B7280",
    "danger": "#DC2626",
    "text": "#111827",
    "muted": "#9CA3AF",
    "surface": "#FFFFFF",
    "fieldBorder": "#D1D5DB"
  },
  "typography": {
    "fontFamily": "Inter, Arial, sans-serif",
    "fontSize": 16,
    "lineHeight": 1.4
  },
  "radii": { "button": 6, "field": 4 }
}
```

Rules:
- Missing properties fall back to built-in defaults in §7.3
- Fonts should be generic or embedded via assets (optional)

## 11. Run Folders & Artifacts
FLIP writes artifacts into `.flip/runs/<timestamp>/` unless `--out` overrides.

Artifacts:
- `ingest.json` — Validation results and normalized scaffold
- `layout_<WxH>.json` — Per-viewport layout frames and advisory issues
- `export.zip` — Penpot package when `flip export` or `flip pipeline` runs

Timestamps follow `YYYYMMDD-HHMMSS-mmm` format. Each pipeline execution uses a single run folder.

## 12. Determinism, Performance, Security
- Deterministic: same input JSON + theme + viewport(s) ⇒ identical ZIP outputs
- Performance targets (non-normative): ingest < 100ms; layout/viewport < 200ms; export < 100ms on typical screens
- Offline: no network calls; file I/O only

## 13. Error Model & Diagnostics
Every failure writes a diagnostic JSON to the active run folder including:
- `issues[]` with fields: `id`, `severity` (`error|warn|info`), `message`, `jsonPointer?`, `nodeId?`, `viewport?`, `expected?`, `found?`
- Example error ids: `schema-missing-field`, `invalid-enum`, `spacing-off-scale`, `unreachable-node` (advisory), `overflow-x` (advisory)

CLI Behavior:
- Default: print concise summary to stderr, file path to artifact
- Exit with codes defined in §3

## 14. Acceptance Criteria
A build of FLIP is considered conformant when:
- Accepts and validates scaffolds per §4, rejecting invalid ones with exit code `2`
- Computes layout per §6 and emits frames that are stable across runs
- Produces ZIPs per §7 that Penpot can import (at least one page/artboard, visible layers rendered)
- Correctly maps node types per §8, including role-based button colors and field labeling
- Honors theme overrides per §10
- Writes artifacts and diagnostics as defined in §11 and §13

---

End of FLIP Specification v1.0


