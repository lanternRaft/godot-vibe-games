/**
 * Godot Workflow Extension
 *
 * A deterministic multi-step workflow for generating Godot games.
 * Orchestrates planning, implementation, validation, building, and deployment.
 *
 * Commands:
 *   /godot-generate         - Start the full workflow (questions → GDD → build → deploy)
 *   /godot-plan             - Planning phase only (questions + GDD creation/review)
 *   /godot-state            - Show current workflow state
 *   /godot-implement-gdd    - Implement directly from existing GAME_DESIGN.md (skip planning)
 *   /godot-tweak            - Quick tweak: pick game → describe change → implement → pipeline
 *   /godot-validate [game]  - Run Godot validation on a game folder
 *   /godot-build [game]     - Run web build for a game folder
 *   /godot-verify [game]    - Verify a completed build
 *   /godot-commit           - Commit all staged changes
 *   /godot-push             - Push to remote
 *
 * State Machine Phases:
 *   QUESTIONS  →  SETUP  →  PLAN (interactive GDD)  →  REVIEW  →  IMPLEMENT  →  VALIDATE  →  BUILD  →  VERIFY  →  COMMIT  →  PUSH  →  DONE
 *                                                                                │
 *                                (VERIFY fails) ◄────────────────────────────────┘
 *                                                                                │
 *                                (REVIEW refines GDD) ◄──────────────────────────┘
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { handleValidate as validatePhaseHandler, registerValidationCommand } from "./validation";

// ── Types ────────────────────────────────────────────────────────────────────

/** Phases of the godot generation workflow */
enum Phase {
	QUESTIONS = "questions",
	SETUP = "setup",
	PLAN = "plan",
	REVIEW = "review",
	IMPLEMENT = "implement",
	VALIDATE = "validate",
	BUILD = "build",
	VERIFY = "verify",
	COMMIT = "commit",
	PUSH = "push",
	DONE = "done",
}

/** Persisted workflow state */
interface WorkflowState {
	phase: Phase;
	gameType: string;
	gameName: string;
	scope: string;
	features: string[];
	/** During PLAN: "pending" if prompt sent but GDD not yet written.
	 *  During REVIEW: contains the full GDD text for editing. */
	planText: string;
	retryCount: number;
	maxRetries: number;
}

const DEFAULT_STATE: WorkflowState = {
	phase: Phase.QUESTIONS,
	gameType: "",
	gameName: "",
	scope: "",
	features: [],
	planText: "",
	retryCount: 0,
	maxRetries: 3,
};

// ── UI labels for phase steps ────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
	[Phase.QUESTIONS]: "Ask clarifying questions",
	[Phase.SETUP]: "Copy template to game folder",
	[Phase.PLAN]: "Fill out Game Design Document (interactive)",
	[Phase.REVIEW]: "Review and approve Game Design Document",
	[Phase.IMPLEMENT]: "Implement game from GDD",
	[Phase.VALIDATE]: "Run validation (godot --headless --check-only --quiet)",
	[Phase.BUILD]: "Run web build",
	[Phase.VERIFY]: "Verify build succeeded",
	[Phase.COMMIT]: "Commit changes",
	[Phase.PUSH]: "Push to remote",
	[Phase.DONE]: "Complete",
};

// ── Persistence helpers ──────────────────────────────────────────────────────

const WORKFLOW_CUSTOM_TYPE = "godot-workflow-state";

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(WORKFLOW_CUSTOM_TYPE, state);
}

function loadState(ctx: { sessionManager: { getEntries(): SessionEntry[] } }): WorkflowState | null {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as SessionEntry & { customType?: string; data?: WorkflowState };
		if (entry.type === "custom" && entry.customType === WORKFLOW_CUSTOM_TYPE && entry.data) {
			return entry.data;
		}
	}
	return null;
}

// ── Status update ────────────────────────────────────────────────────────────

function updateStatus(ctx: ExtensionCommandContext, state: WorkflowState): void {
	const label = PHASE_LABELS[state.phase];
	if (state.phase === Phase.DONE) {
		ctx.ui.setStatus("godot-workflow", undefined);
		ctx.ui.setWidget("godot-workflow", undefined);
		return;
	}
	const retryInfo = state.retryCount > 0 ? ` (retry ${state.retryCount}/${state.maxRetries})` : "";
	ctx.ui.setStatus(
		"godot-workflow",
		ctx.ui.theme.fg("accent", `🎮 ${label}${retryInfo}`),
	);
	ctx.ui.setWidget("godot-workflow", [
		ctx.ui.theme.fg("accent", `🎮 Godot Workflow — ${label}`),
		ctx.ui.theme.fg("dim", `Game: ${state.gameName || state.gameType || "TBD"}  |  Scope: ${state.scope || "TBD"}`),
		ctx.ui.theme.fg("muted", state.features.length > 0 ? `Features: ${state.features.join(", ")}` : ""),
	]);
}

// ── State machine runner ─────────────────────────────────────────────────────

async function runWorkflow(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<void> {
	// eslint-disable-next-line no-constant-condition -- state machine loop
	while (true) {
		updateStatus(ctx, state);

		switch (state.phase) {
			case Phase.QUESTIONS:
				state = await handleQuestions(ctx, state);
				break;
			case Phase.SETUP:
				state = await handleSetup(pi, ctx, state);
				break;
			case Phase.PLAN:
				state = await handlePlan(pi, ctx, state);
				// After sending plan message, we return control — the LLM responds asynchronously
				return;
			case Phase.REVIEW:
				state = await handleReview(ctx, state);
				break;
			case Phase.IMPLEMENT:
				state = await handleImplement(pi, ctx, state);
				// After sending implement message, we return control — the LLM responds asynchronously
				return;
			case Phase.VALIDATE:
				state = await validatePhaseHandler(pi, ctx, state, { pickGameFolder });
				break;
			case Phase.BUILD:
				state = await handleBuild(ctx, state);
				break;
			case Phase.VERIFY:
				state = await handleVerify(ctx, state);
				break;
			case Phase.COMMIT:
				state = await handleCommit(ctx, state);
				break;
			case Phase.PUSH:
				state = await handlePush(ctx, state);
				break;
			case Phase.DONE:
				ctx.ui.notify("🎮 Godot generation complete!", "info");
				ctx.ui.setStatus("godot-workflow", undefined);
				ctx.ui.setWidget("godot-workflow", undefined);
				persistState(pi, state);
				return;
		}

		persistState(pi, state);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Run godot validation for a given game folder.
 * Returns structured result with success, exitCode, and errorPreview.
 */
/**
 * Detect game folders that contain a GAME_DESIGN.md file.
 */
async function detectGameFolders(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<string[]> {
	const result = await pi.exec(
		"bash",
        ["-c", `for d in */; do [ -f "$d/GAME_DESIGN.md" ] && basename "$d"; done`],
		{ cwd: ctx.cwd },
	);
	if (result.code !== 0) return [];
	return result.stdout.trim().split("\n").filter(Boolean);
}

/**
 * Detect Godot project folders that contain a project.godot file.
 * Excludes the template/ directory.
 */
async function detectGodotProjects(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<string[]> {
	const result = await pi.exec(
		"bash",
		["-c", `for d in */; do [ -f "$d/project.godot" ] && basename "$d"; done`],
		{ cwd: ctx.cwd },
	);
	if (result.code !== 0) return [];
	return result.stdout.trim().split("\n").filter(Boolean).filter((d) => d !== "template");
}

/**
 * Resolve a game folder from a command argument or a picker.
 * Returns null if no folder is selected or none exist.
 */
async function pickGameFolder(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string[],
): Promise<string | null> {
	let gameFolder = args[0]?.trim() || "";
	if (gameFolder) {
		// Verify the folder exists and has a project.godot
		const exists = await pi.exec("test", ["-d", `${ctx.cwd}/${gameFolder}`], { cwd: ctx.cwd });
		if (exists.code !== 0) {
			ctx.ui.notify(`Folder "${gameFolder}" not found.`, "error");
			return null;
		}
		return gameFolder;
	}

	const folders = await detectGodotProjects(pi, ctx);
	if (folders.length === 0) {
		ctx.ui.notify("No Godot game folders found in this project.", "error");
		return null;
	}

	const selected = await ctx.ui.select("Select a game folder:", folders);
	if (!selected || selected === "Cancel") {
		ctx.ui.notify("Game not selected.", "warning");
		return null;
	}
	return selected;
}

/**
 * Convert a string to kebab-case for use as a folder name.
 * E.g., "Arcade Shooter" → "arcade-shooter"
 */
function toKebabCase(str: string): string {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * Copy the contents of the template folder into the game folder.
 * Uses state.gameName (set during QUESTIONS) as the folder name.
 * Updates project.godot config/name in the destination.
 *
 * @returns The game folder name used, or null if cancelled/failed.
 */
async function copyTemplateToNewGame(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<string | null> {
	const gameFolder = state.gameName || toKebabCase(state.gameType || "untitled");
	const src = `${ctx.cwd}/template`;
	const dst = `${ctx.cwd}/${gameFolder}`;

	// Check if destination already exists
	const existsResult = await pi.exec("test", ["-d", dst], { cwd: ctx.cwd });
	if (existsResult.code === 0) {
		const overwrite = await ctx.ui.confirm(
			`Folder "${gameFolder}" already exists. Overwrite template files?`,
			"Only template files (icon, project.godot, .godot/) will be replaced. Your game scripts and scenes won't be affected.",
		);
		if (!overwrite) {
			ctx.ui.notify("Skipping template copy; using existing folder.", "info");
			return gameFolder;
		}
	} else {
		// Create destination directory if needed
		await pi.exec("mkdir", ["-p", dst], { cwd: ctx.cwd });
	}

	ctx.ui.notify(`Copying template into "${gameFolder}/"...`, "info");

	// Copy all template files (excluding .godot/ directories)
	const copyResult = await pi.exec("rsync", ["-a", "--exclude=.godot", `${src}/`, dst], {
		cwd: ctx.cwd,
		timeout: 30_000,
	});

	if (copyResult.code !== 0) {
		ctx.ui.notify(`Failed to copy template: ${copyResult.stderr.slice(0, 200)}`, "error");
		return null;
	}

	// Update project.godot config/name to match the game
	const displayName = state.gameType
		? state.gameType.charAt(0).toUpperCase() + state.gameType.slice(1)
		: gameFolder.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

	const sedResult = await pi.exec(
		"sed",
		["-i", "", `s/config/name="Template"/config/name="${displayName}"/`, `${dst}/project.godot`],
		{ cwd: ctx.cwd, timeout: 10_000 },
	);

	if (sedResult.code !== 0) {
		ctx.ui.notify("Template copied but failed to update project name in project.godot.", "warning");
	}

	ctx.ui.notify(`✅ Template copied into "${gameFolder}/" as "${displayName}".`, "info");
	return gameFolder;
}

// ── Phase handlers ───────────────────────────────────────────────────────────

async function handleQuestions(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Let's gather details for your Godot game.", "info");

	// Ask for game folder name first
	const defaultName = state.gameName || toKebabCase(state.gameType || "untitled");
	const gameName = await ctx.ui.input(
		"Folder name for the new game (kebab-case, e.g., 'my-arcade-shooter'):",
		defaultName,
	);
	if (gameName === undefined) return { ...state, phase: Phase.DONE };
	if (gameName.trim()) state = { ...state, gameName: gameName.trim() };

	// Ask about game type
	const gameType = await ctx.ui.input(
		"What type of game? (e.g., 'platformer', 'puzzle', 'arcade shooter')",
		state.gameType || "platformer",
	);
	if (gameType === undefined) return { ...state, phase: Phase.DONE };
	if (gameType.trim()) state = { ...state, gameType: gameType.trim() };

	// Ask about scope
	const scope = await ctx.ui.input(
		"Describe the scope / concept in one sentence",
		state.scope || "A simple 2D game with basic mechanics",
	);
	if (scope === undefined) return { ...state, phase: Phase.DONE };
	if (scope.trim()) state = { ...state, scope: scope.trim() };

	// Ask about features
	const featuresRaw = await ctx.ui.input(
		"Key features (comma-separated, e.g., 'scoring, powerups, levels')",
		state.features.join(", ") || "scoring, levels",
	);
	if (featuresRaw === undefined) return { ...state, phase: Phase.DONE };
	state = {
		...state,
		features: featuresRaw
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean),
	};

	// Confirm
	const ok = await ctx.ui.confirm(
		"Proceed with setup?",
		`Folder: ${state.gameName}\nGame: ${state.gameType}\nScope: ${state.scope}\nFeatures: ${state.features.join(", ")}`,
	);
	if (!ok) return state; // Loop back to questions

	return { ...state, phase: Phase.SETUP };
}

async function handleSetup(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify(`Setting up "${state.gameName}" from template...`, "info");

	const gameFolder = await copyTemplateToNewGame(pi, ctx, state);

	if (gameFolder === null) {
		const action = await ctx.ui.select("Template copy failed or cancelled. What now?", [
			"Retry setup",
			"Skip setup (use existing folder)",
			"Stop workflow",
		]);

		switch (action) {
			case "Retry setup":
				return state; // Loop back to SETUP
			case "Skip setup (use existing folder)":
				return { ...state, phase: Phase.PLAN };
			default:
				return { ...state, phase: Phase.DONE };
		}
	}

	// Ensure gameName in state matches actual folder used
	state = { ...state, gameName: gameFolder };

	ctx.ui.notify(`✅ Setup complete. Game folder: "${gameFolder}/".`, "info");
	return { ...state, phase: Phase.PLAN };
}

async function handlePlan(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	const gddPath = `${ctx.cwd}/${state.gameName}/GAME_DESIGN.md`;

	// Check if GDD has already been written to the game folder
	const gddExists = await pi.exec("test", ["-f", gddPath], { cwd: ctx.cwd });
	if (gddExists.code === 0) {
		// GDD exists — read it and advance to review
		const readResult = await pi.exec("cat", [gddPath], { cwd: ctx.cwd });
		const gddContent = readResult.code === 0 ? readResult.stdout : "(could not read GDD)";
		ctx.ui.notify("GDD found in game folder! Ready for review.", "info");
		return { ...state, phase: Phase.REVIEW, planText: gddContent };
	}

	// If we already sent the prompt (planText === "pending"), just wait
	if (state.planText === "pending") {
		ctx.ui.notify(
			"⏳ Waiting for LLM to write the GDD to the game folder... Continue running /godot-generate when done.",
			"info",
		);
		return { ...state, phase: Phase.PLAN };
	}

	// First time entering PLAN — send prompt to LLM to fill the GDD
	const templatePath = `${ctx.cwd}/template/GAME_DESIGN.md`;
	let gddTemplate = "(template not found)";
	try {
		const readResult = await pi.exec("cat", [templatePath], { cwd: ctx.cwd });
		if (readResult.code === 0) {
			gddTemplate = readResult.stdout;
		}
	} catch {
		// fallback
	}

	const prompt = [
		`## Game Design Document — ${state.gameName}`,
		``,
		`Your task is to create a complete Game Design Document for a ${state.gameType} game.`,
		``,
		`**Game Folder:** \\\`${state.gameName}/\\\``,
		`**Scope:** ${state.scope}`,
		`**Features:** ${state.features.join(", ")}`,
		``,
		`The template folder has already been copied to \\\`${state.gameName}/\\\`.`,
		`A stub \\\`GAME_DESIGN.md\\\` template is at \\\`template/GAME_DESIGN.md\\\`.`,
		``,
		`### Your Instructions`,
		``,
		`1. **Read** the template at \\\`template/GAME_DESIGN.md\\\``,
		`2. **Fill it out** by writing directly to \\\`${state.gameName}/GAME_DESIGN.md\\\` — replace every \\\`[placeholder]\\\` with concrete, specific details.`,
		`3. **Ask clarifying questions** as you go — I'll answer them to help you make good design decisions for this ${state.gameType} game.`,
		`4. Once the GDD is complete and you're satisfied with it, **tell me it's ready for review**.`,
		``,
		``,
		`Here is the template:`,
		``,
		"```",
		gddTemplate,
		"```",
	].join("\n");

	ctx.ui.notify("Asking LLM to fill out the Game Design Document...", "info");
	pi.sendUserMessage(prompt);

	// Stay in PLAN phase — mark that we've sent the prompt
	return { ...state, phase: Phase.PLAN, planText: "pending" };
}

async function handleReview(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	// Show the GDD to the user for editing/approval
	const gdd = await ctx.ui.editor(
		"Review the Game Design Document. Edit if needed, or submit as-is to approve.",
		state.planText,
	);
	if (gdd === undefined) {
		// User cancelled
		const action = await ctx.ui.select("Cancel workflow?", ["Go back", "Stop workflow"]);
		if (action === "Stop workflow") return { ...state, phase: Phase.DONE };
		return state;
	}

	state = { ...state, planText: gdd };

	const choice = await ctx.ui.select("What next?", [
		"GDD looks good — implement the game!",
		"Revise GDD (back to interactive planning)",
		"Cancel workflow",
	]);

	switch (choice) {
		case "GDD looks good — implement the game!":
			return { ...state, phase: Phase.IMPLEMENT };
		case "Revise GDD (back to interactive planning)":
			// Reset planText so PLAN phase re-sends the prompt
			return { ...state, phase: Phase.PLAN, planText: "" };
		default:
			return { ...state, phase: Phase.DONE };
	}
}

async function handleImplement(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	const gddPath = `${ctx.cwd}/${state.gameName}/GAME_DESIGN.md`;

	// First, save the approved GDD text to the game folder
	// The user may have edited it in the review editor, so write it back
	await pi.exec("bash", ["-c", `cat > "${gddPath}" << 'GDDEOF'\n${state.planText}\nGDDEOF`], {
		cwd: ctx.cwd,
		timeout: 5_000,
	});

	ctx.ui.notify(`GDD saved to ${state.gameName}/GAME_DESIGN.md`, "info");

	// Send a fresh-context implementation prompt
	const prompt = [
		`## Implement the Godot Game — ${state.gameName}`,
		``,
		`This is a fresh implementation task. Read the Game Design Document from the file and implement the game.`,
		``,
		`**Game folder:** \\\`${state.gameName}/\\\` (already set up from template with project.godot, icon, etc.)`,
		`**GDD:** \\\`${state.gameName}/GAME_DESIGN.md\\\` — Read this file for the full design specification.`,
		``,
		`### Instructions`,
		``,
		`1. **Read** the GDD at \\\`${state.gameName}/GAME_DESIGN.md\\\` to understand the game design.`,
		`2. **Create scenes and scripts** in \\\`${state.gameName}/\\\` to implement the game.`,
		`3. **Follow the GDD exactly** — match the controls, mechanics, entities, and UI described there.`,
		``,
	].join("\n");

	ctx.ui.notify("Asking LLM to implement the game from the GDD...", "info");
	pi.sendUserMessage(prompt);

	// Advance to VALIDATE phase — LLM will respond asynchronously
	return { ...state, phase: Phase.VALIDATE };
}

async function handleBuild(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Building for web...", "info");

	const result = await pi.exec("godot", [
		"--headless",
		"--export-debug",
		"Web",
		"export/debug/index.html",
		"--path", state.gameName,
	], { cwd: ctx.cwd, timeout: 300_000 });

	if (result.code !== 0) {
		const errorPreview = result.stderr.slice(0, 1000) || result.stdout.slice(0, 1000);
		ctx.ui.notify(`Web build failed (exit ${result.code})`, "error");

		const action = await ctx.ui.select("Build failed — what now?", [
			"Go back and fix issues",
			"Retry build",
			"Stop workflow",
		]);

		switch (action) {
			case "Go back and fix issues":
				state.retryCount++;
				if (state.retryCount > state.maxRetries) {
					ctx.ui.notify("Max retries exceeded. Stopping.", "error");
					return { ...state, phase: Phase.DONE };
				}
				return { ...state, phase: Phase.IMPLEMENT };
			case "Retry build":
				return state; // Loop back to BUILD
			default:
				return { ...state, phase: Phase.DONE };
		}
	}

	ctx.ui.notify("✅ Web build completed!", "info");
	return { ...state, phase: Phase.VERIFY };
}

async function handleVerify(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	const ok = await ctx.ui.confirm(
		"Build successful — does it look good?",
		"Check the output. If you need fixes, we'll go back to implementation.",
	);

	if (ok) {
		return { ...state, phase: Phase.COMMIT };
	}

	// Build not satisfactory — loop back to implement
	state.retryCount++;
	if (state.retryCount > state.maxRetries) {
		ctx.ui.notify("Max retries exceeded. Stopping workflow.", "error");
		return { ...state, phase: Phase.DONE };
	}

	const feedback = await ctx.ui.input(
		"What needs to be fixed? Describe the issue(s):",
		"",
	);
	if (feedback === undefined) return { ...state, phase: Phase.DONE };

	// Send feedback to LLM referencing the GDD
	const prompt = [
		`## Fix Issues — ${state.gameName}`,
		``,
		`The previous build had issues that need fixing. Continue implementing from the GDD.`,
		``,
		`**Game folder:** \\\`${state.gameName}/\\\``,
		`**GDD:** \\\`${state.gameName}/GAME_DESIGN.md\\\` (on disk — re-read it for full design details)`,
		``,
		`**Feedback:** ${feedback}`,
		``,
		`Fix the issues above, then validate with \\\`godot --headless --check-only --quit --quiet\\\`.`,
	].join("\n");

	ctx.ui.notify("Sending feedback to LLM for fixes...", "info");
	pi.sendUserMessage(prompt);

	return { ...state, phase: Phase.VALIDATE };
}

async function handleCommit(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Committing changes...", "info");

	const commitMessage = `Generate ${state.gameType} game: ${state.scope}`;

	// Add all files
	const addResult = await pi.exec("git", ["add", "-A"], { cwd: ctx.cwd, timeout: 10_000 });
	if (addResult.code !== 0) {
		ctx.ui.notify(`git add failed: ${addResult.stderr.slice(0, 200)}`, "error");
		const skip = await ctx.ui.confirm("Commit failed. Skip commit?", "");
		if (skip) return { ...state, phase: Phase.PUSH };
		return state; // Retry
	}

	// Check if there's anything to commit
	const statusResult = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd, timeout: 10_000 });
	if (!statusResult.stdout.trim()) {
		ctx.ui.notify("Nothing to commit — all changes already staged. Skipping commit.", "info");
		return { ...state, phase: Phase.PUSH };
	}

	// Commit
	const commitResult = await pi.exec("git", ["commit", "-m", commitMessage], {
		cwd: ctx.cwd,
		timeout: 10_000,
	});
	if (commitResult.code !== 0) {
		ctx.ui.notify(`git commit failed: ${commitResult.stderr.slice(0, 200)}`, "error");
		const skip = await ctx.ui.confirm("Commit failed. Skip commit and push?", "");
		if (skip) return { ...state, phase: Phase.PUSH };
		return state;
	}

	ctx.ui.notify(`✅ Committed: "${commitMessage}"`, "info");
	return { ...state, phase: Phase.PUSH };
}

async function handlePush(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Pushing to remote...", "info");

	const pushResult = await pi.exec("git", ["push"], { cwd: ctx.cwd, timeout: 30_000 });

	if (pushResult.code !== 0) {
		ctx.ui.notify(`git push failed: ${pushResult.stderr.slice(0, 300)}`, "error");
		const skip = await ctx.ui.confirm("Push failed. Skip?", "You can push manually later.");
		if (skip) return { ...state, phase: Phase.DONE };
		return state; // Retry
	}

	ctx.ui.notify("✅ Changes pushed to remote!", "info");
	return { ...state, phase: Phase.DONE };
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function godotWorkflowExtension(pi: ExtensionAPI): void {
	// ── /godot-generate: Full workflow ──
	pi.registerCommand("godot-generate", {
		description: "Start the full Godot generation workflow (questions → GDD → build → deploy)",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			// Load existing state or start fresh
			let state = loadState(ctx) ?? { ...DEFAULT_STATE };
			const action = await ctx.ui.select("🎮 Godot Workflow", [
				state.phase !== Phase.DONE
					? `Continue from "${PHASE_LABELS[state.phase]}"`
					: "",
				"Start fresh",
				"Cancel",
			].filter(Boolean));

			if (action === "Cancel" || !action) return;
			if (action === "Start fresh") state = { ...DEFAULT_STATE };

			persistState(pi, state);
			await runWorkflow(pi, ctx, state);
		},
	});

	// ── /godot-validate: Standalone validation (registered from validation.ts) ──
	registerValidationCommand(pi, pickGameFolder);

	// ── /godot-plan: Planning only ──
	pi.registerCommand("godot-plan", {
		description: "Planning phase only (questions + GDD creation/review)",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const state: WorkflowState = { ...DEFAULT_STATE, phase: Phase.QUESTIONS };

			// Run questions and setup phases
			const afterQuestions = await handleQuestions(ctx, state);
			if (afterQuestions.phase === Phase.DONE) return;

			persistState(pi, afterQuestions);

			// If questions advanced past SETUP, run setup too
			let currentState = afterQuestions;
			if (currentState.phase === Phase.SETUP) {
				currentState = await handleSetup(pi, ctx, currentState);
				if (currentState.phase === Phase.DONE) return;
				persistState(pi, currentState);
			}

			// Send the GDD prompt to LLM
			if (currentState.phase === Phase.PLAN) {
				await handlePlan(pi, ctx, currentState);
			}
		},
	});

	// ── /godot-state: Show current state ──
	pi.registerCommand("godot-state", {
		description: "Show current workflow state",
		handler: async (_args, ctx) => {
			const state = loadState(ctx);
			if (!state || state.phase === Phase.DONE) {
				ctx.ui.notify("No active Godot workflow. Use /godot-generate to start one.", "info");
				return;
			}

			const lines = [
				ctx.ui.theme.fg("accent", "🎮 Godot Workflow State"),
				ctx.ui.theme.fg("toolTitle", `  Phase:      ${state.phase}`),
				ctx.ui.theme.fg("text", `  Game type:  ${state.gameType}`),
				ctx.ui.theme.fg("text", `  Folder:     ${state.gameName || "(not yet set)"}`),
				ctx.ui.theme.fg("text", `  Scope:      ${state.scope}`),
				ctx.ui.theme.fg("muted", `  Features:   ${state.features.join(", ")}`),
				ctx.ui.theme.fg("muted", `  Retries:    ${state.retryCount}/${state.maxRetries}`),
			];
			ctx.ui.notify(lines.join("\n"), "info");

			const resume = await ctx.ui.confirm("Resume workflow?", "");
			if (resume) {
				persistState(pi, state);
				await runWorkflow(pi, ctx, state);
			}
		},
	});

	// ── /godot-implement-gdd: Implement directly from existing GDD ──
	pi.registerCommand("godot-implement-gdd", {
		description: "Implement a game directly from an existing GAME_DESIGN.md (skips questions/setup/plan/review)",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			// Resolve game folder: from argument or picker
			let gameFolder = args[0]?.trim() || "";
			if (!gameFolder) {
				const folders = await detectGameFolders(pi, ctx);
				if (folders.length === 0) {
					ctx.ui.notify(
						"No game folders with GAME_DESIGN.md found. Create one first, then run this command.",
						"error",
					);
					return;
				}
				const selected = await ctx.ui.select(
					"Select a game folder with GAME_DESIGN.md:",
					folders,
				);
				if (!selected || selected === "Cancel") return;
				gameFolder = selected;
			}

			const gddPath = `${ctx.cwd}/${gameFolder}/GAME_DESIGN.md`;

			// Verify the GDD exists
			const existsResult = await pi.exec("test", ["-f", gddPath], { cwd: ctx.cwd });
			if (existsResult.code !== 0) {
				ctx.ui.notify(
					`${gameFolder}/GAME_DESIGN.md not found. Point this at a folder containing a completed GDD.`,
					"error",
				);
				return;
			}

			// Read the GDD
			const readResult = await pi.exec("cat", [gddPath], { cwd: ctx.cwd });
			if (readResult.code !== 0) {
				ctx.ui.notify(`Failed to read ${gameFolder}/GAME_DESIGN.md`, "error");
				return;
			}
			const gddContent = readResult.stdout;

			// Show preview and confirm
			const preview = gddContent.split("\n").slice(0, 20).join("\n");
			const ok = await ctx.ui.confirm(
				`Implement from "${gameFolder}/GAME_DESIGN.md"?`,
				`The full workflow (validate → build → commit → push) will run after implementation.\n\n--- Preview (first 20 lines) ---\n${preview}`,
			);
			if (!ok) return;

			// Create a workflow state that jumps straight to IMPLEMENT
			const state: WorkflowState = {
				...DEFAULT_STATE,
				phase: Phase.IMPLEMENT,
				gameName: gameFolder,
				gameType: gameFolder,
				scope: "implemented from existing GDD",
				features: [],
				planText: gddContent,
				retryCount: 0,
				maxRetries: 3,
			};

			persistState(pi, state);
			await runWorkflow(pi, ctx, state);
		},
	});

	// ── /godot-tweak: Quick tweak pipeline ──
	pi.registerCommand("godot-tweak", {
		description: "Quick tweak: pick a game, describe the change, then run validate → build → verify → commit → push",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const gameFolder = await pickGameFolder(pi, ctx, args);
			if (!gameFolder) return;

			const gddPath = `${ctx.cwd}/${gameFolder}/GAME_DESIGN.md`;
			const gddExists = await pi.exec("test", ["-f", gddPath], { cwd: ctx.cwd });
			let gddContent = "(no GDD found)";
			if (gddExists.code === 0) {
				const readResult = await pi.exec("cat", [gddPath], { cwd: ctx.cwd });
				if (readResult.code === 0) gddContent = readResult.stdout;
			}

			const tweakDesc = await ctx.ui.input(
				"What needs to change? Describe the tweak:",
				"",
			);
			if (tweakDesc === undefined || !tweakDesc.trim()) {
				ctx.ui.notify("No tweak described. Cancelling.", "info");
				return;
			}

			// Create state that starts at VALIDATE after LLM implements the tweak
			const state: WorkflowState = {
				...DEFAULT_STATE,
				phase: Phase.IMPLEMENT,
				gameName: gameFolder,
				gameType: gameFolder,
				scope: `tweak: ${tweakDesc}`,
				features: [],
				planText: gddContent,
				retryCount: 0,
				maxRetries: 3,
			};

			persistState(pi, state);

			const prompt = [
				`## Quick Tweak — ${gameFolder}`,
				``,
				`This is a small adjustment to an existing game.`,
				``,
				`**Game folder:** \`${gameFolder}/\``,
				`**GDD:** \`${gameFolder}/GAME_DESIGN.md\` (on disk — read it for context)`,
				``,
				`### Tweak Request`,
				tweakDesc,
				``,
				`### Instructions`,
				`1. Read the GDD at \`${gameFolder}/GAME_DESIGN.md\` for context.`,
				`2. Make the described change by editing scenes and scripts in \`${gameFolder}/\`.`,
				`3. Keep existing functionality intact — only change what's needed.`,
				`4. Once done, validate locally with \`godot --path ${gameFolder} --headless --check-only --quit --quiet\`.`,
				`5. Tell me the tweak is complete.`,
			].join("\n");

			ctx.ui.notify(`Sending tweak request for "${gameFolder}" to LLM...`, "info");
			pi.sendUserMessage(prompt);

			// The LLM responds asynchronously; advance to VALIDATE phase
			state.phase = Phase.VALIDATE;
			persistState(pi, state);
		},
	});

	// ── /godot-build: Standalone web build ──
	pi.registerCommand("godot-build", {
		description: "Run a web build for a game folder",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const gameFolder = await pickGameFolder(pi, ctx, args);
			if (!gameFolder) return;

			ctx.ui.notify(`Building "${gameFolder}" for web...`, "info");

			const result = await pi.exec("godot", [
				"--headless",
				"--export-debug",
				"Web",
				"export/debug/index.html",
				"--path", gameFolder,
			], { cwd: ctx.cwd, timeout: 300_000 });

			if (result.code !== 0) {
				const errorPreview = result.stderr.slice(0, 1000) || result.stdout.slice(0, 1000);
				ctx.ui.notify(`❌ Web build failed (exit ${result.code})`, "error");
				ctx.ui.notify(errorPreview, "error");
				return;
			}

			ctx.ui.notify(`✅ "${gameFolder}" web build completed!`, "info");
		},
	});

	// ── /godot-verify: Standalone build verification ──
	pi.registerCommand("godot-verify", {
		description: "Verify a completed build looks good",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const ok = await ctx.ui.confirm(
				"Build verification",
				"Does the build output look good? If not, describe what needs fixing.",
			);

			if (ok) {
				ctx.ui.notify("✅ Build verified!", "info");
			} else {
				ctx.ui.notify("Build needs fixes. Use /godot-tweak to describe changes.", "info");
			}
		},
	});

	// ── /godot-commit: Standalone git commit ──
	pi.registerCommand("godot-commit", {
		description: "Commit all staged changes",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			ctx.ui.notify("Committing changes...", "info");

			const addResult = await pi.exec("git", ["add", "-A"], { cwd: ctx.cwd, timeout: 10_000 });
			if (addResult.code !== 0) {
				ctx.ui.notify(`git add failed: ${addResult.stderr.slice(0, 200)}`, "error");
				return;
			}

			const statusResult = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd, timeout: 10_000 });
			if (!statusResult.stdout.trim()) {
				ctx.ui.notify("Nothing to commit — working tree clean.", "info");
				return;
			}

			const commitResult = await pi.exec("git", ["commit", "-m", "godot: tweak"], {
				cwd: ctx.cwd,
				timeout: 10_000,
			});

			if (commitResult.code !== 0) {
				ctx.ui.notify(`git commit failed: ${commitResult.stderr.slice(0, 200)}`, "error");
				return;
			}

			ctx.ui.notify("✅ Committed.", "info");
		},
	});

	// ── /godot-push: Standalone git push ──
	pi.registerCommand("godot-push", {
		description: "Push to remote",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			ctx.ui.notify("Pushing to remote...", "info");

			const pushResult = await pi.exec("git", ["push"], { cwd: ctx.cwd, timeout: 30_000 });

			if (pushResult.code !== 0) {
				ctx.ui.notify(`git push failed: ${pushResult.stderr.slice(0, 300)}`, "error");
				return;
			}

			ctx.ui.notify("✅ Pushed to remote!", "info");
		},
	});

	// ── Persist on every turn end for crash recovery ──
	pi.on("turn_end", (_event, ctx) => {
		const state = loadState(ctx);
		if (state && state.phase !== Phase.DONE) {
			persistState(pi, state);
		}
	});
}