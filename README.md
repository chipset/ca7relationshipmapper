# CA-7 Relationship Explorer

This project turns the `BATCHOUT` CA-7 spool extract into a small static dependency explorer.

## Files

- `build_relationships.py`: parses `BATCHOUT` and writes `relationships.json`
- `index.html`: browser UI
- `app.js`: expandable relationship tree
- `styles.css`: UI styling

## Run

1. Generate the JSON:

```bash
python3 build_relationships.py
```

2. Start a simple web server:

```bash
python3 -m http.server 8000
```

3. Open `http://localhost:8000`

## Viewer behavior

- Search for a job in the left panel.
- Click a job to make it the root of the viewer.
- Expand a job node to see its relationship groups.
- Click `Expand All` to open the full visible tree.
- Click any nested job pill to make that node the new root.
