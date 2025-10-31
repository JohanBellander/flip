import { describe, it, expect } from "vitest";
import { buildPenpotExportFilesManifest } from "../src/commands/export";

describe("buildPenpotExportFilesManifest", () => {
  it("produces a valid export-files manifest with provided files and relations", () => {
    const manifest = buildPenpotExportFilesManifest({
      files: [
        { id: "file-1", name: "My File", features: ["components/v2"] },
        { id: "file-2", name: "Lib", features: [] },
      ],
      relations: [["file-1", "file-2"]],
    });

    expect(manifest.type).toBe("penpot/export-files");
    expect(manifest.version).toBe(1);
    expect(typeof manifest.generatedBy).toBe("string");
    expect(manifest.refer).toBe("penpot");
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBe(2);
    expect(manifest.files[0]).toEqual({ id: "file-1", name: "My File", features: ["components/v2"] });
    expect(manifest.files[1]).toEqual({ id: "file-2", name: "Lib", features: [] });
    expect(Array.isArray(manifest.relations)).toBe(true);
    expect(manifest.relations).toEqual([["file-1", "file-2"]]);
  });
});


