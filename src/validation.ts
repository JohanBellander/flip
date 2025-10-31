import { DiagnosticIssue } from "./utils/diagnostics";

type NodeType =
  | "Stack"
  | "Grid"
  | "Box"
  | "Text"
  | "Button"
  | "Field"
  | "Form"
  | "Table";

interface ValidationResult {
  issues: DiagnosticIssue[];
  normalized: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushError(issues: DiagnosticIssue[], id: string, message: string, jsonPointer?: string, expected?: unknown, found?: unknown): void {
  issues.push({ id, severity: "error", message, jsonPointer, expected, found });
}

function validViewportString(s: unknown): boolean {
  return typeof s === "string" && /^\d+x\d+$/.test(s);
}

function isAllowedNodeType(t: unknown): t is NodeType {
  return (
    t === "Stack" ||
    t === "Grid" ||
    t === "Box" ||
    t === "Text" ||
    t === "Button" ||
    t === "Field" ||
    t === "Form" ||
    t === "Table"
  );
}

function collectNodeIds(node: any, ids: Set<string>, issues: DiagnosticIssue[], ptr: string, spacingScale: number[]): void {
  if (!isRecord(node)) {
    pushError(issues, "schema-missing-field", "Node must be an object", ptr);
    return;
  }

  const id = node.id;
  const type = node.type;
  if (typeof id !== "string" || id.trim().length === 0) {
    pushError(issues, "schema-missing-field", "Node.id must be non-empty string", `${ptr}/id`);
  } else if (ids.has(id)) {
    pushError(issues, "duplicate-node-id", `Duplicate node id: ${id}`, `${ptr}/id`);
  } else {
    ids.add(id);
  }

  if (!isAllowedNodeType(type)) {
    pushError(issues, "invalid-enum", `Unsupported node type: ${String(type)}`, `${ptr}/type`, [
      "Stack",
      "Grid",
      "Box",
      "Text",
      "Button",
      "Field",
      "Form",
      "Table",
    ], type);
    return;
  }

  // gap/padding must be in spacingScale (when present on specific node types)
  const inScale = (v: unknown): boolean => typeof v === "number" && spacingScale.includes(v);
  const checkScale = (key: "gap" | "padding"): void => {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      if (!inScale((node as any)[key])) {
        pushError(
          issues,
          "spacing-off-scale",
          `${key} must be one of settings.spacingScale`,
          `${ptr}/${key}`,
          spacingScale,
          (node as any)[key]
        );
      }
    }
  };

  switch (type) {
    case "Stack": {
      checkScale("gap");
      checkScale("padding");
      const children = (node as any).children;
      if (Array.isArray(children)) {
        children.forEach((child, idx) => collectNodeIds(child, ids, issues, `${ptr}/children/${idx}`, spacingScale));
      }
      break;
    }
    case "Grid": {
      checkScale("gap");
      const children = (node as any).children;
      if (Array.isArray(children)) {
        children.forEach((child, idx) => collectNodeIds(child, ids, issues, `${ptr}/children/${idx}`, spacingScale));
      }
      break;
    }
    case "Box": {
      checkScale("padding");
      if ((node as any).child) {
        collectNodeIds((node as any).child, ids, issues, `${ptr}/child`, spacingScale);
      }
      break;
    }
    case "Form": {
      const fields = (node as any).fields;
      const actions = (node as any).actions;
      const states = (node as any).states;
      if (!Array.isArray(fields) || fields.length === 0) {
        pushError(issues, "schema-missing-field", "Form.fields must be a non-empty array", `${ptr}/fields`);
      } else {
        fields.forEach((child, idx) => collectNodeIds(child, ids, issues, `${ptr}/fields/${idx}`, spacingScale));
      }
      if (!Array.isArray(actions) || actions.length === 0) {
        pushError(issues, "schema-missing-field", "Form.actions must be a non-empty array", `${ptr}/actions`);
      } else {
        actions.forEach((child, idx) => collectNodeIds(child, ids, issues, `${ptr}/actions/${idx}`, spacingScale));
      }
      if (!Array.isArray(states) || !states.includes("default")) {
        pushError(issues, "schema-missing-field", 'Form.states must include "default"', `${ptr}/states`);
      }
      break;
    }
    case "Table": {
      const title = (node as any).title;
      const columns = (node as any).columns;
      const responsive = (node as any).responsive;
      if (typeof title !== "string" || title.trim().length === 0) {
        pushError(issues, "schema-missing-field", "Table.title must be non-empty", `${ptr}/title`);
      }
      if (!Array.isArray(columns) || columns.length === 0 || !columns.every((c: unknown) => typeof c === "string")) {
        pushError(issues, "schema-missing-field", "Table.columns must be a non-empty string array", `${ptr}/columns`);
      }
      const validStrategies = ["wrap", "scroll", "cards"];
      if (!isRecord(responsive) || !validStrategies.includes(String((responsive as any).strategy))) {
        pushError(
          issues,
          "invalid-enum",
          "Table.responsive.strategy must be one of wrap|scroll|cards",
          `${ptr}/responsive/strategy`,
          validStrategies,
          isRecord(responsive) ? (responsive as any).strategy : responsive
        );
      }
      break;
    }
    default: {
      // Text, Button, Field: no structural recursion
      break;
    }
  }
}

export function validateScaffoldStrict(input: unknown): ValidationResult {
  const issues: DiagnosticIssue[] = [];

  if (!isRecord(input)) {
    pushError(issues, "schema-missing-field", "Top-level must be an object", "");
    return { issues, normalized: input };
  }

  // schemaVersion must be 1.0.0
  const schemaVersion = input.schemaVersion;
  if (schemaVersion !== "1.0.0") {
    pushError(issues, "unsupported-schema-version", 'schemaVersion must be "1.0.0"', "/schemaVersion", "1.0.0", schemaVersion);
  }

  // screen checks
  const screen = input.screen;
  if (!isRecord(screen)) {
    pushError(issues, "schema-missing-field", "screen must be an object", "/screen");
  } else {
    const sid = screen.id;
    if (typeof sid !== "string" || sid.trim().length === 0) {
      pushError(issues, "schema-missing-field", "screen.id must be non-empty string", "/screen/id");
    }
  }

  // settings checks
  const settings = input.settings;
  let spacingScale: number[] = [];
  if (!isRecord(settings)) {
    pushError(issues, "schema-missing-field", "settings must be an object", "/settings");
  } else {
    const scale = (settings as any).spacingScale;
    if (!Array.isArray(scale) || scale.length === 0 || !scale.every((n: unknown) => typeof n === "number")) {
      pushError(issues, "schema-missing-field", "settings.spacingScale must be a non-empty number array", "/settings/spacingScale");
    } else {
      spacingScale = scale as number[];
    }
    const mtt = (settings as any).minTouchTarget;
    if (!isRecord(mtt) || typeof (mtt as any).w !== "number" || typeof (mtt as any).h !== "number") {
      pushError(issues, "schema-missing-field", "settings.minTouchTarget must include numeric w and h", "/settings/minTouchTarget");
    } else {
      const w = (mtt as any).w;
      const h = (mtt as any).h;
      if (w < 44 || h < 44) {
        pushError(issues, "min-touch-target-too-small", "settings.minTouchTarget must be at least 44x44", "/settings/minTouchTarget", { w: 44, h: 44 }, { w, h });
      }
    }
    const bps = (settings as any).breakpoints;
    if (!Array.isArray(bps) || !bps.every((s: unknown) => validViewportString(s))) {
      pushError(issues, "invalid-breakpoints", "settings.breakpoints must be list of 'WxH' strings", "/settings/breakpoints");
    }
  }

  // root node
  const root = isRecord(screen) ? (screen as any).root : undefined;
  if (!root) {
    pushError(issues, "schema-missing-field", "screen.root is required", "/screen/root");
  }

  // Node validation & id uniqueness
  if (root) {
    const ids = new Set<string>();
    collectNodeIds(root, ids, issues, "/screen/root", spacingScale);
  }

  // Normalization: pass-through for now; further normalization can be added later
  const normalized = input;

  return { issues, normalized };
}


