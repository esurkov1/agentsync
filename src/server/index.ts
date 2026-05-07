import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  ensureSystem,
  getRulesState,
  saveAgentLocalRules,
  saveMasterRules,
  setAgentMode
} from "./workspaces";
import {
  batchSetGlobalEnabled,
  batchSetSkillEnabled,
  createSkill,
  deleteSkill,
  ensureSkillsSystem,
  getSkillFolderPath,
  getSkillsState,
  readSkillContent,
  resolveSkillConflict,
  saveSkillContent,
  setGlobalSkillEnabled,
  setSkillEnabled,
  syncSkills
} from "./skills";
import {
  batchSetGlobalAgentEnabled,
  batchSetAgentEnabled,
  createAgent,
  deleteAgent,
  ensureAgentsSystem,
  getAgentsState,
  readAgentContent,
  resolveAgentConflict,
  saveAgentContent,
  setGlobalAgentEnabled,
  setAgentEnabled,
  syncAgents
} from "./agents";
import {
  batchSetGlobalMcpEnabled,
  batchSetMcpEnabled,
  createMcpServer,
  deleteMcpServer,
  ensureMcpSystem,
  getMcpState,
  readMcpContent,
  renameMcpServer,
  saveMcpContent,
  setGlobalMcpEnabled,
  setMcpEnabled,
  syncAllMcp,
  testAllMcpServers,
  testMcpServer
} from "./mcpServers";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3000);
app.use("*", cors());

// Rules (workspace rules) routes
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
  const body: { agentId?: string; mode?: "global" | "local" } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.mode) return c.json({ error: "agentId and mode are required" }, 400);
  try {
    return c.json(await setAgentMode(body.agentId, body.mode));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to switch mode" }, 400);
  }
});

app.put("/api/rules/agent-local-content", async (c) => {
  const body: { agentId?: string; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentId || typeof body.content !== "string") return c.json({ error: "agentId and content are required" }, 400);
  try {
    return c.json(await saveAgentLocalRules(body.agentId, body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save local rules" }, 400);
  }
});

// Skills routes
app.get("/api/skills/state", async (c) => c.json(await getSkillsState()));

app.get("/api/skills/content", async (c) => {
  const skillId = c.req.query("skillId");
  if (!skillId) return c.json({ error: "skillId is required" }, 400);
  try {
    return c.json(await readSkillContent(skillId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to read skill" }, 400);
  }
});

app.put("/api/skills/target-skill", async (c) => {
  const body: { agentId?: string; skillId?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.skillId || typeof body.enabled !== "boolean") {
    return c.json({ error: "agentId, skillId and enabled are required" }, 400);
  }
  try {
    return c.json(await setSkillEnabled(body.agentId, body.skillId, body.enabled));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to change skill state" }, 400);
  }
});

app.post("/api/skills/global-toggle", async (c) => {
  const body: { skillId?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.skillId || typeof body.enabled !== "boolean") {
    return c.json({ error: "skillId and enabled are required" }, 400);
  }
  try {
    return c.json(await setGlobalSkillEnabled(body.skillId, body.enabled));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/skills/batch-global-toggle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ops)) return c.json({ error: "ops array required" }, 400);
  try {
    return c.json(await batchSetGlobalEnabled(body.ops));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/skills/batch-toggle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ops)) return c.json({ error: "ops array required" }, 400);
  try {
    return c.json(await batchSetSkillEnabled(body.ops));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/skills/resolve-conflict", async (c) => {
  const body: { agentId?: string; skillId?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.skillId) return c.json({ error: "agentId and skillId are required" }, 400);
  try {
    return c.json(await resolveSkillConflict(body.agentId as any, body.skillId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to resolve conflict" }, 400);
  }
});

app.post("/api/skills/sync", async (c) => {
  try {
    return c.json(await syncSkills());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to sync skills" }, 400);
  }
});

app.put("/api/skills/content", async (c) => {
  const body: { skillId?: string; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.skillId || typeof body.content !== "string") {
    return c.json({ error: "skillId and content are required" }, 400);
  }
  try {
    return c.json(await saveSkillContent(body.skillId, body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save skill" }, 400);
  }
});

app.post("/api/skills/create", async (c) => {
  const body: { skillId?: string } = await c.req.json().catch(() => ({}));
  if (!body.skillId) return c.json({ error: "skillId is required" }, 400);
  try {
    return c.json(await createSkill(body.skillId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to create skill" }, 400);
  }
});

app.delete("/api/skills", async (c) => {
  const body: { skillId?: string } = await c.req.json().catch(() => ({}));
  if (!body.skillId) return c.json({ error: "skillId is required" }, 400);
  try {
    return c.json(await deleteSkill(body.skillId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to delete skill" }, 400);
  }
});

app.post("/api/open-folder", async (c) => {
  const body: { skillId?: string } = await c.req.json().catch(() => ({}));
  if (!body.skillId) return c.json({ error: "skillId is required" }, 400);
  try {
    const { spawn } = await import("node:child_process");
    const folderPath = getSkillFolderPath(body.skillId);
    const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [folderPath], { detached: true, stdio: "ignore" }).unref();
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

// Agents (custom agent definitions) routes
app.get("/api/agents/state", async (c) => c.json(await getAgentsState()));

app.get("/api/agents/content", async (c) => {
  const agentName = c.req.query("agentName");
  if (!agentName) return c.json({ error: "agentName is required" }, 400);
  try {
    return c.json(await readAgentContent(agentName));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to read agent" }, 400);
  }
});

app.put("/api/agents/content", async (c) => {
  const body: { agentName?: string; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentName || typeof body.content !== "string") {
    return c.json({ error: "agentName and content are required" }, 400);
  }
  try {
    return c.json(await saveAgentContent(body.agentName, body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save agent" }, 400);
  }
});

app.post("/api/agents/create", async (c) => {
  const body: { agentName?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentName) return c.json({ error: "agentName is required" }, 400);
  try {
    return c.json(await createAgent(body.agentName));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to create agent" }, 400);
  }
});

app.delete("/api/agents", async (c) => {
  const body: { agentName?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentName) return c.json({ error: "agentName is required" }, 400);
  try {
    return c.json(await deleteAgent(body.agentName));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to delete agent" }, 400);
  }
});

app.put("/api/agents/target-agent", async (c) => {
  const body: { agentId?: string; agentName?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.agentName || typeof body.enabled !== "boolean") {
    return c.json({ error: "agentId, agentName and enabled are required" }, 400);
  }
  try {
    return c.json(await setAgentEnabled(body.agentId, body.agentName, body.enabled));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to change agent state" }, 400);
  }
});

app.post("/api/agents/batch-toggle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ops)) return c.json({ error: "ops array required" }, 400);
  try {
    return c.json(await batchSetAgentEnabled(body.ops));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/agents/global-toggle", async (c) => {
  const body: { agentName?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.agentName || typeof body.enabled !== "boolean") {
    return c.json({ error: "agentName and enabled are required" }, 400);
  }
  try {
    return c.json(await setGlobalAgentEnabled(body.agentName, body.enabled));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/agents/batch-global-toggle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ops)) return c.json({ error: "ops array required" }, 400);
  try {
    return c.json(await batchSetGlobalAgentEnabled(body.ops));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/agents/resolve-conflict", async (c) => {
  const body: { agentId?: string; agentName?: string } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.agentName) return c.json({ error: "agentId and agentName are required" }, 400);
  try {
    return c.json(await resolveAgentConflict(body.agentId as any, body.agentName));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to resolve conflict" }, 400);
  }
});

app.post("/api/agents/sync", async (c) => {
  try {
    return c.json(await syncAgents());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to sync agents" }, 400);
  }
});

// MCP servers routes
app.get("/api/mcp/state", async (c) => c.json(await getMcpState()));

app.get("/api/mcp/content", async (c) => {
  const serverId = c.req.query("serverId");
  if (!serverId) return c.json({ error: "serverId is required" }, 400);
  try {
    return c.json({ content: await readMcpContent(serverId) });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to read server" }, 400);
  }
});

app.put("/api/mcp/content", async (c) => {
  const body: { serverId?: string; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.serverId || typeof body.content !== "string") {
    return c.json({ error: "serverId and content are required" }, 400);
  }
  try {
    await saveMcpContent(body.serverId, body.content);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save server" }, 400);
  }
});

app.post("/api/mcp/create", async (c) => {
  const body: { serverId?: string } = await c.req.json().catch(() => ({}));
  if (!body.serverId) return c.json({ error: "serverId is required" }, 400);
  try {
    await createMcpServer(body.serverId);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to create server" }, 400);
  }
});

app.delete("/api/mcp", async (c) => {
  const body: { serverId?: string } = await c.req.json().catch(() => ({}));
  if (!body.serverId) return c.json({ error: "serverId is required" }, 400);
  try {
    await deleteMcpServer(body.serverId);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to delete server" }, 400);
  }
});

app.post("/api/mcp/global-toggle", async (c) => {
  const body: { serverId?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.serverId || typeof body.enabled !== "boolean") {
    return c.json({ error: "serverId and enabled are required" }, 400);
  }
  try {
    await setGlobalMcpEnabled(body.serverId, body.enabled);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/mcp/batch-global-toggle", async (c) => {
  const body: { serverIds?: string[]; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.serverIds) || typeof body.enabled !== "boolean") {
    return c.json({ error: "serverIds and enabled are required" }, 400);
  }
  try {
    await batchSetGlobalMcpEnabled(body.serverIds, body.enabled);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/mcp/toggle", async (c) => {
  const body: { agentId?: string; serverId?: string; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !body.serverId || typeof body.enabled !== "boolean") {
    return c.json({ error: "agentId, serverId and enabled are required" }, 400);
  }
  try {
    await setMcpEnabled(body.agentId, body.serverId, body.enabled);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.post("/api/mcp/batch-toggle", async (c) => {
  const body: { agentId?: string; serverIds?: string[]; enabled?: boolean } = await c.req.json().catch(() => ({}));
  if (!body.agentId || !Array.isArray(body.serverIds) || typeof body.enabled !== "boolean") {
    return c.json({ error: "agentId, serverIds and enabled are required" }, 400);
  }
  try {
    await batchSetMcpEnabled(body.agentId, body.serverIds, body.enabled);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed" }, 400);
  }
});

app.put("/api/mcp/rename", async (c) => {
  const body: { oldId?: string; newId?: string } = await c.req.json().catch(() => ({}));
  if (!body.oldId || !body.newId) return c.json({ error: "oldId and newId are required" }, 400);
  try {
    await renameMcpServer(body.oldId, body.newId);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to rename server" }, 400);
  }
});

app.post("/api/mcp/sync", async (c) => {
  try {
    await syncAllMcp();
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to sync" }, 400);
  }
});

app.post("/api/mcp/test", async (c) => {
  const body: { serverId?: string } = await c.req.json().catch(() => ({}));
  if (!body.serverId) return c.json({ error: "serverId is required" }, 400);
  try {
    return c.json(await testMcpServer(body.serverId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to test server" }, 400);
  }
});

app.post("/api/mcp/test-all", async (c) => {
  const body: { serverIds?: string[] } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.serverIds)) return c.json({ error: "serverIds array required" }, 400);
  try {
    return c.json({ results: await testAllMcpServers(body.serverIds) });
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to test servers" }, 400);
  }
});

await ensureSystem();
await ensureSkillsSystem();
await syncSkills();
await ensureAgentsSystem();
await syncAgents();
await ensureMcpSystem();
console.log(`AgentSync running: http://localhost:${PORT}`);
export default { port: PORT, fetch: app.fetch };
