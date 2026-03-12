# CA-7 Relationship Explorer

This project turns a CA-7 spool extract into a dependency explorer with a drill-down flow diagram and an expandable relationship tree. It now includes a VS Code extension version of the viewer, while the original static browser files remain in the repo.
This is an EARLY version, submit bug reports in the Github repo.

## Files

- `build_relationships.py`: optional offline parser for `BATCHOUT`
- `index.html`: original browser UI and upload entry point
- `app.js`: original in-browser parser, drill-down flow diagram, and expandable relationship tree
- `styles.css`: original browser UI styling
- `extension.js`: VS Code extension entry point
- `package.json`: VS Code extension manifest
- `media/app.js`: webview app used by the extension
- `media/styles.css`: webview styling used by the extension

## VS Code Extension

1. Open this folder in VS Code.
2. Pick a CA-7 spool file such as `BATCHOUT`, or run the command while that file is active in the editor or explorer.

The extension opens the viewer in a webview panel and loads the selected file directly from the workspace or filesystem.

## Static Browser Version
### Available from the github site

1. Start a simple web server:

```bash
python3 -m http.server 8000
```

2. Open `http://localhost:8000`

3. Upload a CA-7 text file such as `BATCHOUT`

## Viewer behavior

- Upload a file from the left panel.
- Search for a job in the left panel.
- Click a job to make it the root of the viewer.
- Use the flow diagram to inspect upstream and downstream jobs visually.
- Click any node in the flow diagram to re-center the diagram on that node.
- Use `Back` to return to the previous drill-down step.
- Continuation pages without a job header are attached to the previous job automatically.
- Use the skipped-pages panel to inspect any pages the parser still could not attach.
- Expand a job node to see its relationship groups.
- Click `Expand All` to open the full visible tree.
- Click any nested job pill to make that node the new root.
