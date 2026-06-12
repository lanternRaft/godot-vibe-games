extends CanvasLayer
class_name UI

## Manages all UI elements: HUD, menu overlays, and score display.

## Emitted when the player requests to start a game.
signal start_game_requested
## Emitted when the player requests to restart after game over.
signal restart_requested

@onready var _score_label: Label = $ScoreLabel
@onready var _high_score_label: Label = $HighScoreLabel
@onready var _speed_up_label: Label = $SpeedUpLabel
@onready var _start_menu: Control = $StartMenu
@onready var _pause_menu: Control = $PauseMenu
@onready var _game_over_menu: Control = $GameOverMenu

func _ready() -> void:
	show_start_menu(true)
	show_game_over(false)
	show_pause(false)
	show_hud(false)
	show_speed_up_indicator(false)

## Shows or hides the HUD (score and high score labels).
func show_hud(val: bool) -> void:
	_score_label.visible = val
	_high_score_label.visible = val

## Updates the score and high score display.
func update_score(score: int, high_score: int) -> void:
	_score_label.text = "Score: %d" % score
	_high_score_label.text = "High Score: %d" % high_score

## Shows or hides the speed-up active indicator.
func show_speed_up_indicator(val: bool) -> void:
	_speed_up_label.visible = val
	if val:
		_speed_up_label.text = "SPEED UP!"

## Shows or hides the start menu overlay.
func show_start_menu(val: bool) -> void:
	_start_menu.visible = val

## Shows or hides the pause overlay.
func show_pause(val: bool) -> void:
	_pause_menu.visible = val

## Shows or hides the game over overlay.
func show_game_over(val: bool) -> void:
	_game_over_menu.visible = val

## Updates the game over screen with the final score and high score.
func show_game_over_score(score: int, high_score: int) -> void:
	var score_label: Label = _game_over_menu.get_node("FinalScoreLabel")
	var new_high_label: Label = _game_over_menu.get_node("NewHighScoreLabel")

	score_label.text = "Score: %d" % score
	new_high_label.visible = (score >= high_score and score > 0)