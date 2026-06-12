extends Node2D
class_name Snake

## Manages the snake entity: segments, movement, direction, growth, and self-collision.

## Grid constants (local copies to avoid circular dependency on GameManager).
const GRID_W: int = 20
const GRID_H: int = 20
const CELL_SZ: int = 32

var _segments: Array[Vector2i] = []
var _direction: Vector2i = Vector2i.RIGHT
var _direction_queue: Array[Vector2i] = []
var _grow_pending: int = 0
var _is_dead: bool = false
var _grid_to_pixel: Callable
var _cell_size: int = CELL_SZ

## Stores a reference to the game manager and resets the snake to its starting state.
func initialize(grid_to_pixel_cb: Callable, cell_size: int) -> void:
	_grid_to_pixel = grid_to_pixel_cb
	_cell_size = cell_size
	reset()

## Resets the snake to starting position (center, length 3, moving right).
func reset() -> void:
	var center_x: float = float(GRID_W) / 2.0
	var center_y: float = float(GRID_H) / 2.0
	_segments = [
		Vector2i(int(center_x), int(center_y)),
		Vector2i(int(center_x) - 1, int(center_y)),
		Vector2i(int(center_x) - 2, int(center_y)),
	]
	_direction = Vector2i.RIGHT
	_direction_queue.clear()
	_grow_pending = 0
	_is_dead = false
	queue_redraw()

## Queues a direction change for the next tick. Ignores 180-degree reversals.
func queue_direction(new_dir: Vector2i) -> void:
	if _direction_queue.is_empty():
		if _direction + new_dir == Vector2i.ZERO:
			return
		_direction_queue.append(new_dir)
	else:
		if _direction_queue.back() + new_dir == Vector2i.ZERO:
			return
		_direction_queue.append(new_dir)

## Moves the snake one tick forward. Returns true if the snake ate food at food_pos.
func move(food_pos: Vector2i) -> bool:
	if _is_dead:
		return false

	# Process one queued direction per tick
	if not _direction_queue.is_empty():
		_direction = _direction_queue.front()
		_direction_queue.pop_front()

	var head: Vector2i = _segments[0]
	var new_head: Vector2i = head + _direction

	# Wrap around grid edges
	new_head.x = wrapi(new_head.x, 0, GRID_W)
	new_head.y = wrapi(new_head.y, 0, GRID_H)

	# Check self-collision (skip last segment — it will move away unless growing)
	var limit: int = _segments.size() - 1
	for i: int in range(limit):
		if new_head == _segments[i]:
			_is_dead = true
			queue_redraw()
			return false

	# Advance the snake
	_segments.push_front(new_head)

	var ate: bool = (new_head == food_pos)
	if ate:
		_grow_pending += 1

	if _grow_pending > 0:
		_grow_pending -= 1
	else:
		_segments.pop_back()

	queue_redraw()
	return ate

## Returns a copy of the current segment positions.
func get_segments() -> Array[Vector2i]:
	return _segments.duplicate()

## Returns true if the snake has collided with itself and is dead.
func is_dead() -> bool:
	return _is_dead

func _draw() -> void:
	if _segments.is_empty() or _grid_to_pixel.is_null():
		return

	var head_color: Color = Color(0x00, 0xff / 255.0, 0x88 / 255.0)
	var body_color: Color = Color(0x00, 0xcc / 255.0, 0x66 / 255.0)
	var tail_color: Color = Color(0x00, 0x99 / 255.0, 0x44 / 255.0)

	for i: int in range(_segments.size()):
		var pos: Vector2 = _grid_to_pixel.call(_segments[i])
		var size: float = _cell_size * 0.85

		var color: Color
		if i == 0:
			color = head_color
		elif i == _segments.size() - 1:
			color = tail_color
		else:
			var t: float = float(i) / _segments.size()
			color = body_color.lerp(tail_color, t)

		var half: Vector2 = Vector2(size, size) * 0.5
		var rect: Rect2 = Rect2(pos - half, Vector2(size, size))
		draw_rect(rect, color)
		if i == 0:
			# Draw a slightly larger glow behind the head
			var glow_rect: Rect2 = Rect2(pos - half - Vector2(2, 2), Vector2(size, size) + Vector2(4, 4))
			var glow: Color = Color(head_color.r, head_color.g, head_color.b, 0.3)
			draw_rect(glow_rect, glow)