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
 * Convert res:// paths in error output to relative filesystem paths.
 * Replaces "res://" with "<gameFolder>/" so that LLMs can read the
 * referenced files directly (e.g., "res://scripts/snake.gd" becomes
 * "snake/scripts/snake.gd").
 */
function convertResPath(text: string, gameFolder: string): string {
	return text.replace(/res:\/\//g, `${gameFolder}/`);
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
	const errorPreview = convertResPath(
		stderr.slice(0, 1000) || stdout.slice(0, 1000),
		gameFolder,
	);

	return { success: stderr.length == 0, exitCode: result.code, errorPreview };
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

// ── Unified check-and-fix loop ───────────────────────────────────────────────

/**
 * Run validation and loop continuously. 
 * Automatically asks the model to fix issues up to 3 times.
 * If it still fails, prompts the user for feedback and continues 
 * looping until validation passes or the user explicitly exits.
 */
export async function handleValidation(
    pi: ExtensionAPI,
    ctx: ExtensionCommandContext,
    gameFolder: string,
): Promise<ValidationResult> {
    let attempt = 1;
    const MAX_AUTO_RETRIES = 3;

    while (true) {
        ctx.ui.notify(`Running Godot validation... (Attempt ${attempt})`, "info");

        const result = await runValidation(pi, ctx, gameFolder);

        if (result.success) {
            ctx.ui.notify("✅ Validation passed!", "success");
            return result;
        }

        // Validation Failed
        notifyValidationError(ctx.ui, result.exitCode, result.errorPreview);

        if (attempt <= MAX_AUTO_RETRIES) {
            ctx.ui.notify(`Asking the model to fix the validation errors (Attempt ${attempt}/${MAX_AUTO_RETRIES})…`, "info");

            await pi.sendUserMessage(
                [
                    {
                        type: "text",
                        text: `Godot validation failed for "${gameFolder}".`
                    },
                    {
                        type: "text",
                        text: `Errors:\n\n${result.errorPreview || "(no error output)"}\n\n`
                    },
                ],
                { deliverAs: "followUp" },
            );

            // Wait for the model to finish its turn before looping back to runValidation
            await ctx.waitForIdle();
        } else {
            // Fails after 3 tries: pause and wait for user feedback
            // Adjust `ctx.ui.prompt` if your UI API uses a different method name for text inputs
            const userFeedback = await ctx.ui.prompt(
                "Validation failed 3 times. Please provide guidance for the model to help it fix the issue, or type 'exit' to abort:"
            );

            // If user cancels the prompt or types 'exit', break the cycle
            if (!userFeedback || userFeedback.trim().toLowerCase() === "exit") {
                ctx.ui.notify("Validation loop aborted by user.", "info");
                return result; 
            }

            ctx.ui.notify("Forwarding your feedback to the model...", "info");

            await pi.sendUserMessage(
                [
                    {
                        type: "text",
                        text: `Validation is still failing for "${gameFolder}". The user has provided the following guidance to help you:`
                    },
                    {
                        type: "text",
                        text: userFeedback
                    },
                    {
                        type: "text",
                        text: `Implement these suggestions`
                    }
                ],
                { deliverAs: "followUp" },
            );

            // Wait for the model to apply the user's feedback before looping back
            await ctx.waitForIdle();
        }

        attempt++;
    }
}
// ── Workflow state machine step handler ───────────────────────────────────────

/**
 * Handle the VALIDATE phase of the workflow state machine.
 * Delegates the actual check-and-fix to handleValidation, then
 * manages phase transitions via user selection.
 *
 * `deps` provides the pickGameFolder utility from the workflow module.
 */
export async function handleValidationStep(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
	_deps: ValidationDeps,
): Promise<WorkflowState> {
	const { success } = await handleValidation(pi, ctx, state.gameName);

	if (!success) {
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

	return { ...state, phase: Phase.BUILD };
}

// ── Command registration ─────────────────────────────────────────────────────

/**
 * Register the standalone /godot-validate command.
 * Uses handleValidation so the model is asked to fix any issues found.
 * `pickGameFolder` is injected to avoid circular imports with the workflow module.
 */
export function registerValidationCommand(
	pi: ExtensionAPI,
	pickGameFolder: ValidationDeps["pickGameFolder"],
): void {
	pi.registerCommand("godot-validate", {
		description:
			"Run Godot validation on a game folder (godot --headless --check-only) and ask the model to fix any issues",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const gameFolder = await pickGameFolder(pi, ctx, args);
			if (!gameFolder) return;

			await handleValidation(pi, ctx, gameFolder);
		},
	});
}