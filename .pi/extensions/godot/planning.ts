/**
 * Godot Planning Module
 *
 * Handles the PLAN phase: creating and reviewing the Game Design Document.
 * This combines GDD generation (LLM prompt) and review (interactive editor)
 * into a single stage of the workflow.
 *
 * This module intentionally avoids importing from index.ts to prevent circular dependencies.
 * Types are mirrored locally where needed; they remain structurally compatible at runtime.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ── Mirrored types (structurally compatible with index.ts) ───────────────────

/** Phases used by planning (subset of the full workflow Phase enum) */
enum Phase {
	PLAN = "plan",
	IMPLEMENT = "implement",
	DONE = "done",
}

/** Persisted workflow state — fields accessed by handlePlanning (mirrored from index.ts) */
interface WorkflowState {
	phase: string;
	gameName: string;
	gameType: string;
	scope: string;
	features: string[];
	/** During PLAN: "pending" if prompt sent but GDD not yet written, or the GDD text for editing. */
	planText: string;
	retryCount: number;
	maxRetries: number;
	[key: string]: unknown;
}

// ── Workflow state machine step handler ───────────────────────────────────────

/**
 * Handle the PLAN phase of the workflow state machine.
 *
 * This single stage combines GDD creation (sending a prompt to the LLM)
 * and review (showing the result in an interactive editor for approval).
 *
 * Flow:
 * 1. If GDD already exists on disk → read it, show editor for review/approval
 * 2. If prompt already sent (planText === "pending") → give user options to
 *    check disk again, paste the LLM's chat response as the GDD, or re-send
 * 3. First time → send prompt to LLM to fill out the GDD template
 *
 * On approval, advances to IMPLEMENT. On revision, re-sends the prompt.
 */
export async function handlePlanning(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
	const gddPath = `${ctx.cwd}/${state.gameName}/GAME_DESIGN.md`;

	// Check if GDD has already been written to the game folder
	const gddExists = await pi.exec("test", ["-f", gddPath], { cwd: ctx.cwd });
	if (gddExists.code === 0) {
		// GDD exists — read it and show for review
		const readResult = await pi.exec("cat", [gddPath], { cwd: ctx.cwd });
		const gddContent = readResult.code === 0 ? readResult.stdout : "(could not read GDD)";
		ctx.ui.notify("GDD found in game folder! Ready for review.", "info");

		return await handleReview(ctx, { ...state, planText: gddContent });
	}

	// If we already sent the prompt (planText === "pending"), give actionable options
	if (state.planText === "pending") {
		const action = await ctx.ui.select(
			"⏳ The LLM was asked to write the GDD. What now?",
			[
				"Check disk again (LLM may have written the file)",
				"Paste GDD from LLM's chat response",
				"Re-send the GDD prompt",
				"Stop workflow",
			],
		);

		switch (action) {
			case "Check disk again (LLM may have written the file)": {
				// Re-check if the LLM wrote the file since we last looked
				const recheck = await pi.exec("test", ["-f", gddPath], { cwd: ctx.cwd });
				if (recheck.code === 0) {
					const readResult = await pi.exec("cat", [gddPath], { cwd: ctx.cwd });
					const gddContent = readResult.code === 0 ? readResult.stdout : "(could not read GDD)";
					ctx.ui.notify("GDD found on disk! Ready for review.", "info");
					return await handleReview(ctx, { ...state, planText: gddContent });
				}
				ctx.ui.notify("GDD not yet written to disk. Try another option.", "warning");
				// Fall through — re-prompt the user by returning to PLAN with pending still set
				return { ...state, phase: Phase.PLAN };
			}
			case "Paste GDD from LLM's chat response": {
				// The LLM responded in chat with the GDD content. Let the user paste it.
				const gddText = await ctx.ui.editor(
					"Paste the GDD content the LLM wrote in chat. You can also edit it here before saving.",
					"",
				);
				if (gddText === undefined || !gddText.trim()) {
					ctx.ui.notify("No GDD content provided. Returning to planning.", "warning");
					return { ...state, phase: Phase.PLAN, planText: "pending" };
				}
				// Write the pasted content to disk
				await pi.exec("bash", ["-c", `cat > "${gddPath}" << 'GDDEOF'
${gddText}
GDDEOF`], {
					cwd: ctx.cwd,
					timeout: 5_000,
				});
				ctx.ui.notify(`GDD saved to ${state.gameName}/GAME_DESIGN.md`, "info");
				return await handleReview(ctx, { ...state, planText: gddText });
			}
			case "Re-send the GDD prompt": {
				// Reset and re-send
				return await sendGddPrompt(pi, ctx, { ...state, planText: "" });
			}
			default:
				return { ...state, phase: Phase.DONE };
		}
	}

	// First time entering PLAN — send prompt to LLM to fill the GDD
	return await sendGddPrompt(pi, ctx, state);
}

// ── Internal prompt helper ──────────────────────────────────────────────────

/**
 * Read the template and send a prompt asking the LLM to write the GDD to disk.
 * Uses the `write` tool (available to the pi agent) to save the file.
 *
 * @returns State with planText="pending".
 */
async function sendGddPrompt(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	state: WorkflowState,
): Promise<WorkflowState> {
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
		"",
		`Your task is to create a complete Game Design Document for a ${state.gameType} game.`,
		"",
		`**Game Folder:** \`${state.gameName}/\``,
		`**Scope:** ${state.scope}`,
		`**Features:** ${state.features.join(", ")}`,
		"",
		`The template folder has already been copied to \`${state.gameName}/\`.`,
		"",
		"### Your Instructions",
		"",
		`1. **Read** the template at \`template/GAME_DESIGN.md\` in the project root.`,
		`2. **Use the write tool to save the filled-out GDD to** \`${state.gameName}/GAME_DESIGN.md\` — replace every \`[placeholder]\` with concrete, specific details. Do NOT just respond in chat; write the file to disk using your write tool.`,
		`3. **Ask clarifying questions** as you go — I'll answer them to help you make good design decisions for this ${state.gameType} game.`,
		"4. Once the GDD is complete and you've written it to disk, **tell me it's ready for review**. Then I (or the user) will run the command again to pick up the file and proceed.",
		"",
		"",
		"Here is the template:",
		"",
		"```",
		gddTemplate,
		"```",
	].join("\n");

	ctx.ui.notify("Asking LLM to fill out the Game Design Document...", "info");
	pi.sendUserMessage(prompt);

	// Stay in PLAN phase — mark that we've sent the prompt
	return { ...state, phase: Phase.PLAN, planText: "pending" };
}

// ── Internal review helper ───────────────────────────────────────────────────

/**
 * Show the GDD in an interactive editor for review and approval.
 * Called by handlePlanning when a GDD already exists on disk.
 *
 * On approval, advances to IMPLEMENT.
 * On revision, resets planText so the next call re-sends the prompt.
 */
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
		// User cancelled the editor
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
			// Reset planText so next entry re-sends the prompt
			return { ...state, phase: Phase.PLAN, planText: "" };
		default:
			return { ...state, phase: Phase.DONE };
	}
}