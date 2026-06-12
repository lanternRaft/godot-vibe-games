/**
 * Godot Workflow Extension
 *
 * A deterministic multi-step workflow for generating Godot games.
 * Orchestrates planning, implementation, validation, building, and deployment.
 *
 * Commands:
 *   /godot-generate    - Start the full workflow (questions → plan → build → deploy)
 *   /godot-plan        - Planning phase only (questions + plan creation/review)
 *   /godot-state       - Show current workflow state
 *
 * State Machine Phases:
 *   QUESTIONS  →  PLAN  →  REVIEW  →  SETUP  →  IMPLEMENT  →  VALIDATE  →  BUILD  →  VERIFY  →  COMMIT  →  PUSH  →  DONE
 *                                                                             │
 *                                (VERIFY fails) ◄─────────────────────────────┘
 *                                                                             │
 *                                (REVIEW refines) ◄───────────────────────────┘
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

// ── Types ────────────────────────────────────────────────────────────────────

/** Phases of the godot generation workflow */
enum Phase {
	QUESTIONS = "questions",
	PLAN = "plan",
	REVIEW = "review",
	SETUP = "setup",
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
	scope: string;
	features: string[];
	planText: string;
	retryCount: number;
	maxRetries: number;
}

const DEFAULT_STATE: WorkflowState = {
	phase: Phase.QUESTIONS,
	gameType: "",
	scope: "",
	features: [],
	planText: "",
	retryCount: 0,
	maxRetries: 3,
};

// ── UI labels for phase steps ────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
	[Phase.QUESTIONS]: "Ask clarifying questions",
	[Phase.PLAN]: "Create plan",
	[Phase.REVIEW]: "Review and refine plan",
	[Phase.SETUP]: "Copy template script",
	[Phase.IMPLEMENT]: "Make changes from plan",
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
		ctx.ui.theme.fg("dim", `Type: ${state.gameType || "TBD"}  |  Scope: ${state.scope || "TBD"}`),
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
			case Phase.PLAN:
				state = await handlePlan(pi, ctx, state);
				// After sending plan message, we return control — the LLM responds asynchronously
				return;
			case Phase.REVIEW:
				state = await handleReview(ctx, state);
				break;
			case Phase.SETUP:
				state = await handleSetup(ctx, state);
				break;
			case Phase.IMPLEMENT:
				state = await handleImplement(pi, ctx, state);
				// After sending implement message, we return control — the LLM responds asynchronously
				return;
			case Phase.VALIDATE:
				state = await handleValidate(ctx, state);
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

// ── Phase handlers ───────────────────────────────────────────────────────────

async function handleQuestions(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Let's gather details for your Godot game.", "info");

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
		"Proceed with plan?",
		`Game: ${state.gameType}\nScope: ${state.scope}\nFeatures: ${state.features.join(", ")}`,
	);
	if (!ok) return state; // Loop back to questions

	return { ...state, phase: Phase.PLAN };
}

async function handlePlan(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	// Delegate plan creation to the LLM
	const prompt = [
		`## Godot Game Generation Plan`,
		``,
		`Create a detailed numbered plan for generating a new Godot 4 game.`,
		``,
		`**Game Type:** ${state.gameType}`,
		`**Scope:** ${state.scope}`,
		`**Features:** ${state.features.join(", ")}`,
		``,
		`Read the project README and docs/ first. Then output a plan under a "Plan:" header:`,
		``,
		`Plan:`,
		`1. Analyze existing project structure and templates`,
		`2. Copy relevant template`,
		`3. Set up scenes and scripts for ${state.gameType}`,
		`4. Implement core mechanics`,
		`5. Add features: ${state.features.join(", ")}`,
		`6. Validate with godot`,
		`7. Build for web`,
		`8. Verify build`,
		``,
		`After completing each step during implementation, mark it with [DONE:n].`,
		``,
		`First, read the project README and docs/, then output your plan.`,
	].join("\n");

	ctx.ui.notify("Asking LLM to create a plan...", "info");
	pi.sendUserMessage(prompt);

	// Move to REVIEW phase — will be picked up after LLM responds
	return { ...state, phase: Phase.REVIEW };
}

async function handleReview(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	// Show the plan to the user for editing/approval
	const plan = await ctx.ui.editor(
		"Review the plan. Edit if needed, or submit as-is to approve.",
		state.planText,
	);
	if (plan === undefined) {
		// User cancelled
		const action = await ctx.ui.select("Cancel workflow?", ["Go back", "Stop workflow"]);
		if (action === "Stop workflow") return { ...state, phase: Phase.DONE };
		return state;
	}

	state = { ...state, planText: plan };

	const choice = await ctx.ui.select("What next?", [
		"Looks good, proceed!",
		"Refine the plan further",
		"Cancel workflow",
	]);

	switch (choice) {
		case "Looks good, proceed!":
			return { ...state, phase: Phase.SETUP };
		case "Refine the plan further":
			return { ...state, phase: Phase.PLAN };
		default:
			return { ...state, phase: Phase.DONE };
	}
}

async function handleSetup(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Running template copy script...", "info");

	// Check if there's a template script to run
	const hasScript = await checkFileExists(ctx, "scripts/copy-template.sh");

	if (hasScript) {
		const result = await pi.exec("bash", ["scripts/copy-template.sh"], {
			cwd: ctx.cwd,
			timeout: 30_000,
		});

		if (result.code !== 0) {
			ctx.ui.notify(`Template script failed (exit ${result.code}): ${result.stderr.slice(0, 200)}`, "error");
			const retry = await ctx.ui.confirm("Template script failed. Retry?", "Check the output and try again");
			if (!retry) {
				const action = await ctx.ui.select("What next?", ["Skip setup step", "Stop workflow"]);
				if (action === "Stop workflow") return { ...state, phase: Phase.DONE };
			} else {
				return state; // Loop back to SETUP
			}
		}
		ctx.ui.notify("Template script completed successfully.", "info");
	} else {
		ctx.ui.notify("No template copy script found (scripts/copy-template.sh). Skipping.", "info");
	}

	return { ...state, phase: Phase.IMPLEMENT };
}

async function handleImplement(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	// Delegate implementation to the LLM with the approved plan
	const prompt = [
		`## Implement the Godot Game`,
		``,
		`Execute the following plan step by step. Mark completed steps with [DONE:n].`,
		``,
		state.planText,
		``,
		`The project is at ${ctx.cwd}.`,
		`After making changes, tell me which steps you completed.`,
	].join("\n");

	ctx.ui.notify("Asking LLM to implement changes...", "info");
	pi.sendUserMessage(prompt);

	// Advance to VALIDATE phase — LLM will respond asynchronously
	return { ...state, phase: Phase.VALIDATE };
}

async function handleValidate(
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	ctx.ui.notify("Running Godot validation...", "info");

	const result = await pi.exec("godot", ["--headless", "--check-only", "--quit", "--quiet"], { cwd: ctx.cwd, timeout: 120_000 });

	if (result.code !== 0) {
		const stderr = result.stderr.split("\n").filter(l => !l.includes("ObjectDB instances leaked at exit")).join("\n");
		const stdout = result.stdout.split("\n").filter(l => !l.includes("ObjectDB instances leaked at exit")).join("\n");
		const errorPreview = stderr.slice(0, 1000) || stdout.slice(0, 1000);
		ctx.ui.notify(`Validation failed (exit ${result.code})`, "error");

		const action = await ctx.ui.select("Validation error — what now?", [
			"Go back and fix issues",
			"Retry validation",
			"Skip validation and continue",
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
			case "Retry validation":
				return state; // Loop back to VALIDATE
			case "Skip validation and continue":
				return { ...state, phase: Phase.BUILD };
			default:
				return { ...state, phase: Phase.DONE };
		}
	}

	ctx.ui.notify("✅ Validation passed!", "info");
	return { ...state, phase: Phase.BUILD };
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

	// Store feedback for the implementation phase
	const prompt = [
		`## Fix Issues`,
		``,
		`The previous build had issues that need fixing:`,
		``,
		feedback,
		``,
		`Continue executing the plan and fix these issues.`,
		``,
		state.planText,
	].join("\n");

	ctx.ui.notify("Sending feedback to LLM for fixes...", "info");
	// Send the feedback to the LLM directly
	pi.sendUserMessage(prompt);

	// Keep phase as IMPLEMENT for next loop iteration — the LLM will respond
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

// ── Helper ───────────────────────────────────────────────────────────────────

async function checkFileExists(ctx: ExtensionCommandContext, path: string): Promise<boolean> {
	const result = await pi.exec("test", ["-f", path], { cwd: ctx.cwd });
	return result.code === 0;
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function godotWorkflowExtension(pi: ExtensionAPI): void {
	// ── /godot-generate: Full workflow ──
	pi.registerCommand("godot-generate", {
		description: "Start the full Godot generation workflow (questions → plan → build → deploy)",
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

	// ── /godot-plan: Planning only ──
	pi.registerCommand("godot-plan", {
		description: "Planning phase only (questions + plan creation/review)",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const state: WorkflowState = { ...DEFAULT_STATE, phase: Phase.QUESTIONS };

			// Run questions and plan phases
			const afterQuestions = await handleQuestions(ctx, state);
			if (afterQuestions.phase === Phase.DONE) return;

			persistState(pi, afterQuestions);

			// Send the plan prompt to LLM
			await handlePlan(pi, ctx, afterQuestions);
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
				ctx.ui.theme.fg("text", `  Game:       ${state.gameType}`),
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

	// ── Persist on every turn end for crash recovery ──
	pi.on("turn_end", (_event, ctx) => {
		const state = loadState(ctx);
		if (state && state.phase !== Phase.DONE) {
			persistState(pi, state);
		}
	});
}