/**
 * Godot Commit Module
 *
 * Provides git commit utilities: staging all changes, checking status,
 * committing with a workflow-derived message, and the /godot-commit command.
 *
 * This module intentionally avoids importing from index.ts to prevent circular dependencies.
 * Types are mirrored locally where needed; they remain structurally compatible at runtime.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ── Mirrored types (structurally compatible with index.ts) ───────────────────

/** Phases used by commit handling (subset of the full workflow Phase enum) */
enum Phase {
	COMMIT = "commit",
	PUSH = "push",
	DONE = "done",
}

/** Persisted workflow state — fields accessed by handleCommit (mirrored from index.ts) */
interface WorkflowState {
	phase: string;
	gameName: string;
	gameType: string;
	scope: string;
	retryCount: number;
	maxRetries: number;
	[key: string]: unknown;
}

// ── Workflow state machine step handler ───────────────────────────────────────

/**
 * Handle the COMMIT phase of the workflow state machine.
 * Stages all changes, checks for anything to commit, and commits
 * with a message derived from the game type and scope.
 * Advances to PUSH phase on success; offers retry or skip on failure.
 */
export async function handleCommit(
	pi: ExtensionAPI,
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

// ── Command registration ─────────────────────────────────────────────────────

/**
 * Register the standalone /godot-commit command.
 * Stages all changes and commits with a default message.
 */
export function registerCommitCommand(pi: ExtensionAPI): void {
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
}