import { describe, it, expect } from "vitest";
import { buildExportFilesBundleEntries, buildPenpotExportFilesManifest } from "../src/commands/export";
import { readFileSync } from "fs";
import * as path from "path";

describe(".penpot bundle schema validation against ExamplePenPot skeleton", () => {
  it("matches manifest core fields and emits required file layout and shape schema", () => {
    const exampleManifestPath = path.resolve(__dirname, "../ExamplePenPot/manifest.json");
    const exampleManifest = JSON.parse(readFileSync(exampleManifestPath, "utf8"));

    const ourManifest = buildPenpotExportFilesManifest({
      files: [{ id: "file-A", name: "Demo" }],
      relations: [["file-A", "file-A"]],
    });

    expect(ourManifest.type).toBe(exampleManifest.type);
    expect(ourManifest.version).toBe(exampleManifest.version);
    expect(ourManifest.refer).toBe(exampleManifest.refer);
    expect(Array.isArray(ourManifest.files)).toBe(true);

    // Build a minimal page with one text layer so shapes are emitted
    const pageJson = {
      id: "page_1",
      name: "Screen",
      artboards: [
        {
          id: "artboard_1",
          name: "screen-1280x800",
          frame: { x: 0, y: 0, w: 1280, h: 800 },
          layers: [
            {
              id: "layer_text_1",
              type: "text",
              name: "Title",
              frame: { x: 24, y: 24, w: 400, h: 28 },
              text: { value: "Hello", fontFamily: "Inter", fontSize: 20, lineHeight: 1.4 },
              fills: [{ type: "solid", color: "#111827" }],
            },
          ],
        },
      ],
    };

    const entries = buildExportFilesBundleEntries({ pageJson, fileId: "file-A", pageId: "page-1", fileName: "Demo" });
    const names = entries.map(e => e.name);

    // Required core files
    expect(names).toContain("manifest.json");
    expect(names).toContain("files/file-A.json");
    expect(names).toContain("files/file-A/pages/page-1.json");
    expect(names).toContain("files/file-A/pages/page-1/00000000-0000-0000-0000-000000000000.json");

    // There should be at least one shape json besides the root and page meta
    const shapeEntries = entries.filter(e => /files\/file-A\/pages\/page-1\/.+\.json$/.test(e.name) && !e.name.endsWith("page-1.json") && !e.name.endsWith("00000000-0000-0000-0000-000000000000.json"));
    expect(shapeEntries.length).toBeGreaterThan(0);

    // Validate a shape JSON has the expected Penpot fields observed in Example bundles
    const sampleShape = JSON.parse(shapeEntries[0].content);
    const requiredKeys = [
      "id",
      "name",
      "type",
      "x",
      "y",
      "width",
      "height",
      "selrect",
      "points",
      "transform",
      "transformInverse",
      "pageId",
    ];
    requiredKeys.forEach(k => expect(Object.prototype.hasOwnProperty.call(sampleShape, k)).toBe(true));

    // Root frame JSON must include shapes array referencing child shape ids
    const rootEntry = entries.find(e => e.name === "files/file-A/pages/page-1/00000000-0000-0000-0000-000000000000.json")!;
    const rootJson = JSON.parse(rootEntry.content);
    expect(rootJson.type).toBe("frame");
    expect(Array.isArray(rootJson.shapes)).toBe(true);
  });
});


