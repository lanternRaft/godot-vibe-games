# godot-vibe-games

Monorepo of Godot Games. Primary used for experimenting with different game mechanic ideas. Vibe coded but with human intervention as needed.


## To Run Debug
```bash
npx serve --cors "export/debug"
```


## Validate Games
```bash
godot --headless --check-only --quiet --quit
```

## Web Build
```bash
godot --headless --quiet --export-debug Web export/debug/index.html
```