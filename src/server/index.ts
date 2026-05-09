import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import {
  ensureSystem,
  getRulesState,
  saveAgentLocalRules,
  saveMasterRules,
  setAgentMode
} from "./agentSystems";
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
import {
  ensureHooksSystem,
  getHooksContent,
  getHooksState,
  previewHooksSync,
  saveHooksContent,
  saveHooksScopedContent,
  syncHooks
} from "./hooks";
import {
  createPlugin,
  deletePlugin,
  ensurePluginsSystem,
  getPluginsState,
  previewPluginsSync,
  listPluginContents,
  readPluginManifest,
  savePluginManifest,
  syncPlugins
} from "./plugins";
import { installRepositorySelection, scanRepository, getGhAuthStatus, type ScanItem } from "./installer";
import { searchSkillsSh, installSkillsShItems, type SkillsShItem } from "./skillssh";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3141);
app.use("*", cors());

// Rules (agent system rules) routes
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

// Hooks routes
app.get("/api/hooks/state", async (c) => c.json(await getHooksState()));

app.get("/api/hooks/content", async (c) => {
  const scope = (c.req.query("scope") || "global") as "global" | "system" | "discovered";
  const agentId = c.req.query("agentId") || undefined;
  try {
    return c.json(await getHooksContent(scope, agentId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to read hooks content" }, 400);
  }
});

app.put("/api/hooks/content", async (c) => {
  const body: { content?: string; scope?: "global" | "system" | "discovered"; agentId?: string } = await c.req.json().catch(() => ({}));
  if (typeof body.content !== "string") return c.json({ error: "content is required" }, 400);
  try {
    if (body.scope && body.scope !== "global") {
      return c.json(await saveHooksScopedContent(body.scope, body.content, body.agentId));
    }
    return c.json(await saveHooksContent(body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save hooks" }, 400);
  }
});

app.get("/api/hooks/preview-sync", async (c) => {
  try {
    return c.json(await previewHooksSync());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to preview hooks sync" }, 400);
  }
});

app.post("/api/hooks/sync", async (c) => {
  try {
    return c.json(await syncHooks());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to sync hooks" }, 400);
  }
});

// Plugins routes
app.get("/api/plugins/state", async (c) => c.json(await getPluginsState()));

app.get("/api/plugins/preview-sync", async (c) => {
  try {
    return c.json(await previewPluginsSync());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to preview plugins sync" }, 400);
  }
});

app.post("/api/plugins/sync", async (c) => {
  try {
    return c.json(await syncPlugins());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to sync plugins" }, 400);
  }
});

app.post("/api/plugins/create", async (c) => {
  const body: { pluginId?: string } = await c.req.json().catch(() => ({}));
  if (!body.pluginId) return c.json({ error: "pluginId is required" }, 400);
  try {
    return c.json(await createPlugin(body.pluginId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to create plugin" }, 400);
  }
});

app.delete("/api/plugins", async (c) => {
  const body: { pluginId?: string } = await c.req.json().catch(() => ({}));
  if (!body.pluginId) return c.json({ error: "pluginId is required" }, 400);
  try {
    return c.json(await deletePlugin(body.pluginId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to delete plugin" }, 400);
  }
});

app.get("/api/plugins/contents", async (c) => {
  const pluginId = c.req.query("pluginId");
  if (!pluginId) return c.json({ error: "pluginId is required" }, 400);
  try {
    return c.json(await listPluginContents(pluginId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to list plugin contents" }, 400);
  }
});

app.get("/api/plugins/manifest", async (c) => {
  const pluginId = c.req.query("pluginId");
  if (!pluginId) return c.json({ error: "pluginId is required" }, 400);
  try {
    return c.json(await readPluginManifest(pluginId));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to read plugin manifest" }, 400);
  }
});

app.put("/api/plugins/manifest", async (c) => {
  const body: { pluginId?: string; content?: string } = await c.req.json().catch(() => ({}));
  if (!body.pluginId || typeof body.content !== "string") {
    return c.json({ error: "pluginId and content are required" }, 400);
  }
  try {
    return c.json(await savePluginManifest(body.pluginId, body.content));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to save plugin manifest" }, 400);
  }
});

// Installer routes
app.get("/api/installer/gh-status", async (c) => {
  try {
    return c.json(await getGhAuthStatus());
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to check gh auth status" }, 400);
  }
});

app.post("/api/installer/scan", async (c) => {
  const body: { repoUrl?: string; token?: string } = await c.req.json().catch(() => ({}));
  if (!body.repoUrl) return c.json({ error: "repoUrl is required" }, 400);
  try {
    return c.json(await scanRepository(body.repoUrl, body.token));
  } catch (error: any) {
    return c.json({ error: error?.message ?? "Failed to scan repository" }, 400);
  }
});

app.post("/api/installer/install", async (c) => {
  const body: { repoUrl?: string; token?: string; items?: ScanItem[] } = await c.req.json().catch(() => ({}));
  if (!body.repoUrl || !Array.isArray(body.items)) return c.json({ error: "repoUrl and items are required" }, 400);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send = (obj: object) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  installRepositorySelection(body.repoUrl, body.items, body.token, (done, total) => {
    send({ type: "progress", done, total });
  }).then((result) => {
    send({ type: "done", installed: result.installed });
    writer.close();
  }).catch((err: any) => {
    send({ type: "error", message: err?.message ?? "Failed to install selection" });
    writer.close();
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
});

app.get("/api/installer/skillssh/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const result = await searchSkillsSh(query);
  return c.json(result);
});

app.post("/api/installer/skillssh/install", async (c) => {
  const body: { items?: SkillsShItem[] } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array is required" }, 400);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send = (obj: object) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  installSkillsShItems(body.items, (done, total) => {
    send({ type: "progress", done, total });
  }).then((result) => {
    send({ type: "done", installed: result.installed });
    writer.close();
  }).catch((err: any) => {
    send({ type: "error", message: err?.message ?? "Failed to install" });
    writer.close();
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
});

app.get("/api/raw", async (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "path required" }, 400);
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!filePath.startsWith(`${home}/.agentsync`)) return c.json({ error: "Access denied" }, 403);
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(filePath, "utf-8").catch(() => null);
  if (content === null) return c.json({ error: "File not found" }, 404);
  return c.json({ content });
});

app.put("/api/raw", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.path || typeof body.content !== "string") return c.json({ error: "path and content required" }, 400);
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!body.path.startsWith(`${home}/.agentsync`)) return c.json({ error: "Access denied" }, 403);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(body.path, body.content, "utf-8");
  return c.json({ ok: true });
});

const MIME: Record<string, string> = {
  html: "text/html",
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

function mimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const staticDir = process.env.AGENTSYNC_PUBLIC_DIR ?? path.join(HOME, ".agentsync", "public");

app.get("*", async (c) => {
  const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
  const filePath = path.join(staticDir, reqPath);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, { headers: { "Content-Type": mimeType(filePath) } });
  }
  return new Response(Bun.file(path.join(staticDir, "index.html")), {
    headers: { "Content-Type": "text/html" },
  });
});

await ensureSystem();
await ensureSkillsSystem();
await syncSkills();
await ensureAgentsSystem();
await syncAgents();
await ensureMcpSystem();
await ensureHooksSystem();
await syncHooks();
await ensurePluginsSystem();
await syncPlugins();
console.log(`AgentSync running: http://localhost:${PORT}`);
export default { port: PORT, fetch: app.fetch };
