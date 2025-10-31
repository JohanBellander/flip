# FLIP Examples

This folder contains example scaffolds and theme files for quick testing.

- minimal.json: Smallest valid scaffold per section 4.5
- table.json: A table example with columns and responsive settings
- form.json: A simple form with fields and actions
- themes/light.json and themes/dark.json: Sample themes per section 10

Usage with the CLI (once implemented):

```bash
flip ingest --input examples/minimal.json
flip layout --input examples/minimal.json --viewports 1280x800
flip export --input examples/minimal.json --viewport 1280x800 --out export.zip --theme examples/themes/light.json
```

Note: Current implementation may not yet support all commands.
