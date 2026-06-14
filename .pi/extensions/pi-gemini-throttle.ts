import type { ExtensionAPI } from "@earendil-works/pi-coding-agent/extensibility";

export default function throttleExtension(pi: ExtensionAPI) {
  pi.on("before_provider_request", async (_event, ctx) => {
    try {
        if (ctx.model.id.toLowerCase().includes("gemini")) {
            ctx.ui.notify("[THROTTLE] match" , "info")
            ctx.ui.setStatus("throttle", "⏳ Gemini Rate-Limiting: Pausing for 12s...");

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    } catch (err) {
      console.error("[THROTTLE] error", err);
    } finally {
        ctx.ui.setStatus("throttle", "");
    }
  });
}