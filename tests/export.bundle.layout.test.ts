import { describe, it, expect } from "vitest";
import { buildExportFilesBundleEntries } from "../src/commands/export";

describe("buildExportFilesBundleEntries", () => {
  it("emits manifest and files/<file-id>/pages/<page-id>/ structure", () => {
    const pageJson = { id: "page_1", name: "Screen", artboards: [] };
    const entries = buildExportFilesBundleEntries({ pageJson, fileId: "file-A", pageId: "page-B", fileName: "Demo" });

    const names = entries.map(e => e.name).sort();
    expect(names).toContain("manifest.json");
    expect(names).toContain("files/file-A.json");
    expect(names).toContain("files/file-A/pages/page-B.json");
    expect(names).toContain("files/file-A/pages/page-B/page-B.json");

    const manifestEntry = entries.find(e => e.name === "manifest.json")!;
    const manifest = JSON.parse(manifestEntry.content);
    expect(manifest.type).toBe("penpot/export-files");
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files[0].id).toBe("file-A");
  });
});


