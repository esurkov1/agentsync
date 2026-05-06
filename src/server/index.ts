import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  ensureSystem,
  getRulesState,
  saveAgentLocalRules,
  saveMasterRules,
  setAgentMode
} from "./agents";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3000);
app.use("*", cors());

app.get("/api/rules/state", async (c) => c.json(await getRulesState()));
app.put("/api/rules/master", async (c) => {
  const body: { content?: string } = await c.req.json().catch(() => ({}));
  if (typeof body.content !== "string") return c.json({ error: "content is required" }, 400);
  try {
    return c.json(await saveMasterRules(body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save rules" }, 400);
  }
});

app.put("/api/rules/agent-mode", async (c) => {
  const body: { agentId?: "claude-code" | "codex" | "opencode"; mode?: "global" | "local" } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.mode) return c.json({ error: "agentId and mode are required" }, 400);
  try {
    return c.json(await setAgentMode(body.agentId, body.mode));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to switch mode" }, 400);
  }
});
app.put("/api/rules/agent-local-content", async (c) => {
  const body: { agentId?: "claude-code" | "codex" | "opencode"; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentId || typeof body.content !== "string") return c.json({ error: "agentId and content are required" }, 400);
  try {
    return c.json(await saveAgentLocalRules(body.agentId, body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save local rules" }, 400);
  }
});

await ensureSystem();
console.log(`AgentSync running: http://localhost:${PORT}`);
export default { port: PORT, fetch: app.fetch };
