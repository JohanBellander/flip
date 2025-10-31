import { ExitCode } from "../constants/exitCodes";
import { getLatestRunFolder, initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics } from "../utils/diagnostics";
import { promises as fs } from "fs";
import * as path from "path";
import { applyOverridesToTree } from "../overrides";
import { randomUUID } from "crypto";

export interface ExportOptions {
  input: string;
  viewport: string;
  out: string;
  theme?: string;
  penpotBundle?: boolean;
}

export async function runExport(options: ExportOptions): Promise<number> {
  if (!options.input || !options.viewport || !options.out) {
    const runDir = await initRunFolder();
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "invalid-args",
          severity: "error",
          message: "--input, --viewport, and --out are required",
        },
      ])
    );
    console.error(`--input, --viewport, and --out are required\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }
  const runDir = await initRunFolder();

  try {
    // Smoke-test behavior: if input file doesn't exist, just succeed after init
    try {
      await fs.stat(path.resolve(options.input));
    } catch {
      console.log("flip export: input not found, initialized run folder");
      return ExitCode.Success;
    }

    // Parse viewport
    const vpMatch = /^([0-9]+)x([0-9]+)$/.exec(options.viewport);
    if (!vpMatch) {
      const diagPath = await writeDiagnostics(
        runDir,
        "diagnostics.json",
        createDiagnostics([
          { id: "invalid-viewport", severity: "error", message: `Invalid viewport '${options.viewport}', expected WxH` },
        ])
      );
      console.error(`Invalid viewport. Diagnostics written: ${diagPath}`);
      return ExitCode.InvalidInput;
    }
    const viewportW = Number(vpMatch[1]);
    const viewportH = Number(vpMatch[2]);

    // Load scaffold JSON
    const scaffoldAbs = path.resolve(options.input);
    const scaffoldRaw = await fs.readFile(scaffoldAbs, "utf8");
    const scaffold = JSON.parse(scaffoldRaw);

    // Resolve theme (optional) merged with defaults from §7.3
    const defaultStyles = getDefaultStyles();
    const theme = await loadThemeOrDefault(options.theme, defaultStyles);

    // Obtain frames map for the viewport: prefer latest run folder artifact
    let frames: Record<string, Frame> | null = null;
    const latest = await getLatestRunFolder();
    const layoutFile = latest ? path.resolve(latest, `layout_${options.viewport}.json`) : null;
    if (layoutFile) {
      try {
        const lr = await fs.readFile(layoutFile, "utf8");
        const layoutPayload = JSON.parse(lr);
        if (layoutPayload && layoutPayload.frames && typeof layoutPayload.frames === "object") {
          frames = layoutPayload.frames as Record<string, Frame>;
        }
      } catch {}
    }

    // If not found, compute frames in-memory (subset of layout.ts compute)
    if (!frames) {
      const root = scaffold?.screen?.root;
      const settings = scaffold?.settings || {};
      const overriddenRoot = applyOverridesToTree(root, options.viewport);
      const computed = computeLayout(overriddenRoot, viewportW, viewportH, settings);
      frames = computed.frames;
    }

    // Map scaffold nodes to Penpot layers per §8
    const rootNode = scaffold?.screen?.root;
    const layers = mapToPenpotLayers(rootNode, frames!, theme);

    // Build Penpot JSON objects
    // Generate UUIDs required by Penpot for bundle identifiers
    const fileId = randomUUID();
    const pageId = randomUUID();
    const artboardId = randomUUID();

    const pageJson = buildPageJson({ pageId, artboardId, viewport: options.viewport, w: viewportW, h: viewportH, layers });

    // Prepare files for ZIP depending on target format
    const files: Array<{ name: string; content: string }> = options.penpotBundle
      ? buildExportFilesBundleEntries({ pageJson, fileId, pageId })
      : [
          { name: "manifest.json", content: JSON.stringify(buildManifest(), null, 2) },
          { name: "document.json", content: JSON.stringify(buildDocumentJson(theme), null, 2) },
          { name: `pages/${pageId}.json`, content: JSON.stringify(pageJson, null, 2) },
        ];

    // Ensure out dir exists
    const outAbs = path.resolve(options.out);
    await fs.mkdir(path.dirname(outAbs), { recursive: true });

    // Create ZIP (store only)
    const zipBuffer = createZip(files);
    await fs.writeFile(outAbs, zipBuffer);

    console.log(`Export OK. Wrote ZIP: ${outAbs}`);
  return ExitCode.Success;
  } catch (err) {
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        { id: "export-error", severity: "error", message: `Export failed: ${err instanceof Error ? err.message : String(err)}` },
      ])
    );
    console.error(`Export failed. Diagnostics written: ${diagPath}`);
    return ExitCode.InternalError;
  }
}


// ---- Types ----
type Frame = { x: number; y: number; w: number; h: number };

type PenpotColor = string; // hex

interface PenpotStyles {
  colors: {
    primary: PenpotColor;
    secondary: PenpotColor;
    danger: PenpotColor;
    text: PenpotColor;
    muted: PenpotColor;
    surface: PenpotColor;
    fieldBorder: PenpotColor;
  };
  typography: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
  };
  radii: { button: number; field: number };
}

interface ThemeLike extends PenpotStyles {}

// ---- Defaults per §7.3 ----
function getDefaultStyles(): PenpotStyles {
  return {
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
  };
}

async function loadThemeOrDefault(themePath: string | undefined, defaults: PenpotStyles): Promise<PenpotStyles> {
  if (!themePath) return defaults;
  try {
    const raw = await fs.readFile(path.resolve(themePath), "utf8");
    const themeJson = JSON.parse(raw);
    return mergeStyles(defaults, themeJson);
  } catch {
    return defaults;
  }
}

function mergeStyles(base: PenpotStyles, override: any): PenpotStyles {
  const out: any = { ...base };
  if (override && typeof override === "object") {
    if (override.colors && typeof override.colors === "object") {
      out.colors = { ...out.colors, ...override.colors };
    }
    if (override.typography && typeof override.typography === "object") {
      out.typography = { ...out.typography, ...override.typography };
    }
    if (override.radii && typeof override.radii === "object") {
      out.radii = { ...out.radii, ...override.radii };
    }
  }
  return out as PenpotStyles;
}

// ---- Minimal layout compute (subset from layout.ts §6) ----
function computeLayout(root: any, viewportW: number, viewportH: number, settings: any): { frames: Record<string, Frame> } {
  const frames: Record<string, Frame> = {};

  function clampSize(value: number, min?: number, max?: number): number {
    let v = value;
    if (typeof min === "number") v = Math.max(v, min);
    if (typeof max === "number") v = Math.min(v, max);
    return v;
  }

  function measureText(node: any, availableWidth: number | undefined): { w: number; h: number } {
    const text: string = typeof node?.text === "string" ? node.text : "";
    const fontSize: number = Number.isFinite(node?.fontSize) ? node.fontSize : 16;
    const oneLineWidth = Math.round(fontSize * 0.55 * text.length);
    if (!availableWidth || availableWidth <= 0) {
      return { w: oneLineWidth, h: Math.ceil(fontSize * 1.4) };
    }
    const lineWidth = Math.min(availableWidth, oneLineWidth);
    const lines = Math.max(1, Math.ceil(oneLineWidth / Math.max(1, availableWidth)));
    return { w: lineWidth, h: Math.ceil(lines * fontSize * 1.4) };
  }

  function measureButton(node: any, availableWidth: number | undefined): { w: number; h: number } {
    const textNode = { text: node?.text ?? "", fontSize: Number.isFinite(node?.fontSize) ? node.fontSize : 16 };
    const textSize = measureText(textNode, availableWidth ? Math.max(0, availableWidth - 24) : undefined);
    const minTouch = settings?.minTouchTarget || { w: 44, h: 44 };
    const minSize = node?.minSize || {};
    const w = clampSize(textSize.w + 24, Math.max(minTouch.w, minSize.w || 0), minSize.w ? undefined : undefined);
    const h = clampSize(Math.ceil((textNode.fontSize || 16) * 1.4) + 16, Math.max(minTouch.h, minSize.h || 0), minSize.h ? undefined : undefined);
    return { w, h };
  }

  function measureField(node: any, availableWidth: number | undefined): { w: number; h: number } {
    const minTouch = settings?.minTouchTarget || { w: 44, h: 44 };
    const minSize = node?.minSize || {};
    const minHeight = Math.max(40, minTouch.h, minSize.h || 0);
    const baseWidth = 200;
    const w = clampSize(availableWidth ? availableWidth : baseWidth, Math.max(minTouch.w, minSize.w || 0), minSize.w ? undefined : undefined);
    const h = minHeight;
    return { w, h };
  }

  function parsePolicies(node: any): { widthPolicy: string; heightPolicy: string } {
    const wp = typeof node?.widthPolicy === "string" ? node.widthPolicy : "hug";
    const hp = typeof node?.heightPolicy === "string" ? node.heightPolicy : "hug";
    return { widthPolicy: wp, heightPolicy: hp };
  }

  function layoutNode(node: any, x: number, y: number, availW: number, availH: number): Frame {
    const type = node?.type;
    const id = node?.id || `${type}-${Math.random().toString(36).slice(2)}`;
    if (node && !node.id) {
      node.id = id; // ensure stable ids so frames[] matches mapToPenpotLayers
    }
    const { widthPolicy, heightPolicy } = parsePolicies(node);
    const minSize = node?.minSize || {};
    const maxSize = node?.maxSize || {};

    function applyPolicies(measured: { w: number; h: number }, containerW: number, containerH: number): { w: number; h: number } {
      let w = measured.w;
      let h = measured.h;
      if (widthPolicy === "fill") w = containerW;
      if (heightPolicy === "fill") h = containerH;
      w = clampSize(w, minSize.w, maxSize.w);
      h = clampSize(h, minSize.h, maxSize.h);
      return { w, h };
    }

    if (type === "Text") {
      const measured = measureText(node, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }
    if (type === "Button") {
      const measured = measureButton(node, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }
    if (type === "Field") {
      const measured = measureField(node, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }

    if (type === "Box") {
      const padding = Number.isFinite(node?.padding) ? node.padding : 0;
      const innerW = Math.max(0, availW - padding * 2);
      const innerH = Math.max(0, availH - padding * 2);
      const child = node?.child;
      let childFrame: Frame = { x: x + padding, y: y + padding, w: 0, h: 0 };
      if (child && typeof child === "object") {
        childFrame = layoutNode(child, x + padding, y + padding, innerW, innerH);
      }
      const measured = { w: childFrame.w + padding * 2, h: childFrame.h + padding * 2 };
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }

    if (type === "Stack") {
      const direction = node?.direction === "horizontal" ? "horizontal" : "vertical";
      const gap = Number.isFinite(node?.gap) ? node.gap : 0;
      const padding = Number.isFinite(node?.padding) ? node.padding : 0;
      const align: "start" | "center" | "end" | "stretch" = (node?.align === "center" || node?.align === "end" || node?.align === "stretch") ? node.align : "start";
      const children: any[] = Array.isArray(node?.children) ? node.children : [];

      const innerW = Math.max(0, availW - padding * 2);
      const innerH = Math.max(0, availH - padding * 2);

      if (direction === "vertical") {
        let cursorY = y + padding;
        let maxChildW = 0;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childFrame = layoutNode(child, x + padding, cursorY, innerW, innerH);
          let childX = x + padding;
          if (align === "center") childX = x + padding + Math.max(0, (innerW - childFrame.w) / 2);
          else if (align === "end") childX = x + padding + Math.max(0, innerW - childFrame.w);
          frames[child.id || ""] = { x: Math.round(childX), y: Math.round(cursorY), w: childFrame.w, h: childFrame.h };
          cursorY += childFrame.h + (i < children.length - 1 ? gap : 0);
          maxChildW = Math.max(maxChildW, childFrame.w);
        }
        const measured = { w: Math.max(maxChildW + padding * 2, 0), h: Math.max(cursorY - y + padding - (children.length > 0 ? 0 : padding), padding * 2) };
        const size = applyPolicies(measured, availW, availH);
        const frame = { x, y, w: size.w, h: size.h };
        frames[id] = frame;
        return frame;
      } else {
        let cursorX = x + padding;
        let rowH = 0;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childFrame = layoutNode(child, cursorX, y + padding, innerW - (cursorX - (x + padding)), innerH);
          let childY = y + padding;
          if (align === "center") childY = y + padding + Math.max(0, (innerH - childFrame.h) / 2);
          else if (align === "end") childY = y + padding + Math.max(0, innerH - childFrame.h);
          frames[child.id || ""] = { x: Math.round(cursorX), y: Math.round(childY), w: childFrame.w, h: childFrame.h };
          cursorX += childFrame.w + (i < children.length - 1 ? gap : 0);
          rowH = Math.max(rowH, childFrame.h);
        }
        const measured = { w: Math.max(cursorX - x + padding - (children.length > 0 ? 0 : padding), padding * 2), h: Math.max(rowH + padding * 2, 0) };
        const size = applyPolicies(measured, availW, availH);
        const frame = { x, y, w: size.w, h: size.h };
        frames[id] = frame;
        return frame;
      }
    }

    if (type === "Grid") {
      const columns = Number.isFinite(node?.columns) ? node.columns : 1;
      const gap = Number.isFinite(node?.gap) ? node.gap : 0;
      const minColWidth = Number.isFinite(node?.minColWidth) ? node.minColWidth : undefined;
      const padding = Number.isFinite(node?.padding) ? node.padding : 0;
      const children: any[] = Array.isArray(node?.children) ? node.children : [];

      const innerW = Math.max(0, availW - padding * 2);
      let effCols = columns;
      if (typeof minColWidth === "number" && minColWidth > 0) {
        effCols = Math.max(1, Math.min(columns, Math.floor(innerW / minColWidth)));
      }
      effCols = Math.max(1, effCols);
      const totalGapW = gap * Math.max(0, effCols - 1);
      const cellW = effCols > 0 ? Math.floor((innerW - totalGapW) / effCols) : innerW;

      let xCursor = 0;
      let yCursor = 0;
      let rowMaxH = 0;
      let colIndex = 0;
      children.forEach((child, idx) => {
        if (colIndex >= effCols) {
          colIndex = 0;
        }
        if (colIndex === 0 && idx !== 0) {
          yCursor += rowMaxH + gap;
          xCursor = 0;
          rowMaxH = 0;
        }
        const childX = x + padding + xCursor;
        const childY = y + padding + yCursor;
        const childFrame = layoutNode(child, childX, childY, cellW, Number.POSITIVE_INFINITY);
        frames[child.id || ""] = { x: childX, y: childY, w: Math.min(childFrame.w, cellW), h: childFrame.h };
        rowMaxH = Math.max(rowMaxH, childFrame.h);
        xCursor += cellW + gap;
        colIndex += 1;
      });

      const totalH = yCursor + rowMaxH + padding * 2;
      const measured = { w: Math.max(innerW + padding * 2, 0), h: Math.max(totalH, padding * 2) };
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }

    const fallback = { x, y, w: 0, h: 0 };
    frames[id] = fallback;
    return fallback;
  }

  // Root occupies the viewport
  if (root) {
    layoutNode(root, 0, 0, viewportW, viewportH);
  }
  return { frames };
}

// ---- Mapping to Penpot layers (§8) ----
type Layer = any;

function genId(): string {
  return randomUUID();
}

function mapToPenpotLayers(root: any, frames: Record<string, Frame>, styles: PenpotStyles): Layer[] {
  if (!root || typeof root !== "object") return [];

  function textLayer(name: string, frame: Frame, value: string, fontSize?: number, align?: "left" | "center" | "right"): Layer {
    return {
      id: genId(),
      type: "text",
      name,
      visible: true,
      frame,
      fills: [{ type: "solid", color: styles.colors.text }],
      text: {
        value,
        fontFamily: styles.typography.fontFamily,
        fontSize: fontSize ?? styles.typography.fontSize,
        lineHeight: styles.typography.lineHeight,
        align: align ?? "left",
      },
    };
  }

  function rectangleLayer(name: string, frame: Frame, fill: PenpotColor, stroke?: { color: PenpotColor; weight: number }, cornerRadius?: number): Layer {
    const layer: any = {
      id: genId(),
      type: "rect",
      name,
      visible: true,
      frame,
      fills: [{ type: "solid", color: fill }],
    };
    if (stroke) layer.strokes = [stroke];
    if (typeof cornerRadius === "number") layer.cornerRadius = cornerRadius;
    return layer;
  }

  function groupLayer(name: string, frame: Frame, children: Layer[]): Layer {
    return {
      id: genId(),
      type: "group",
      name,
      visible: true,
      frame,
      children,
    };
  }

  function measureTextApprox(value: string, fontSize: number, maxWidth?: number): { w: number; h: number } {
    const oneLineWidth = Math.round(fontSize * 0.55 * (value?.length ?? 0));
    const lineHeight = Math.ceil(fontSize * styles.typography.lineHeight);
    if (!maxWidth || maxWidth <= 0) return { w: oneLineWidth, h: lineHeight };
    const lines = Math.max(1, Math.ceil(oneLineWidth / Math.max(1, maxWidth)));
    const width = Math.min(maxWidth, oneLineWidth);
    return { w: width, h: lines * lineHeight };
  }

  function mapNode(node: any): Layer[] {
    const type = node?.type;
    const id = node?.id;
    const name = String(node?.name || type || "node");
    const frame = (id && frames[id]) ? frames[id] : { x: 0, y: 0, w: 0, h: 0 };

    if (type === "Text") {
      const value = String(node?.text ?? "");
      return [textLayer(name, frame, value, Number.isFinite(node?.fontSize) ? node.fontSize : undefined)];
    }

    if (type === "Button") {
      const role = String(node?.roleHint || "secondary");
      const bodyFill = role === "primary" ? styles.colors.primary : role === "danger" ? styles.colors.danger : styles.colors.surface;
      const textColor = role === "primary" || role === "danger" ? "#FFFFFF" : styles.colors.primary;
      const stroke = role === "secondary" ? { color: styles.colors.fieldBorder, weight: 1 } : undefined;
      const body = rectangleLayer(`${name}/body`, frame, bodyFill, stroke, styles.radii.button);
      const label = String(node?.text ?? "Button");
      const fontSize = Number.isFinite(node?.fontSize) ? node.fontSize : styles.typography.fontSize;
      const paddingH = 12;
      const textSize = measureTextApprox(label, fontSize, Math.max(0, frame.w - paddingH * 2));
      const textX = frame.x + Math.max(0, Math.floor((frame.w - textSize.w) / 2));
      const textY = frame.y + Math.max(0, Math.floor((frame.h - textSize.h) / 2));
      const text = textLayer(`${name}/label`, { x: textX, y: textY, w: textSize.w, h: textSize.h }, label, fontSize, "center");
      // Override fill for button text
      (text as any).fills = [{ type: "solid", color: textColor }];
      return [groupLayer(name, frame, [body, text])];
    }

    if (type === "Field") {
      const labelText = String(node?.label ?? "Label");
      const helpText = typeof node?.help === "string" ? node.help : undefined;
      const required: boolean = Boolean(node?.required);
      const label = textLayer(`${name}/label`, { x: frame.x, y: frame.y - 20, w: frame.w, h: 16 }, `${labelText}${required ? " *" : ""}`, 14);
      const input = rectangleLayer(`${name}/input`, frame, styles.colors.surface, { color: styles.colors.fieldBorder, weight: 1 }, styles.radii.field);
      const children: Layer[] = [label, input];
      if (helpText && helpText.trim().length > 0) {
        const help = textLayer(`${name}/help`, { x: frame.x, y: frame.y + frame.h + 4, w: frame.w, h: 16 }, helpText, 12);
        (help as any).fills = [{ type: "solid", color: styles.colors.muted }];
        children.push(help);
      }
      return [groupLayer(name, frame, children)];
    }

    if (type === "Form") {
      const fields = Array.isArray(node?.fields) ? node.fields : [];
      const actions = Array.isArray(node?.actions) ? node.actions : [];
      const childrenLayers: Layer[] = [];
      fields.forEach((child: any) => childrenLayers.push(...mapNode(child)));
      actions.forEach((child: any) => childrenLayers.push(...mapNode(child)));
      return [groupLayer(name, frame, childrenLayers)];
    }

    if (type === "Stack" || type === "Grid" || type === "Box") {
      const children = Array.isArray(node?.children) ? node.children : (node?.child ? [node.child] : []);
      const childLayers: Layer[] = [];
      children.forEach((child: any) => childLayers.push(...mapNode(child)));
      return [groupLayer(name, frame, childLayers)];
    }

    if (type === "Table") {
      const columns: string[] = Array.isArray(node?.columns) ? node.columns : [];
      const headerH = 32;
      const bodyY = frame.y + headerH + 8;
      const colW = columns.length > 0 ? Math.floor(frame.w / columns.length) : frame.w;
      const children: Layer[] = [];
      // Header texts
      columns.forEach((col, i) => {
        const hx = frame.x + i * colW + 8;
        const hy = frame.y + 8;
        children.push(textLayer(`${name}/th/${i}`, { x: hx, y: hy, w: Math.max(0, colW - 16), h: 16 }, String(col), 14));
      });
      // Optional bottom rule under header
      children.push(rectangleLayer(`${name}/header-rule`, { x: frame.x, y: frame.y + headerH, w: frame.w, h: 1 }, styles.colors.surface, { color: styles.colors.fieldBorder, weight: 1 }));
      // Body rows: use provided rows or default to 3 sample rows, and clamp to the table frame height
      const requestedRows = Number.isFinite((node as any)?.rows) ? Math.max(0, Number((node as any).rows)) : 3;
      const rowH = 24; // text height ~16 with vertical padding
      const rowGap = 8;
      const availableBodyHeight = Math.max(0, frame.h - headerH - rowGap);
      const rowsThatFit = requestedRows > 0 ? Math.max(0, Math.floor((availableBodyHeight + rowGap) / (rowH + rowGap))) : 0;
      const rowsToRender = Math.min(requestedRows, rowsThatFit);

      for (let r = 0; r < rowsToRender; r++) {
        const cy = bodyY + r * (rowH + rowGap);
        for (let i = 0; i < Math.max(1, columns.length); i++) {
          const cx = frame.x + i * colW + 8;
          children.push(textLayer(`${name}/td/${r}/${i}`, { x: cx, y: cy, w: Math.max(0, colW - 16), h: 16 }, "–", 12));
        }
      }
      return [groupLayer(name, frame, children)];
    }

    // Unknown -> empty group placeholder
    return [groupLayer(name, frame, [])];
  }

  return mapNode(root);
}

// ---- Build Penpot files (§7) ----
function buildManifest(): any {
  return {
    format: "penpot-json",
    formatVersion: 1,
    generator: { name: "FLIP", version: "1.0.0" },
    createdAt: new Date().toISOString(),
    document: "document.json",
    pages: ["pages/page-1.json"],
    assets: [],
  };
}

// Penpot official export bundle manifest ("type": "penpot/export-files")
export function buildPenpotExportFilesManifest(args: {
  files: Array<{ id: string; name: string; features?: string[] }>;
  relations?: Array<[string, string]>;
}): any {
  const { files, relations } = args;
  return {
    type: "penpot/export-files",
    version: 1,
    generatedBy: "FLIP/1.0.0",
    refer: "penpot",
    files: files.map(f => ({ id: f.id, name: f.name, features: f.features ?? [] })),
    relations: relations ?? [],
  };
}

// Build entries for a Penpot export-files bundle layout
// Creates:
// - manifest.json (type: penpot/export-files)
// - files/<file-id>.json (file metadata)
// - files/<file-id>/pages/<page-id>.json (page metadata)
// - files/<file-id>/pages/<page-id>/<page-id>.json (page content)
export function buildExportFilesBundleEntries(args: {
  pageJson: any;
  fileId?: string;
  pageId?: string;
  fileName?: string;
}): Array<{ name: string; content: string }> {
  const fileId = args.fileId ?? randomUUID();
  const pageId = args.pageId ?? randomUUID();
  const fileName = args.fileName ?? "FLIP Export";

  const manifest = buildPenpotExportFilesManifest({
    files: [{ id: fileId, name: fileName }],
  });

  // Build page root frame JSON (00000000-...)
  const artboardIds: string[] = Array.isArray(args.pageJson?.artboards)
    ? args.pageJson.artboards.map((a: any) => String(a?.id)).filter(Boolean)
    : ["artboard_1"];
  
  // File metadata (mirror Penpot structure; avoid unsupported keys like 'version')
  const nowIso = new Date().toISOString();
  const fileMeta: any = {
    id: fileId,
    name: fileName,
    version: 1,
    revn: 1,
    vern: 0,
    features: [],
    "created-at": nowIso,
    "modified-at": nowIso,
    "is-shared": false,
    "has-media-trimmed": false,
    options: { "components-v2": true, "base-font-size": "16px" },
    data: {
      pages: [pageId],
      "pages-index": {
        [pageId]: {
          id: pageId,
          name: "Screen",
          index: 0,
          objects: {},
        },
      },
    },
  };

  const pageMeta = {
    id: pageId,
    name: "Screen",
    artboards: artboardIds,
  };
  const rootFrame = buildPageRootFrameJson({ pageId, shapes: artboardIds });

  const entries: Array<{ name: string; content: string }> = [
    { name: "manifest.json", content: JSON.stringify(manifest, null, 2) },
    { name: `files/${fileId}.json`, content: JSON.stringify(fileMeta, null, 2) },
    { name: `files/${fileId}/pages/${pageId}.json`, content: JSON.stringify(pageMeta, null, 2) },
    { name: `files/${fileId}/pages/${pageId}/00000000-0000-0000-0000-000000000000.json`, content: JSON.stringify(rootFrame, null, 2) },
    { name: `files/${fileId}/pages/${pageId}/${pageId}.json`, content: JSON.stringify(args.pageJson, null, 2) },
  ];

  // Generate minimal Penpot shape JSON files from pageJson layers
  // This flattens artboard -> layers (and nested groups) into per-shape files with parent links
  try {
    const page: any = args.pageJson || {};
    const artboards: any[] = Array.isArray(page.artboards) ? page.artboards : [];

    const shapeFiles: Array<{ id: string; parentId: string | null; json: any }> = [];

    function toPenpotFills(layerFills: any): any[] {
      const fills: any[] = Array.isArray(layerFills) ? layerFills : [];
      const out: any[] = [];
      fills.forEach((f: any) => {
        const t = String(f?.type || "");
        if (t === "solid" && typeof f?.color === "string") {
          out.push({ fillColor: f.color, fillOpacity: 1 });
        }
      });
      return out;
    }

    function emitShape(id: string, parentId: string | null, layer: any, frameFallback?: any) {
      const frame = layer?.frame || frameFallback || { x: 0, y: 0, w: 0, h: 0 };
      const base: any = {
        id,
        name: String(layer?.name || layer?.type || "shape"),
        type: String(layer?.type || "group"),
        x: frame.x || 0,
        y: frame.y || 0,
        width: frame.w || 0,
        height: frame.h || 0,
        rotation: 0,
        selrect: { x: frame.x || 0, y: frame.y || 0, width: frame.w || 0, height: frame.h || 0, x1: frame.x || 0, y1: frame.y || 0, x2: (frame.x || 0) + (frame.w || 0), y2: (frame.y || 0) + (frame.h || 0) },
        points: [
          { x: frame.x || 0, y: frame.y || 0 },
          { x: (frame.x || 0) + (frame.w || 0), y: frame.y || 0 },
          { x: (frame.x || 0) + (frame.w || 0), y: (frame.y || 0) + (frame.h || 0) },
          { x: frame.x || 0, y: (frame.y || 0) + (frame.h || 0) },
        ],
        transform: { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 },
        transformInverse: { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 },
        parentId: parentId,
        frameId: parentId,
        flipX: null,
        flipY: null,
        strokes: [],
        fills: toPenpotFills(layer?.fills),
        pageId: pageId,
      };

      if (base.type === "artboard" && (!Array.isArray(base.fills) || base.fills.length === 0)) {
        base.fills = [{ fillColor: "#FFFFFF", fillOpacity: 1 }];
      }

      if (layer?.type === "text" && layer?.text) {
        base.content = {
          type: "root",
          children: [
            {
              type: "paragraph-set",
              children: [
                {
                  type: "paragraph",
                  children: [
                    {
                      fontFamily: layer.text.fontFamily,
                      fontSize: String(layer.text.fontSize),
                      fontWeight: "400",
                      lineHeight: String(layer.text.lineHeight),
                      text: String(layer.text.value ?? ""),
                      fills: Array.isArray(base.fills) && base.fills.length > 0 ? base.fills : [{ fillColor: "#111827", fillOpacity: 1 }],
                    },
                  ],
                },
              ],
            },
          ],
          fills: [],
        };
      }

      // Recurse for groups and collect child ids
      const children: any[] = Array.isArray(layer?.children) ? layer.children : [];
      const childIds: string[] = [];
      children.forEach((child) => {
        const childId = String(child?.id || genId());
        childIds.push(childId);
        emitShape(childId, id, child);
      });
      if (childIds.length > 0) base.shapes = childIds;

      shapeFiles.push({ id, parentId, json: base });
    }

    artboards.forEach((art) => {
      const artId = String(art?.id || genId());
      // Emit an artboard container as a shape so children can parent to it
      emitShape(artId, null, { ...art, type: "artboard" }, art?.frame || { x: 0, y: 0, w: (art?.frame?.w ?? 0), h: (art?.frame?.h ?? 0) });
      const layers: any[] = Array.isArray(art?.layers) ? art.layers : [];
      layers.forEach((layer) => {
        const id = String(layer?.id || genId());
        emitShape(id, artId, layer);
      });
    });

    // Append one file per shape
    shapeFiles.forEach((s) => {
      entries.push({
        name: `files/${fileId}/pages/${pageId}/${s.id}.json`,
        content: JSON.stringify(s.json, null, 2),
      });
    });
  } catch {}

  return entries;
}

function buildDocumentJson(styles: PenpotStyles): any {
  return {
    id: `doc_${randomUUID()}`,
    name: "FLIP Export",
    pages: [{ id: "page_1", name: "Screen", artboards: ["artboard_1"] }],
    styles,
  };
}

function buildPageJson(args: { pageId: string; artboardId: string; viewport: string; w: number; h: number; layers: Layer[] }): any {
  return {
    id: args.pageId,
    name: "Screen",
    artboards: [
      {
        id: args.artboardId,
        name: `screen-${args.viewport}`,
        frame: { x: 0, y: 0, w: args.w, h: args.h },
        layers: args.layers,
      },
    ],
  };
}

// Build the Penpot page root frame JSON with fixed zero UUID and shape refs
function buildPageRootFrameJson(args: { pageId: string; shapes: string[] }): any {
  const zero = "00000000-0000-0000-0000-000000000000";
  return {
    id: zero,
    name: "Root Frame",
    type: "frame",
    x: 0,
    y: 0,
    width: 0.01,
    height: 0.01,
    rotation: 0,
    selrect: { x: 0, y: 0, width: 0.01, height: 0.01, x1: 0, y1: 0, x2: 0.01, y2: 0.01 },
    points: [
      { x: 0.0, y: 0.0 },
      { x: 0.01, y: 0.0 },
      { x: 0.01, y: 0.01 },
      { x: 0.0, y: 0.01 },
    ],
    transform: { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 },
    transformInverse: { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 },
    parentId: zero,
    frameId: zero,
    flipX: null,
    flipY: null,
    hideFillOnExport: false,
    r2: 0,
    proportionLock: false,
    pageId: args.pageId,
    r3: 0,
    r1: 0,
    strokes: [],
    proportion: 1.0,
    r4: 0,
    fills: [{ fillColor: "#FFFFFF", fillOpacity: 1 }],
    shapes: Array.isArray(args.shapes) ? args.shapes : [],
  };
}

// ---- Minimal ZIP (store) ----
function crc32(buf: Buffer): number {
  let table = crc32Table;
  if (!table) table = buildCrc32Table();
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

let crc32Table: number[] | null = null;
function buildCrc32Table(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crc32Table = table;
  return table;
}

function createZip(entries: Array<{ name: string; content: string }>): Buffer {
  interface CDEntry { name: string; crc: number; compSize: number; uncompSize: number; offset: number; }
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const dataBuf = Buffer.from(e.content, "utf8");
    const crc = crc32(dataBuf);
    const compSize = dataBuf.length; // store only
    const uncompSize = dataBuf.length;

    // Local file header
    const lf = Buffer.alloc(30);
    lf.writeUInt32LE(0x04034b50, 0); // signature
    lf.writeUInt16LE(20, 4); // version needed
    lf.writeUInt16LE(0, 6); // flags
    lf.writeUInt16LE(0, 8); // compression (0 = store)
    lf.writeUInt16LE(0, 10); // mod time
    lf.writeUInt16LE(0, 12); // mod date
    lf.writeUInt32LE(crc >>> 0, 14); // crc32
    lf.writeUInt32LE(compSize, 18); // comp size
    lf.writeUInt32LE(uncompSize, 22); // uncomp size
    lf.writeUInt16LE(nameBuf.length, 26); // name length
    lf.writeUInt16LE(0, 28); // extra length

    localParts.push(lf, nameBuf, dataBuf);

    // Central directory header
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // compression
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(crc >>> 0, 16); // crc32
    cd.writeUInt32LE(compSize, 20); // comp size
    cd.writeUInt32LE(uncompSize, 24); // uncomp size
    cd.writeUInt16LE(nameBuf.length, 28); // name length
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // relative offset of local header

    cdParts.push(cd, nameBuf);

    offset += lf.length + nameBuf.length + dataBuf.length;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(cdParts);

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  const fileCount = entries.length;
  eocd.writeUInt16LE(fileCount, 8); // # entries on this disk
  eocd.writeUInt16LE(fileCount, 10); // total # entries
  eocd.writeUInt32LE(centralData.length, 12); // size of central dir
  eocd.writeUInt32LE(localData.length, 16); // offset of central dir (immediately after locals)
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localData, centralData, eocd]);
}

