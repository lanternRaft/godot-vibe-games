extends Node2D

@onready var settings_panel = $UI/SettingsPanel
@onready var bounciness_slider = $UI/SettingsPanel/BouncinessSlider
@onready var bounciness_value_label = $UI/SettingsPanel/BouncinessValue
@onready var ball_size_slider = $UI/SettingsPanel/BallSizeSlider
@onready var ball_size_value_label = $UI/SettingsPanel/BallSizeValue
@onready var ball_count_label = $UI/SettingsPanel/BallCountLabel
@onready var gravity_slider = $UI/SettingsPanel/GravitySlider
@onready var gravity_value_label = $UI/SettingsPanel/GravityValue
@onready var gear_button = $UI/GearButton
@onready var fullscreen_button = $UI/FullscreenButton

var ball_scene = preload("res://scripts/ball.tscn")
var is_dragging: bool = false
var drag_start: Vector2 = Vector2.ZERO
var drag_current: Vector2 = Vector2.ZERO
var grabbed_ball: RigidBody2D = null
const DRAG_THRESHOLD: float = 10.0
const DRAG_FORCE_SCALE: float = 5.0

func _ready():
	# Set up gear button
	gear_button.text = "\u2699"  # Gear unicode
	gear_button.connect("pressed", Callable(self, "_on_gear_pressed"))
	
	# Set up fullscreen button
	fullscreen_button.connect("pressed", Callable(self, "_on_fullscreen_pressed"))
	
	# Set up settings sliders
	bounciness_slider.min_value = 0.0
	bounciness_slider.max_value = 1.0
	bounciness_slider.step = 0.05
	bounciness_slider.value = Globals.bounciness
	bounciness_value_label.text = str(Globals.bounciness)
	bounciness_slider.connect("value_changed", Callable(self, "_on_bounciness_changed"))
	
	ball_size_slider.min_value = 8.0
	ball_size_slider.max_value = 64.0
	ball_size_slider.step = 2.0
	ball_size_slider.value = Globals.ball_radius
	ball_size_value_label.text = str(Globals.ball_radius)
	ball_size_slider.connect("value_changed", Callable(self, "_on_ball_size_changed"))

	# Set up gravity slider
	gravity_slider.min_value = 0.0
	gravity_slider.max_value = 1.0
	gravity_slider.step = 0.05
	gravity_slider.value = Globals.gravity
	gravity_value_label.text = str(Globals.gravity)
	gravity_slider.connect("value_changed", Callable(self, "_on_gravity_changed"))
	
	# Hide settings initially
	settings_panel.visible = false
	
	update_ball_count_label()
	
	# Detect accelerometer after a brief delay
	_check_accelerometer()

func _check_accelerometer():
	await get_tree().create_timer(0.3).timeout
	var accel := Input.get_accelerometer()
	if accel.length_squared() > 0.01:
		Globals.has_accelerometer = true

func _physics_process(_delta: float) -> void:
	if not Globals.has_accelerometer:
		return
	# Read phone orientation and store gravity direction.
	# Balls apply this per-frame in _integrate_forces.
	var accel := Input.get_accelerometer()
	var dir_2d := Vector2(accel.x, accel.y)
	if dir_2d.length_squared() > 0.01:
		Globals.gravity_direction = dir_2d.normalized()

func _unhandled_input(event):
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				# Check if we clicked on an existing ball
				var hit_ball = find_ball_at(event.position)
				if hit_ball:
					grabbed_ball = hit_ball
					# Freeze the grabbed ball so we can drag it
					grabbed_ball.freeze = true
					is_dragging = true
					drag_start = event.position
					drag_current = event.position
				else:
					# Start drag for spawning
					is_dragging = true
					drag_start = event.position
					drag_current = event.position
					grabbed_ball = null
			else:
				# Released
				if is_dragging:
					is_dragging = false
					var drag_vec = drag_current - drag_start
					var distance = drag_vec.length()
					
					if grabbed_ball:
						# Throw the grabbed ball
						grabbed_ball.freeze = false
						if distance >= DRAG_THRESHOLD:
							grabbed_ball.linear_velocity = drag_vec * DRAG_FORCE_SCALE
						grabbed_ball = null
					elif distance >= DRAG_THRESHOLD:
						spawn_ball(drag_start, drag_vec * DRAG_FORCE_SCALE)
					else:
						spawn_ball(drag_start, Vector2.ZERO)
	
	if event is InputEventMouseMotion and is_dragging:
		drag_current = event.position
		if grabbed_ball:
			grabbed_ball.position = event.position


func toggle_fullscreen():
	if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_WINDOWED:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)

func _on_fullscreen_pressed():
	toggle_fullscreen()

func find_ball_at(pos: Vector2) -> RigidBody2D:
	var space_state = get_world_2d().direct_space_state
	var query = PhysicsPointQueryParameters2D.new()
	query.position = pos
	query.collision_mask = 2  # Ball layer
	var results = space_state.intersect_point(query)
	for result in results:
		var collider = result.collider
		if collider is RigidBody2D:
			return collider
	return null

func spawn_ball(pos: Vector2, velocity: Vector2):
	if Globals.ball_count >= Globals.max_balls:
		return
	
	var ball = ball_scene.instantiate()
	add_child(ball)
	ball.position = pos
	ball.linear_velocity = velocity
	# Assign to collision layer 2 for ball-to-ball collisions
	ball.collision_layer = 2
	ball.collision_mask = 2
	
	Globals.ball_count += 1
	update_ball_count_label()

func update_ball_count_label():
	ball_count_label.text = "Balls: " + str(Globals.ball_count) + " / " + str(Globals.max_balls)

func _on_gear_pressed():
	settings_panel.visible = not settings_panel.visible

func _on_bounciness_changed(value: float):
	Globals.bounciness = value
	bounciness_value_label.text = str(value)

func _on_gravity_changed(value: float):
	Globals.gravity = value
	gravity_value_label.text = str(value)
	# Update gravity on all existing balls
	for child in get_children():
		if child is RigidBody2D:
			child.gravity_scale = value

func _on_ball_size_changed(value: float):
	Globals.ball_radius = value
	ball_size_value_label.text = str(value)
	# Update all existing balls' collision shapes
	for child in get_children():
		if child is RigidBody2D:
			var shape_node = child.get_node("CollisionShape2D")
			if shape_node and shape_node.shape is CircleShape2D:
				shape_node.shape.radius = value