# Figma Community listing: Database Table + AI Bridge

Copy-paste material for the Figma publish dialog. Assets live next to this file:

| Asset | File | Size |
|---|---|---|
| Icon | `icon.png` | 128×128 |
| Cover / thumbnail | `cover.png` | 1920×960 |

To regenerate either asset, edit `cover.html` / `icon.html` (shared styles in `widget.css`) and render with headless Chromium:

```bash
chromium --headless --hide-scrollbars --virtual-time-budget=8000 --window-size=1920,960 --screenshot=$PWD/publish/cover.png file://$PWD/publish/cover.html
```

## Name

Database Table + AI Bridge

## Tagline

ERD tables for FigJam that AI agents can read and update via Figma Console MCP.

## Description

Plan your database right on the FigJam board, and let an AI agent work on the same diagram.

**Database tables**
• Table name, header color and five widths
• Columns with type, nullable flag and key type: primary, foreign, unique, index
• Multi-column (composite) indexes
• Visual table editor, index editor and raw JSON editor

**AI bridge**
Every table mirrors its data as versioned JSON in shared plugin data (namespace "erd"), so other plugins, including Figma Console MCP through figma_execute, can read the whole schema: columns, keys, indexes and foreign-key relations (column "references").

An AI agent writes changes to the "erd/inbox" key. Select the table and choose "Sync dari AI" in the widget's property menu. The first table in the inbox updates the selected widget, and every additional table is created as a new widget next to it. Inbox JSON is fully validated before anything changes, and the result is reported back in "erd/status".

The JSON format and ready-to-use figma_execute snippets are documented in MCP_INTEGRATION.md in the repository.

**Credits**
Fork of "Database Table" by PillFall, licensed GPL-3.0-or-later.
Source code: https://github.com/dalhaqq/Figma-Database-Table

## Tags

database, erd, schema, sql, table, diagram, ai, mcp

## Category

Development (or the closest engineering / diagramming category offered)

## Support contact

https://github.com/dalhaqq/Figma-Database-Table/issues

## Data security disclosure (draft answers)

The questions differ slightly between form versions. Use these facts to answer them:

- **Data sent to the developer or third parties:** none. The widget has no backend and makes no requests with user content.
- **Network access:** only the editor windows load static assets: fonts from `fonts.googleapis.com` / `fonts.gstatic.com`, and the Monaco code editor from `unpkg.com` (raw JSON editor). These requests contain no file or user data. The manifest restricts network access to exactly these domains.
- **Data storage:** table data is stored only inside the Figma file, in the widget's synced state and in shared plugin data (namespace `erd`).
- **Access by other plugins:** shared plugin data under `erd` is intentionally readable and writable by other plugins in the same file. This is how the AI/MCP integration works, and it is described in the listing.
- **Authentication, payments, tracking, analytics:** none.
- **Data collected about users:** none.
