# Figma Database Table

As many software developers needs to develop and plan databases, this plugin was created to help all others on creating Database UML Diagrams using the FigJam widgets.

## AI / Figma Console MCP integration

This fork exposes every table through `sharedPluginData` (namespace `erd`) and adds a **Sync dari AI** action that applies changes written by other plugins. See [MCP_INTEGRATION.md](MCP_INTEGRATION.md) for the JSON format and `figma_execute` examples.

### Development

```bash
yarn install
npm run build   # widget (dist/code.js) + editor UIs (dist/*.html)
```

Import `manifest.json` in Figma Desktop via Widgets › Development › Import widget from manifest. The manifest must carry this fork's own widget `id`; widgets inserted from a manifest without an `id` fail with "Could not find widget code to run" and have to be deleted and re-inserted.
