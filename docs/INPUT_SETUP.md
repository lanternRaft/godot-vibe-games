# Input Setup

Input actions are defined in the `[input]` section of `project.godot`. Each action maps to one or more keyboard keys (or other input devices) via `InputEvent` resources. Built-in Godot actions (`ui_cancel`, `ui_accept`, `ui_left`, `ui_right`, `ui_up`, `ui_down`, etc.) are available for menu/pause navigation and do not need redefinition.

## Defining Input Actions

Each action entry is a dictionary with:

| Key        | Description                                    |
|------------|------------------------------------------------|
| `deadzone` | Dead zone for analog inputs (0.0-1.0). Use `0.5` for digital keys. |
| `events`   | Array of `InputEvent` objects (keyboard, mouse, joypad, etc.). |

### Keycode dictionaries (shorthand format)

```gdscript
{
"keycode": <int>,
"type": 0      # 0 = InputEventKey
}
```

- `keycode` uses the virtual (remappable) key constant. For an un-remapped system this is the same as `physical_keycode`.
- `type = 0` indicates `InputEventKey`.

### Full InputEventKey resource (verbose format)

```
Object(InputEventKey,
  "resource_local_to_scene":false,
  "resource_name":"",
  "device":-1,           # -1 means any device
  "window_id":0,
  "alt_pressed":false,
  "shift_pressed":false,
  "ctrl_pressed":false,
  "meta_pressed":false,
  "pressed":false,
  "keycode":0,           # virtual keycode (0 when physical_keycode is used)
  "physical_keycode":<int>,  # physical (non-remappable) keycode
  "key_label":0,
  "unicode":<int>,
  "location":0,
  "echo":false,
  "script":null
)
```

> **Note:** Godot's editor writes the verbose `Object()` form alongside the shorthand dict when saving via the Input Map UI. Both are valid and both register the same key.

## Common Action Patterns

Below are typical input actions used across projects. Adjust keys and action names per game.

| Action        | Typical Keys                          | Common Usage                       |
|---------------|---------------------------------------|------------------------------------|
| `move_right`  | `D`, Arrow Right                      | Move / strafe right                |
| `move_left`   | `A`, Arrow Left                       | Move / strafe left                 |
| `move_up`     | `W`, Arrow Up                         | Move forward / up                  |
| `move_down`   | `S`, Arrow Down                       | Move backward / down               |
| `jump`        | `Space`                               | Jump / confirm                     |
| `interact`    | `E`                                   | Pick up / activate                 |
| `pause`       | `Escape` (or use `ui_cancel`)         | Pause / unpause                    |
| `dash`        | `Shift`                               | Sprint / dash                      |
| `shoot`       | Left mouse button / `J`               | Primary attack                     |
| `reload`      | `R`                                   | Reload weapon                      |

### Keycode reference (Godot 4)

| Key             | Keycode     |
|-----------------|-------------|
| Arrow Up        | `4194320`   |
| Arrow Down      | `4194322`   |
| Arrow Left      | `4194319`   |
| Arrow Right     | `4194321`   |
| W               | `87`        |
| A               | `65`        |
| S               | `83`        |
| D               | `68`        |
| Space           | `32`        |
| Shift           | `4194305`   |
| Control         | `4194307`   |
| Alt             | `4194306`   |
| Escape          | `4194308`   |
| Enter           | `4194309`   |
| Tab             | `4194304`   |
| E               | `69`        |
| R               | `82`        |
| Q               | `81`        |
| F               | `70`        |
| Z               | `90`        |
| X               | `88`        |
| C               | `67`        |
| 1-9             | `49`-`57`   |
| Mouse Left      | `1` (type `7` = InputEventMouseButton) |
| Mouse Right     | `2` (type `7`)                          |
| Mouse Middle    | `3` (type `7`)                          |

## Consuming Input in GDScript

Wire input in `_unhandled_input(event: InputEvent)` on the main game controller. This runs after `_input` on all other nodes, so UI nodes can intercept events first if needed.

```gdscript
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("move_right"):
        direction = Vector2.RIGHT
    elif event.is_action_pressed("move_left"):
        direction = Vector2.LEFT
    elif event.is_action_pressed("move_up"):
        direction = Vector2.UP
    elif event.is_action_pressed("move_down"):
        direction = Vector2.DOWN
    elif event.is_action_pressed("jump"):
        try_jump()
    elif event.is_action_pressed("pause"):
        toggle_pause()
```

### Key patterns

- Use `is_action_pressed()` (not `is_action_just_pressed()`) in `_unhandled_input` — it fires once per press event automatically.
- Avoid scattering magic action strings across scripts. Define a `const` or enum so action names live in one place.

  ```gdscript
  const ACTION_JUMP: String = "jump"
  ```
- For continuous input (e.g., holding a key every frame), use `Input.is_action_pressed(action_name)` in `_process(delta)` or `_physics_process(delta)` instead of `_unhandled_input`.
- For axis-based input (e.g., analog stick or WASD as a single axis), use `Input.get_axis(negative_action, positive_action)` which returns `-1.0`, `0.0`, or `1.0`.

  ```gdscript
  var horizontal: float = Input.get_axis("move_left", "move_right")
  var vertical: float = Input.get_axis("move_up", "move_down")
  ```
- Use `InputMap.action_has_action(name)` to check if an action exists at runtime before querying it.

## InputEvent types reference

| `type` | Class                    |
|--------|--------------------------|
| `0`    | `InputEventKey`          |
| `7`    | `InputEventMouseButton`  |
| `8`    | `InputEventMouseMotion`  |
| `9`    | `InputEventJoypadButton` |
| `10`   | `InputEventJoypadMotion` |
| `14`   | `InputEventScreenTouch`  |
| `15`   | `InputEventScreenDrag`   |