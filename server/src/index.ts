import { config } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();
app.listen(config.port, () => {
  console.log(`VISTORA API listening on http://localhost:${config.port}`);
  console.log(`  AI assistant: ${config.claude.enabled ? `Claude (${config.claude.model})` : "built-in advisor (set ANTHROPIC_API_KEY to enable Claude)"}`);
});
