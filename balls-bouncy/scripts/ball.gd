extends RigidBody2D

# PICO-8 inspired color palette
const PICO_COLORS = [
	Color8(255, 0, 77),    # red
	Color8(255, 163, 0),   # orange
	Color8(255, 236, 39),  # yellow
	Color8(0, 228, 54),    # green
	Color8(0, 148, 255),   # blue
	Color8(118, 66, 255),  # purple
	Color8(255, 0, 206),   # pink
	Color8(41, 255, 225),  # cyan
]

## Maximum compression ratio (1.0 = no squish, 0.50 = 50% compression).
const SQUISH_INTENSITY: float = 0.30

## Speed at which the ball recovers back to round (per second).
const SQUISH_DECAY: float = 4.0

## Minimum impact velocity (px/s) needed to trigger squish.
const MIN_IMPACT: float = 100.0

var ball_color: Color
var trail_positions: Array = []
var trail_length: int = 15

## Current squash & stretch scale along the collision normal.
var squish_x: float = 1.0

## Current squash & stretch scale perpendicular to the collision normal.
var squish_y: float = 1.0

## Angle (radians) of the collision normal, so the squish aligns with impact.
var squish_angle: float = 0.0


func _ready():
	# Pick a random color from the PICO palette
	ball_color = PICO_COLORS[randi() % PICO_COLORS.size()]
	# Update collision shape radius to match current setting
	var shape_node = $CollisionShape2D
	if shape_node and shape_node.shape is CircleShape2D:
		shape_node.shape.radius = Globals.ball_radius
	# Assign physics material so balls bounce off each other
	var material := PhysicsMaterial.new()
	material.bounce = Globals.bounciness
	material.friction = 0.0
	physics_material_override = material
	gravity_scale = 0.0  # We apply custom gravity in _integrate_forces

	# Detect collisions with other balls for squish effect
	body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node):
	## Triggered when this ball first collides with another physics body.
	## Computes the impact velocity and applies a squash-and-stretch deformation.
	var other_vel := Vector2.ZERO
	if body is RigidBody2D:
		other_vel = body.linear_velocity

	var impact_vel := linear_velocity - other_vel
	var impact_speed := impact_vel.length()
	if impact_speed < MIN_IMPACT:
		return

	# Impact direction serves as the collision normal for the squish axis
	var normal := impact_vel.normalized()

	# Squish along the collision normal, stretch perpendicular for volume feel
	var amount: float = clamp(impact_speed * SQUISH_INTENSITY / 200.0, 0.0, SQUISH_INTENSITY)
	squish_x = 1.0 - amount
	squish_y = 1.0 + amount * 0.7  # partial volume preservation
	squish_angle = normal.angle()


func _integrate_forces(state: PhysicsDirectBodyState2D):
	## Apply custom directional gravity (from accelerometer or default downward).
	var gravity_vec := Globals.gravity_direction * Globals.GRAVITY_MAGNITUDE * Globals.gravity
	state.apply_force(gravity_vec * mass)

	var radius = Globals.ball_radius
	var viewport = get_viewport()
	if not viewport:
		return
	var size = viewport.get_visible_rect().size
	var pos = state.transform.origin
	var vel = state.linear_velocity
	
	var bounce = Globals.bounciness
	
	# Left wall
	if pos.x - radius < 0:
		pos.x = radius
		vel.x = abs(vel.x) * bounce
	# Right wall
	elif pos.x + radius > size.x:
		pos.x = size.x - radius
		vel.x = -abs(vel.x) * bounce
	
	# Top wall
	if pos.y - radius < 0:
		pos.y = radius
		vel.y = abs(vel.y) * bounce
	# Bottom wall
	elif pos.y + radius > size.y:
		pos.y = size.y - radius
		vel.y = -abs(vel.y) * bounce
	
	state.transform.origin = pos
	state.linear_velocity = vel


func _process(delta):
	# Record trail position
	trail_positions.append(position)
	if trail_positions.size() > trail_length:
		trail_positions.pop_front()

	# Recover squish toward normal over time
	squish_x = lerp(squish_x, 1.0, SQUISH_DECAY * delta)
	squish_y = lerp(squish_y, 1.0, SQUISH_DECAY * delta)
	
	queue_redraw()


func _draw():
	var trail_len = trail_positions.size()
	if trail_len == 0:
		return
	
	var radius = Globals.ball_radius
	# Draw trail from oldest to newest (fading in)
	for i in range(trail_len):
		var t = float(i) / float(trail_len - 1) if trail_len > 1 else 1.0
		var alpha = t * 0.5
		var r = lerp(0.0, radius, t)
		var c = ball_color
		c.a = alpha
		draw_circle(to_local(trail_positions[i]), r, c)
	
	# Draw the solid ball with squash-and-stretch transform
	draw_set_transform(Vector2.ZERO, squish_angle, Vector2(squish_x, squish_y))
	draw_circle(Vector2.ZERO, radius, ball_color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)