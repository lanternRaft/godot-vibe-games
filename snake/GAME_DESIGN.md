# Game Design Document (GDD)

## Summary
*A brief, high-level overview of the game's core identity.*

* **Game Title:** Snake
* **Genre:** 2D Grid-Based Arcade
* **Target Platform:** Web/Browser
* **Core Concept:** Guide a neon snake around a wrap-around grid, eating food to grow and score points while avoiding colliding with your own tail.
* **Visual Style:** Minimalist neon — dark background, bright glowing shapes with subtle glow effects.


## Core Game Loop & Flow
*How the game operates from the moment it is opened to when the player quits.*

### Game Flow Chart
1. **Start Menu:** Displays Title, High Score, and a "Start Game" option.
2. **Gameplay:** The main loop where the player controls the snake, eats food, grows, and scores points.
3. **Pause Screen:** Temporarily halts gameplay via Escape/P key.
4. **Game Over Screen:** Displays the final score, compares it to the high score, and offers a "Restart" option.

### The Gameplay Loop
- Snake moves continuously in one direction on a grid.
- Player changes direction with arrow keys (desktop) or swipe (mobile).
- Snake wraps around screen edges (appears on opposite side).
- Multiple food types spawn on the grid, one at a time.
- Eating food increases score and snake length.
- Colliding with own tail ends the game.
- Speed increases gradually as score grows.

---

## Controls & Input Mapping
*How the player interacts with the game.*

| Input (Keyboard / Swipe) | Menu Action | In-Game Action |
| :--- | :--- | :--- |
| `Arrow Up / Swipe Up` | Navigate Up | Change direction Up |
| `Arrow Down / Swipe Down` | Navigate Down | Change direction Down |
| `Arrow Left / Swipe Left` | Navigate Left | Change direction Left |
| `Arrow Right / Swipe Right` | Navigate Right | Change direction Right |
| `Spacebar / Enter` | Select / Start | N/A |
| `Escape / P` | N/A | Pause / Unpause |

---

## Game Entities & Mechanics
*The definitions, properties, and behaviors of everything that moves or interacts in the game.*

### The Snake
* **Appearance:** Connected glowing neon segments (head is slightly larger/brighter, tail fades).
* **Starting Position:** Center of the grid, length of 3 segments, moving right.
* **Attributes:**
    * `Speed`: Starts at ~5 tiles/sec, increases every 5 food eaten, capped at ~2x base speed.
    * `Growth`: +1 segment per food eaten.
* **Movement Rules:** Moves on grid ticks. Direction change queues one turn per tick. Cannot reverse into self (180-degree turn is ignored).

### Food Types
All spawn at random unoccupied grid positions, one at a time. When eaten, a new one spawns.

| Type | Appearance | Points | Effect |
| :--- | :--- | :--- | :--- |
| Standard | Small glowing circle (white/blue) | 10 | +1 segment |
| Bonus | Larger glowing star (gold) | 50 | +1 segment, rarer spawn |
| Speed-up | Pulsing triangle (pink) | 25 | +1 segment, temporarily boosts speed for 5s |

### Hazards / Enemies
* **Own Tail:** Colliding with any segment ends the game. No other hazards.

---

## User Interface (UI) & HUD
*What information is displayed on the screen during play.*

* **Heads-Up Display (HUD):**
    * **Score:** Displayed in the top-center, large neon text (glowing).
    * **High Score:** Displayed below the current score, slightly dimmer.
    * **Speed-up Timer:** When Speed-up food is active, a small pulsing indicator near the score shows remaining duration.
* **Menus:**
    * Simple centered neon-text overlays for Start, Pause, and Game Over states.
    * Start: Title + "Tap/Space to Start" + High Score.
    * Game Over: "Game Over" + Final Score + "Tap/Space to Restart".

---

## Win / Loss & Difficulty Progression
*How the game is won, lost, or gets harder over time.*

* **Win Condition:** None — endless arcade mode.
* **Loss Condition:** Snake head collides with its own tail.
* **Progression/Difficulty:** Base speed increases every 5 food eaten (capped at ~2x base speed). Speed-up food provides a temporary burst above the current speed level. The challenge comes from managing a longer snake on the same grid.
