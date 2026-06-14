/**
 * Godot Validation Module
 *
 * Provides validation utilities for Godot games: running godot --headless --check-only,
 * the validate phase handler for the workflow state machine, and the /godot-validate command.
 *
 * This module intentionally avoids importing from index.ts to prevent circular dependencies.
 * Types are mirrored locally where needed; they remain structurally compatible at runtime.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ── Mirrored types (structurally compatible with index.ts) ───────────────────

/** Phases used by validation handling (subset of the full workflow Phase enum) */
enum Phase {
	VALIDATE = "validate",
	BUILD = "build",
	IMPLEMENT = "implement",
	DONE = "done",
}

/** Persisted workflow state — fields accessed by handleValidate (mirrored from index.ts) */
interface WorkflowState {
	phase: string;
	gameName: string;
	retryCount: number;
	maxRetries: number;
	[key: string]: unknown;
}

// ── Exported types ────────────────────────────────────────────────────────────

/** Result of running godot validation */
export interface ValidationResult {
	success: boolean;
	exitCode: number;
	errorPreview: string;
}

/** Dependencies injected for state-machine-coupled functions */
export interface ValidationDeps {
	pickGameFolder(
		pi: ExtensionAPI,
		ctx: ExtensionCommandContext,
		args: string[],
	): Promise<string | null>;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Strip repetitive Godot engine warnings from output */
function stripLeakedObjectDB(text: string): string {
	return text
		.split("\n")
		.filter((l) => !l.includes("ObjectDB instances leaked at exit"))
		.join("\n");
}

/**
 * Run godot validation for a given game folder.
 * Returns structured result with success, exitCode, and errorPreview.
 */
export async function runValidation(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	gameFolder: string,
): Promise<ValidationResult> {
	const result = await pi.exec(
		"godot",
		["--headless", "--check-only", "--quiet", "--quit", "--path", gameFolder],
		{ cwd: ctx.cwd, timeout: 120_000 },
	);

	const stderr = stripLeakedObjectDB(result.stderr);
	const stdout = stripLeakedObjectDB(result.stdout);
	const errorPreview = stderr.slice(0, 1000) || stdout.slice(0, 1000);

	return { success: result.code === 0, exitCode: result.code, errorPreview };
}

/** Display validation error notification and preview */
function notifyValidationError(
	ui: ExtensionCommandContext["ui"],
	exitCode: number,
	errorPreview: string,
): void {
	ui.notify(`❌ Validation failed (exit ${exitCode})`, "error");
	if (errorPreview) ui.notify(errorPreview, "error");
}

// ── State machine phase handler ──────────────────────────────────────────────

/**
 * Handle the VALIDATE phase of the workflow state machine.
 * Runs validation and presents choices on failure/success.
 * `deps` provides the pickGameFolder utility from the workflow module.
 */
export async function handleValidate(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
	_deps: ValidationDeps,
): Promise<WorkflowState> {
	ctx.ui.notify("Running Godot validation...", "info");

	const { success, exitCode, errorPreview } = await runValidation(pi, ctx, state.gameName);

	if (!success) {
		notifyValidationError(ctx.ui, exitCode, errorPreview);

		const action = await ctx.ui.select("Validation error — what now?", [
			"Go back and fix issues",
			"Retry validation",
			"Skip validation and continue",
			"Stop workflow",
		]);

		switch (action) {
			case "Go back and fix issues":
				if (state.retryCount + 1 > state.maxRetries) {
					ctx.ui.notify("Max retries exceeded. Stopping.", "error");
					return { ...state, phase: Phase.DONE };
				}
				return { ...state, retryCount: state.retryCount + 1, phase: Phase.IMPLEMENT };
			case "Retry validation":
				return state; // Loop back to VALIDATE
			case "Skip validation and continue":
				return { ...state, phase: Phase.BUILD };
			default:
				return { ...state, phase: Phase.DONE };
		}
	}

	ctx.ui.notify("✅ Validation passed!", "success");
	return { ...state, phase: Phase.BUILD };
}

// ── Command registration ─────────────────────────────────────────────────────

/**
 * Register the standalone /godot-validate command.
 * `pickGameFolder` is injected to avoid circular imports with the workflow module.
 */
export function registerValidationCommand(
	pi: ExtensionAPI,
	pickGameFolder: ValidationDeps["pickGameFolder"],
): void {
	pi.registerCommand("godot-validate", {
		description: "Run Godot validation on a game folder (godot --headless --check-only)",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const gameFolder = await pickGameFolder(pi, ctx, args);
			if (!gameFolder) return;

			ctx.ui.notify(
				`Validating "${gameFolder}" with godot --headless --check-only --quit --quiet`,
				"info",
			);

			const { success, exitCode, errorPreview } = await runValidation(pi, ctx, gameFolder);

			if (!success) {
				notifyValidationError(ctx.ui, exitCode, errorPreview);
				return;
			}

			ctx.ui.notify(`✅ "${gameFolder}" validation passed!`, "success");
		},
	});
}