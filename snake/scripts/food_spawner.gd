extends Node2D
class_name FoodSpawner

## Manages food spawning with weighted random selection of types.

enum FoodType { STANDARD, BONUS, SPEED_UP }

var _food_position: Vector2i = Vector2i.ZERO
var _food_type: FoodType = FoodType.STANDARD
var _grid_to_pixel: Callable
var _cell_size: int = 32

## Grid constants (local copies to avoid circular dependency on GameManager).
const GRID_W: int = 20
const GRID_H: int = 20

## Weighted probabilities for each food type.
const FOOD_WEIGHTS: Dictionary = {
	FoodType.STANDARD: 80,
	FoodType.BONUS: 15,
	FoodType.SPEED_UP: 5,
}

## Points awarded for each food type.
const FOOD_POINTS: Dictionary = {
	FoodType.STANDARD: 10,
	FoodType.BONUS: 50,
	FoodType.SPEED_UP: 25,
}

## Stores references for drawing and grid lookup.
func initialize(grid_to_pixel_cb: Callable, cell_size: int) -> void:
	_grid_to_pixel = grid_to_pixel_cb
	_cell_size = cell_size

## Spawns food at a random unoccupied grid position.
func spawn_food(snake_segments: Array[Vector2i]) -> void:
	var occupied: Dictionary = {}
	for seg: Vector2i in snake_segments:
		occupied[seg] = true

	var available: Array[Vector2i] = []
	for x: int in range(GRID_W):
		for y: int in range(GRID_H):
			var pos: Vector2i = Vector2i(x, y)
			if not occupied.has(pos):
				available.append(pos)

	if available.is_empty():
		return

	_food_position = available[randi() % available.size()]
	_food_type = _pick_food_type()
	queue_redraw()

## Selects a food type using weighted random selection.
func _pick_food_type() -> FoodType:
	var total: int = 0
	for w: int in FOOD_WEIGHTS.values():
		total += w
	var roll: int = randi() % total
	var cumulative: int = 0
	for type: FoodType in FOOD_WEIGHTS:
		cumulative += FOOD_WEIGHTS[type]
		if roll < cumulative:
			return type
	return FoodType.STANDARD

## Returns the current food grid position.
func get_food_position() -> Vector2i:
	return _food_position

## Returns the current food type.
func get_food_type() -> FoodType:
	return _food_type

## Helper to compare against SPEED_UP enum without importing FoodSpawner type in caller.
func get_food_type_enum_speed_up() -> FoodType:
	return FoodType.SPEED_UP

## Returns the point value for the given food type.
func get_food_points(type: FoodType) -> int:
	return FOOD_POINTS.get(type, 10)

func _draw() -> void:
	if _grid_to_pixel.is_null():
		return
	var pos: Vector2 = _grid_to_pixel.call(_food_position)

	match _food_type:
		FoodType.STANDARD:
			var color: Color = Color(0x00 / 255.0, 0xd4 / 255.0, 0xff / 255.0)
			var radius: float = _cell_size * 0.25
			draw_circle(pos, radius, color)
			# Glow ring
			draw_circle(pos, radius + 3.0, Color(color.r, color.g, color.b, 0.2), false, 1.5)

		FoodType.BONUS:
			var color: Color = Color(0xff / 255.0, 0xd7 / 255.0, 0x00 / 255.0)
			var size: float = _cell_size * 0.35
			var points: PackedVector2Array = PackedVector2Array([
				pos + Vector2(0.0, -size),
				pos + Vector2(size, 0.0),
				pos + Vector2(0.0, size),
				pos + Vector2(-size, 0.0),
			])
			draw_colored_polygon(points, color)

		FoodType.SPEED_UP:
			var color: Color = Color(0xff / 255.0, 0x69 / 255.0, 0xb4 / 255.0)
			var size: float = _cell_size * 0.35
			var points: PackedVector2Array = PackedVector2Array([
				pos + Vector2(0.0, -size),
				pos + Vector2(size * 0.866, size * 0.5),
				pos + Vector2(-size * 0.866, size * 0.5),
			])
			draw_colored_polygon(points, color)
			# Glow ring
			var radius: float = size * 0.8
			draw_circle(pos, radius + 3.0, Color(color.r, color.g, color.b, 0.15), false, 1.5)