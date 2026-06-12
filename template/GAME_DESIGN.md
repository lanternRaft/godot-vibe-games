# Game Design Document (GDD)

## Summary
*A brief, high-level overview of the game’s core identity.*

* **Game Title:** `[Game Name]`
* **Genre:** `[e.g., 2D Top-Down Arcade Shooter, Tile-Based Puzzle, Infinite Runner]`
* **Target Platform:** `[e.g., Web/Browser, PC, Mobile]`
* **Core Concept:** `[A one-sentence summary of what the player does and why it is fun.]`
* **Visual Style:** `[e.g., Retro 8-bit, Minimalist shapes, Flat neon colors]`
* **Audio Style:** `[e.g., Retro arcade sound effects, Chiptune music background]`

## Core Game Loop & Flow
*How the game operates from the moment it is opened to when the player quits.*

### Game Flow Chart
1. **Start Menu:** Displays Title, High Score, and a "Start Game" option.
2. **Gameplay:** The main loop where the player controls the game, interacts with elements, and scores points.
3. **Pause Screen:** Temporarily halts gameplay, allowing the player to resume or quit.
4. **Game Over Screen:** Displays the final score, compares it to the high score, and offers a "Restart" option.

### The Gameplay Loop
## Controls & Input Mapping
*How the player interacts with the game.*

| Input (Keyboard/Mouse/Touch) | Menu Action | In-Game Action |
| :--- | :--- | :--- |
| `[e.g., Arrow Left / A]` | Navigate Left | Move character left |
| `[e.g., Arrow Right / D]`| Navigate Right | Move character right |
| `[e.g., Spacebar]` | Select Option | Action (Jump / Shoot) |
| `[e.g., Escape / P]` | N/A | Pause / Unpause |

## Game Entities & Mechanics
*The definitions, properties, and behaviors of everything that moves or interacts in the game.*

### The Player Character
* **Appearance:** `[e.g., A green triangle, 32x32 pixels]`
* **Starting Position:** `[e.g., Bottom-center of the screen]`
* **Attributes:**
    * `Health / Lives`: `[e.g., 3 standard lives]`
    * `Speed`: `[e.g., Maximum horizontal movement speed]`
* **Movement Rules:** `[e.g., Smooth acceleration with friction, cannot move past the edges of the screen.]`

### Hazards / Enemies
* **Appearance:** `[e.g., Red circles falling from the top of the screen]`
* **Behavior:** `[e.g., Spawn randomly along the top edge every 2 seconds and travel downward at a constant speed.]`
* **Interaction:** `[e.g., Colliding with the player inflicts 1 damage and destroys the enemy.]`

### Projectiles / Abilities (If applicable)
* **Appearance:** `[e.g., Small yellow laser lines]`
* **Behavior:** `[e.g., Fired from the player's position, travels straight up at a fast speed.]`
* **Interaction:** `[e.g., Destroys enemies on impact.]`

### Collectibles / Power-ups (If applicable)
* **Appearance:** `[e.g., Glowing blue stars]`
* **Behavior:** `[e.g., Spawns rarely, floats in place or drifts slowly across the screen.]`
* **Interaction:** `[e.g., Grants temporary invulnerability or adds 500 bonus points.]`

## User Interface (UI) & HUD
*What information is displayed on the screen during play.*

* **Heads-Up Display (HUD):**
    * **Score:** Tracked in real-time (displayed in the top-left corner).
    * **Health/Lives:** Displayed as icons or a health bar (top-right corner).
* **Menus:**
    * Simple, clean text overlays for the Start, Pause, and Game Over states.

## Win / Loss & Difficulty Progression
*How the game is won, lost, or gets harder over time.*

* **Win Condition:** `[e.g., Survive for 3 minutes, defeat the boss, or complete all levels]`
* **Loss Condition:** `[e.g., Health reaches 0, or an enemy reaches the bottom defense line]`
* **Progression/Difficulty:** `[e.g., Every 30 seconds, enemies spawn slightly faster and move 10% quicker to increase the challenge.]`