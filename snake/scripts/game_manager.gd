extends Node2D

## Main game controller. Manages game state, input, and orchestrates high-level game logic.

enum GameState { START_MENU, PLAYING, PAUSED, GAME_OVER }

const GRID_WIDTH: int = 20
const GRID_HEIGHT: int = 20
const CELL_SIZE: int = 32
const PLAY_AREA_OFFSET: Vector2 = Vector2(80, 80)

const BASE_TICK_INTERVAL: float = 0.2
const SPEED_INCREASE_PER_TIER: float = 0.025
const MIN_TICK_INTERVAL: float = 0.1
const SPEED_UP_MULTIPLIER: float = 0.65
const SPEED_UP_DURATION: float = 5.0
const FOOD_PER_SPEED_TIER: int = 5

const SCORE_FILE: String = "user://highscore.save"

const _SnakeClass = preload("res://scripts/snake.gd")
const _FoodSpawnerClass = preload("res://scripts/food_spawner.gd")
const _UIClass = preload("res://scripts/ui.gd")

@onready var _snake: _SnakeClass = $Snake
@onready var _food_spawner: _FoodSpawnerClass = $FoodSpawner
@onready var _ui: _UIClass = $UI
@onready var _tick_timer: Timer = $TickTimer
@onready var _speed_up_timer: Timer = $SpeedUpTimer

var _state: GameState = GameState.START_MENU
var _score: int = 0
var _high_score: int = 0
var _food_eaten: int = 0
var _is_speed_up_active: bool = false

## Returns the play area rect in pixel coordinates.
func get_play_area() -> Rect2:
	return Rect2(PLAY_AREA_OFFSET, Vector2(GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE))

## Converts a grid position to the center pixel of that cell.
func grid_to_pixel(grid_pos: Vector2i) -> Vector2:
	return PLAY_AREA_OFFSET + Vector2(grid_pos) * CELL_SIZE + Vector2(CELL_SIZE, CELL_SIZE) * 0.5

## Returns the current tick interval based on food eaten and speed-up status.
func get_tick_interval() -> float:
	var base: float = BASE_TICK_INTERVAL
	var tier: int = floori(float(_food_eaten) / float(FOOD_PER_SPEED_TIER))
	base -= float(tier) * SPEED_INCREASE_PER_TIER
	base = max(base, MIN_TICK_INTERVAL)
	if _is_speed_up_active:
		base *= SPEED_UP_MULTIPLIER
	return base

func _ready() -> void:
	_high_score = _load_high_score()
	_tick_timer.timeout.connect(_on_tick)
	_speed_up_timer.timeout.connect(_on_speed_up_end)
	_ui.start_game_requested.connect(_on_start_game_requested)
	_ui.restart_requested.connect(_on_restart_requested)
	_snake.initialize(Callable(self, "grid_to_pixel"), CELL_SIZE)
	_food_spawner.initialize(Callable(self, "grid_to_pixel"), CELL_SIZE)
	_show_start_menu()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		if _state == GameState.PLAYING:
			_pause_game()
		elif _state == GameState.PAUSED:
			_resume_game()
		return

	if _state == GameState.PLAYING:
		if event.is_action_pressed("move_up"):
			_snake.queue_direction(Vector2i.UP)
		elif event.is_action_pressed("move_down"):
			_snake.queue_direction(Vector2i.DOWN)
		elif event.is_action_pressed("move_left"):
			_snake.queue_direction(Vector2i.LEFT)
		elif event.is_action_pressed("move_right"):
			_snake.queue_direction(Vector2i.RIGHT)

	if _state == GameState.START_MENU:
		if event.is_action_pressed("ui_accept"):
			_start_game()
	elif _state == GameState.GAME_OVER:
		if event.is_action_pressed("ui_accept"):
			_restart_game()

func _on_tick() -> void:
	if _state != GameState.PLAYING:
		return

	var food_pos: Vector2i = _food_spawner.get_food_position()
	var ate: bool = _snake.move(food_pos)

	if _snake.is_dead():
		_game_over()
		return

	if ate:
		var food_type: _FoodSpawnerClass.FoodType = _food_spawner.get_food_type()
		_score += _food_spawner.get_food_points(food_type)
		_food_eaten += 1

		if food_type == _food_spawner.get_food_type_enum_speed_up():
			_activate_speed_up()

		_food_spawner.spawn_food(_snake.get_segments())
		_ui.update_score(_score, _high_score)
		_update_tick_timer()

	queue_redraw()

func _update_tick_timer() -> void:
	_tick_timer.start(get_tick_interval())

func _activate_speed_up() -> void:
	_is_speed_up_active = true
	_speed_up_timer.start()
	_update_tick_timer()
	_ui.show_speed_up_indicator(true)

func _on_speed_up_end() -> void:
	_is_speed_up_active = false
	_update_tick_timer()
	_ui.show_speed_up_indicator(false)

func _show_start_menu() -> void:
	_state = GameState.START_MENU
	_tick_timer.stop()
	_speed_up_timer.stop()
	_ui.show_start_menu(true)
	_ui.show_game_over(false)
	_ui.show_pause(false)
	_ui.show_hud(false)
	_ui.update_score(_score, _high_score)
	queue_redraw()

func _start_game() -> void:
	_score = 0
	_food_eaten = 0
	_is_speed_up_active = false
	_snake.reset()
	_food_spawner.spawn_food(_snake.get_segments())
	_state = GameState.PLAYING
	_ui.show_start_menu(false)
	_ui.show_game_over(false)
	_ui.show_hud(true)
	_ui.update_score(_score, _high_score)
	_update_tick_timer()
	queue_redraw()

func _pause_game() -> void:
	_state = GameState.PAUSED
	_tick_timer.paused = true
	_ui.show_pause(true)

func _resume_game() -> void:
	_state = GameState.PLAYING
	_tick_timer.paused = false
	_ui.show_pause(false)

func _game_over() -> void:
	_state = GameState.GAME_OVER
	_tick_timer.stop()
	_speed_up_timer.stop()
	var is_new_high: bool = _score > _high_score
	if is_new_high:
		_high_score = _score
		_save_high_score(_high_score)
	_ui.show_hud(false)
	_ui.show_game_over(true)
	_ui.show_game_over_score(_score, _high_score)
	queue_redraw()

func _on_start_game_requested() -> void:
	if _state == GameState.START_MENU:
		_start_game()

func _on_restart_requested() -> void:
	if _state == GameState.GAME_OVER:
		_restart_game()

func _restart_game() -> void:
	_show_start_menu()

func _load_high_score() -> int:
	var file: FileAccess = FileAccess.open(SCORE_FILE, FileAccess.READ)
	if file:
		var val: int = file.get_32()
		file.close()
		return val
	return 0

func _save_high_score(score: int) -> void:
	var file: FileAccess = FileAccess.open(SCORE_FILE, FileAccess.WRITE)
	if file:
		file.store_32(score)
		file.close()

func _draw() -> void:
	if _state == GameState.START_MENU or _state == GameState.GAME_OVER:
		_draw_background()
		return
	if _state == GameState.PLAYING or _state == GameState.PAUSED:
		_draw_background()
		_draw_grid()

func _draw_background() -> void:
	var bg_color: Color = Color(0x1a / 255.0, 0x1a / 255.0, 0x2e / 255.0)
	draw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), bg_color)

func _draw_grid() -> void:
	var play_area: Rect2 = get_play_area()
	var grid_color: Color = Color(0x16 / 255.0, 0x21 / 255.0, 0x3e / 255.0, 0.4)
	for x: int in range(GRID_WIDTH + 1):
		var x_pos: float = play_area.position.x + x * CELL_SIZE
		draw_line(Vector2(x_pos, play_area.position.y), Vector2(x_pos, play_area.position.y + play_area.size.y), grid_color, 1)
	for y: int in range(GRID_HEIGHT + 1):
		var y_pos: float = play_area.position.y + y * CELL_SIZE
		draw_line(Vector2(play_area.position.x, y_pos), Vector2(play_area.position.x + play_area.size.x, y_pos), grid_color, 1)
