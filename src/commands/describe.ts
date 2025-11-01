import { ExitCode } from "../constants/exitCodes";

export interface DescribeOptions {
  format?: "json" | "text";
}

type NodeType =
  | "Stack"
  | "Grid"
  | "Box"
  | "Text"
  | "Button"
  | "Field"
  | "Form"
  | "Table";

const nodeTypes: NodeType[] = [
  "Stack",
  "Grid",
  "Box",
  "Text",
  "Button",
  "Field",
  "Form",
  "Table",
];

const baseNodeRequiredFields = ["id", "type"] as const;

const specificNodeRequiredFields: Record<NodeType, string[]> = {
  Stack: ["direction", "children"],
  Grid: ["columns", "children"],
  Box: ["padding", "child"],
  Text: ["text"],
  Button: [],
  Field: ["label", "inputType"],
  Form: ["fields", "actions", "states"],
  Table: ["title", "columns", "responsive"],
};

const defaultStyles = {
  colors: {
    primary: "#0B5FFF",
    secondary: "#6B7280",
    danger: "#DC2626",
    text: "#111827",
    muted: "#9CA3AF",
    surface: "#FFFFFF",
    fieldBorder: "#D1D5DB",
  },
  typography: {
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 16,
    lineHeight: 1.4,
  },
  radii: { button: 6, field: 4 },
} as const;

const layerTypes = ["group", "rect", "text", "frame"] as const;

const exitCodes = {
  0: "Success",
  2: "Invalid input/schema",
  3: "Blocking analysis/validation issue",
  4: "Internal/file I/O error",
  5: "Unsupported schemaVersion",
} as const;

function renderTextDescribe(): string {
  const lines: string[] = [];
  lines.push("FLIP capabilities (v1.0)");
  lines.push("");
  lines.push(`Node types: ${nodeTypes.join(", ")}`);
  lines.push(
    `Required fields — base: ${baseNodeRequiredFields.join(", ")}; specifics: ` +
      nodeTypes
        .map((t) => `${t}{${specificNodeRequiredFields[t].join("|") || "-"}}`)
        .join(", ")
  );
  lines.push(`Layer types: ${Array.from(layerTypes).join(", ")}`);
  lines.push(
    `Exit codes: ` +
      Object.entries(exitCodes)
        .map(([code, desc]) => `${code}=${desc}`)
        .join(", ")
  );
  lines.push("Default styles:");
  lines.push(`  colors: ${Object.keys(defaultStyles.colors).join(", ")}`);
  lines.push(
    `  typography: fontFamily='${defaultStyles.typography.fontFamily}', fontSize=${defaultStyles.typography.fontSize}, lineHeight=${defaultStyles.typography.lineHeight}`
  );
  lines.push(`  radii: button=${defaultStyles.radii.button}, field=${defaultStyles.radii.field}`);
  return lines.join("\n");
}

export async function runDescribe(options: DescribeOptions): Promise<number> {
  const format = options.format || "json";
  if (format === "json") {
    const payload = {
      commands: ["ingest", "layout", "export", "pipeline", "describe"],
      nodeTypes,
      required: {
        baseNode: Array.from(baseNodeRequiredFields),
        specific: specificNodeRequiredFields,
      },
      layerTypes: Array.from(layerTypes),
      defaultStyles,
      exitCodes,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(renderTextDescribe());
  }
  return ExitCode.Success;
}


