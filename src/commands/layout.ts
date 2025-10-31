export interface LayoutOptions {
  input: string;
  viewports: string;
  out?: string;
}

export async function runLayout(_opts: LayoutOptions): Promise<number> {
  // Not implemented yet
  return 0;
}

import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics, DiagnosticIssue } from "../utils/diagnostics";
import { applyOverridesToTree } from "../overrides";
import { promises as fs } from "fs";
import * as path from "path";

export interface LayoutOptions {
  input: string;
  viewports: string;
  out?: string;
}

export async function runLayout(options: LayoutOptions): Promise<number> {
  if (!options.input || !options.viewports) {
    const runDir = await initRunFolder();
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "invalid-args",
          severity: "error",
          message: "--input and --viewports are required",
        },
      ])
    );
    console.error(`--input and --viewports are required\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }

  const outDir = await initRunFolder(options.out);

  // Load scaffold JSON
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(options.input), "utf8");
  } catch (err) {
    const diagPath = await writeDiagnostics(
      outDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "file-read-error",
          severity: "error",
          message: `Failed to read input: ${options.input}`,
        },
      ])
    );
    console.error(`Failed to read input: ${options.input}\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }

  let scaffold: any;
  try {
    scaffold = JSON.parse(raw);
  } catch {
    const diagPath = await writeDiagnostics(
      outDir,
      "diagnostics.json",
      createDiagnostics([
        { id: "invalid-json", severity: "error", message: "Input is not valid JSON" },
      ])
    );
    console.error(`Invalid JSON. Diagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }

  // Minimal presence checks per §4.4 (layout returns blocking on missing required sections)
  const issues: DiagnosticIssue[] = [];
  const screen = scaffold?.screen;
  const settings = scaffold?.settings;
  if (!screen || typeof screen !== "object") {
    issues.push({ id: "schema-missing-field", severity: "error", message: "screen must be an object", jsonPointer: "/screen" });
  }
  const root = screen?.root;
  if (!root) {
    issues.push({ id: "schema-missing-field", severity: "error", message: "screen.root is required", jsonPointer: "/screen/root" });
  }
  if (!settings || typeof settings !== "object") {
    issues.push({ id: "schema-missing-field", severity: "error", message: "settings must be an object", jsonPointer: "/settings" });
  }
  if (issues.length > 0) {
    const diagPath = await writeDiagnostics(outDir, "diagnostics.json", createDiagnostics(issues));
    console.error(`Layout blocked due to invalid input. Diagnostics written: ${diagPath}`);
    return ExitCode.BlockingIssue;
  }

  // Parse viewports list
  const viewportList = options.viewports.split(",").map((s) => s.trim()).filter(Boolean);
  const anyBlocking: DiagnosticIssue[] = [];

  for (const vp of viewportList) {
    const m = /^([0-9]+)x([0-9]+)$/.exec(vp);
    if (!m) {
      anyBlocking.push({ id: "invalid-viewport", severity: "error", message: `Invalid viewport '${vp}', expected WxH` });
      continue;
    }
    const vw = Number(m[1]);
    const vh = Number(m[2]);

    // Apply responsive overrides per §5
    const overriddenRoot = applyOverridesToTree(root, vp);

    // Compute frames per §6
    const { frames, advisory } = computeLayout(overriddenRoot, vw, vh, settings);

    // Write artifact
    const payload = {
      viewport: vp,
      frames,
      issues: advisory,
    };
    const target = path.resolve(outDir, `layout_${vp}.json`);
    await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf8");
  }

  if (anyBlocking.length > 0) {
    const diagPath = await writeDiagnostics(outDir, "diagnostics.json", createDiagnostics(anyBlocking));
    console.error(`Layout encountered blocking issues. Diagnostics written: ${diagPath}`);
    return ExitCode.BlockingIssue;
  }

  return ExitCode.Success;
}

// ---- Layout engine (§6) ----

type Frame = { x: number; y: number; w: number; h: number };

function clampSize(value: number, min?: number, max?: number): number {
  let v = value;
  if (typeof min === "number") v = Math.max(v, min);
  if (typeof max === "number") v = Math.min(v, max);
  return v;
}

function parsePolicies(node: any): { widthPolicy: string; heightPolicy: string } {
  const wp = typeof node?.widthPolicy === "string" ? node.widthPolicy : "hug";
  const hp = typeof node?.heightPolicy === "string" ? node.heightPolicy : "hug";
  return { widthPolicy: wp, heightPolicy: hp };
}

function measureText(node: any, availableWidth: number | undefined): { w: number; h: number } {
  const text: string = typeof node?.text === "string" ? node.text : "";
  const fontSize: number = Number.isFinite(node?.fontSize) ? node.fontSize : 16;
  const maxLines: number | undefined = Number.isFinite(node?.maxLines) ? node.maxLines : undefined;
  const oneLineWidth = Math.round(fontSize * 0.55 * text.length);
  if (!availableWidth || availableWidth <= 0) {
    return { w: oneLineWidth, h: Math.ceil(fontSize * 1.4) };
  }
  const lineWidth = Math.min(availableWidth, oneLineWidth);
  const lines = Math.max(1, Math.ceil(oneLineWidth / Math.max(1, availableWidth)));
  const effectiveLines = maxLines ? Math.min(maxLines, lines) : lines;
  return { w: lineWidth, h: Math.ceil(effectiveLines * fontSize * 1.4) };
}

function measureButton(node: any, settings: any, availableWidth: number | undefined): { w: number; h: number } {
  const textNode = { text: node?.text ?? "", fontSize: Number.isFinite(node?.fontSize) ? node.fontSize : 16 };
  const textSize = measureText(textNode, availableWidth ? Math.max(0, availableWidth - 24) : undefined);
  const minTouch = settings?.minTouchTarget || { w: 44, h: 44 };
  const minSize = node?.minSize || {};
  const w = clampSize(textSize.w + 24, Math.max(minTouch.w, minSize.w || 0), minSize.w ? undefined : undefined);
  const h = clampSize(Math.ceil((textNode.fontSize || 16) * 1.4) + 16, Math.max(minTouch.h, minSize.h || 0), minSize.h ? undefined : undefined);
  return { w, h };
}

function measureField(node: any, settings: any, availableWidth: number | undefined): { w: number; h: number } {
  const minTouch = settings?.minTouchTarget || { w: 44, h: 44 };
  const minSize = node?.minSize || {};
  const minHeight = Math.max(40, minTouch.h, minSize.h || 0);
  const baseWidth = 200;
  const w = clampSize(availableWidth ? availableWidth : baseWidth, Math.max(minTouch.w, minSize.w || 0), minSize.w ? undefined : undefined);
  const h = minHeight;
  return { w, h };
}

function computeLayout(root: any, viewportW: number, viewportH: number, settings: any): { frames: Record<string, Frame>; advisory: DiagnosticIssue[] } {
  const frames: Record<string, Frame> = {};
  const advisory: DiagnosticIssue[] = [];

  function layoutNode(node: any, x: number, y: number, availW: number, availH: number): Frame {
    const type = node?.type;
    const id = node?.id || `${type}-${Math.random().toString(36).slice(2)}`;
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

    // Leaf defaults
    if (type === "Text") {
      const measured = measureText(node, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }
    if (type === "Button") {
      const measured = measureButton(node, settings, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }
    if (type === "Field") {
      const measured = measureField(node, settings, availW);
      const size = applyPolicies(measured, availW, availH);
      const frame = { x, y, w: size.w, h: size.h };
      frames[id] = frame;
      return frame;
    }

    if (type === "Box") {
      const padding = Number.isFinite(node?.padding) ? node.padding : 0;
      // Child gets inner area
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
          // Child width policy
          const childAvailW = innerW;
          const childFrame = layoutNode(child, x + padding, cursorY, childAvailW, innerH);
          // Align horizontally
          let childX = x + padding;
          if (align === "center") childX = x + padding + Math.max(0, (innerW - childFrame.w) / 2);
          else if (align === "end") childX = x + padding + Math.max(0, innerW - childFrame.w);
          else if (align === "stretch") {
            // Relayout child as stretched to innerW
            const stretched = layoutNode(child, x + padding, cursorY, innerW, innerH);
            frames[child.id || ""] = stretched;
            childFrame.w = stretched.w;
            childFrame.h = stretched.h;
            childX = x + padding;
          }
          // Update stored frame with aligned x
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
        // horizontal
        let cursorX = x + padding;
        let rowH = 0;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childFrame = layoutNode(child, cursorX, y + padding, innerW - (cursorX - (x + padding)), innerH);
          // Align vertically
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
          // move to next row
          yCursor += rowMaxH + gap;
          xCursor = 0;
          rowMaxH = 0;
        }
        const childX = x + padding + xCursor;
        const childY = y + padding + yCursor;
        const childFrame = layoutNode(child, childX, childY, cellW, Number.POSITIVE_INFINITY);
        // clamp width to cell
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

    // Fallback for unknown: zero-size frame
    const fallback = { x, y, w: 0, h: 0 };
    frames[id] = fallback;
    return fallback;
  }

  // Root occupies the viewport
  layoutNode(root, 0, 0, viewportW, viewportH);
  // Advisory collection placeholder (can be extended to compute overflow-x etc.)
  return { frames, advisory };
}


