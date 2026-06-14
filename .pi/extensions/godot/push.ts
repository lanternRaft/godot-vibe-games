/**
 * Godot Push Module
 *
 * Provides git push utilities: pushing to the remote and the /godot-push command.
 *
 * This module intentionally avoids importing from index.ts to prevent circular dependencies.
 * Types are mirrored locally where needed; they remain structurally compatible at runtime.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ── Mirrored types (structurally compatible with index.ts) ───────────────────

/** Phases used by push handling (subset of the full workflow Phase enum) */
enum Phase {
	PUSH = "push",
	DONE = "done",
}

/** Persisted workflow state — fields accessed by handlePush (mirrored from index.ts) */
interface WorkflowState {
	phase: string;
	gameName: string;
	retryCount: number;
	maxRetries: number;
	[key: string]: unknown;
}

// ── Workflow state machine step handler ───────────────────────────────────────

/**
 * Handle the PUSH phase of the workflow state machine.
 * Runs `git push` in the project root and advances to DONE on success.
 * On failure, offers to skip (still advance to DONE) or retry.
 */
export async function handlePush(
	pi: ExtensionAPI,
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

// ── Command registration ─────────────────────────────────────────────────────

/**
 * Register the standalone /godot-push command.
 * Pushes the current branch to the remote.
 */
export function registerPushCommand(pi: ExtensionAPI): void {
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
}