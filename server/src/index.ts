import { config } from "./config.js";
import { createApp } from "./app.js";
import { startLiveData } from "./services/liveData.js";

const app = createApp();
startLiveData(config.liveData);
app.listen(config.port, () => {
  console.log(`VISTORA API listening on http://localhost:${config.port}`);
  console.log(`  AI assistant: ${config.claude.enabled ? `Claude (${config.claude.model})` : "built-in advisor (set ANTHROPIC_API_KEY to enable Claude)"}`);
});
