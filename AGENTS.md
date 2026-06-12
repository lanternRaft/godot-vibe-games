Expert Godot 4 developer. Write clean, strongly typed GDScript following official style guide.

---

## Code Standards

### Script Structure
- **Maximum 200 lines per script.** Refactor into components if approaching this limit.
- **Single Responsibility:** One concern per script (e.g., `BlockGrabbing`, `TowerStability`).
- **Functions under 20 lines.** Break complex logic into private helpers.
- **Maximum 3 levels of nesting.** Use early returns and guard clauses.
- **Prefer composition:** Child nodes with focused scripts over monolithic controllers.

### GDScript Rules
- Always use explicit static types for variables and function returns.
- Use `##` descriptions above:
  - Exported variables
  - Public variables/functions
  - Complex internal logic
- Extract repeated logic into private helper functions immediately.
- Use signals for decoupling over direct node references.
- Default to @export for anything likely to be tweaked during playtesting.

### After Editing
Run `godot --exit` to confirm parsing before proceeding to next task.

### After Finishing
Run `godot --headless --export-debug "Web" export/debug/index.html`
---

## File Organization

- One class per file, filename matches class/script name.
- Group related scripts in logical directories (e.g., `blocks/`, `ui/`, `physics/`).

---

## Workflow

### Before Planning Features
1. Read relevant docs in `docs/` folder (the Game Design Document)
2. Use the `game-design-doc` skill for consistency checks and design validation

### Key Documentation
- `docs/README.md` - Entry point, folder structure
- `docs/game-design-core.md` - Design pillars, MDA framework
- `docs/mechanics/*.md` - Core gameplay systems
- `docs/systems/*.md` - Technical architecture
- `docs/content/*.md` - Specific content definitions

### Implementation Checklist
- [ ] Read relevant docs before starting
- [ ] Use `game-design-doc` skill for planning
- [ ] Update doc status ("Stub" → "Draft" → "Authoritative")
- [ ] Flag any code/doc discrepancies to user
- [ ] Cross-link related documents

---

## Testing

- Use GDUnit4 for all tests.
- Use the `gdunit4-test` skill when working on tests.
- Run tests after modifying test files.

---

## Communication Style

- No conversational filler or praise.
- Provide information without editorializing.
- Start responses immediately with the requested information.
- Show only relevant code changes, not entire files unless requested.
- Ask brief clarifications on ambiguous questions rather than guessing.

---

## Git

Disable terminal pager for long output:
- Use `git --no-pager <command>`, or
- Set `GIT_PAGER=cat` or `TERM=dumb`
