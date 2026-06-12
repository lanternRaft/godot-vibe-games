extends Node

var bounciness: float = 1.0
var ball_radius: float = 32.0
var max_balls: int = 100
var ball_count: int = 0
var gravity: float = 1.0

## True if the device has a usable accelerometer (phone/tablet).
var has_accelerometer: bool = false

## Gravity direction from phone orientation. (0, 1) = normal down.
## Updated each physics frame by main.gd when has_accelerometer is true.
var gravity_direction: Vector2 = Vector2.DOWN

## Base gravity magnitude in pixels/s^2.
const GRAVITY_MAGNITUDE: float = 980.0