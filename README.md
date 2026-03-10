# CA-7 Relationship Explorer

This project turns an uploaded CA-7 spool extract into a static dependency explorer with a drill-down flow diagram and an expandable relationship tree.

## Files

- `build_relationships.py`: optional offline parser for `BATCHOUT`
- `index.html`: browser UI and upload entry point
- `app.js`: in-browser parser, drill-down flow diagram, and expandable relationship tree
- `styles.css`: UI styling

## Run

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
- Expand a job node to see its relationship groups.
- Click `Expand All` to open the full visible tree.
- Click any nested job pill to make that node the new root.
