import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_IDS, AGENT_TARGETS as REGISTRY_TARGETS, type AgentId, getTarget, isTargetInstalled, pickPath } from "./agentRegistry";

export type McpServerDef = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "stdio" | "sse" | "http";
  url?: string;
  description?: string;
};

type McpOverride = {
  env?: Record<string, string>;
  args?: string[];
};

type McpConfig = {
  globallyDisabled: string[];
  targets: Record<AgentId, {
    enabledServers: string[];
    overrides: Record<string, McpOverride>;
  }>;
};

type McpFramework = {
  agentId: AgentId;
  label: string;
  installed: boolean;
  supported: boolean;
  mcpConfigPath: string;
  enabledServers: string[];
  overrides: Record<string, McpOverride>;
  statuses: Record<string, McpServerStatus>;
};

export type McpServerStatus = "installed" | "available" | "globally_disabled" | "not_installed" | "unsupported";

type McpServerInfo = {
  id: string;
  description: string;
  command: string;
  path: string;
  content: string;
};

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const MCP_ROOT = join(BASE_DIR, "mcp");
const MCP_SOURCE_DIR = join(MCP_ROOT, "source");
const MCP_CONFIG_FILE = join(MCP_ROOT, "config.json");

const MCP_FRAMEWORKS: Array<{ agentId: AgentId; label: string; mcpConfigPath: string }> = REGISTRY_TARGETS
  .filter((t) => t.mcpConfigPaths.length > 0)
  .map((t) => ({
    agentId: t.id,
    label: t.label,
    mcpConfigPath: pickPath(t.mcpConfigPaths),
  }));

function validateServerId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error("serverId is required");
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Invalid server ID: must not contain path separators");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new Error("Invalid server ID: use letters, numbers, hyphens, and underscores only");
  }
  return trimmed;
}

async function ensureMcpDirs(): Promise<void> {
  await mkdir(MCP_ROOT, { recursive: true });
  await mkdir(MCP_SOURCE_DIR, { recursive: true });
}

function defaultConfig(): McpConfig {
  const targets = Object.fromEntries(
    AGENT_IDS.map((id) => [id, { enabledServers: [], overrides: {} }])
  ) as McpConfig["targets"];
  return { globallyDisabled: [], targets };
}

async function readConfig(): Promise<McpConfig> {
  await ensureMcpDirs();
  if (!existsSync(MCP_CONFIG_FILE)) {
    const cfg = defaultConfig();
    await writeFile(MCP_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
    return cfg;
  }
  const raw = await readFile(MCP_CONFIG_FILE, "utf-8");
  const parsed = JSON.parse(raw) as Partial<McpConfig>;
  const cfg = defaultConfig();
  cfg.globallyDisabled = Array.isArray(parsed.globallyDisabled)
    ? parsed.globallyDisabled.filter((v) => typeof v === "string")
    : [];
  for (const agentId of Object.keys(cfg.targets) as AgentId[]) {
    const incoming = parsed.targets?.[agentId];
    if (incoming) {
      cfg.targets[agentId] = {
        enabledServers: Array.isArray(incoming.enabledServers)
          ? incoming.enabledServers.filter((v) => typeof v === "string")
          : [],
        overrides: incoming.overrides && typeof incoming.overrides === "object" ? incoming.overrides : {},
      };
    }
  }
  return cfg;
}

async function writeConfig(config: McpConfig): Promise<void> {
  await ensureMcpDirs();
  await writeFile(MCP_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

let configLock: Promise<void> = Promise.resolve();
function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  const prev = configLock;
  configLock = next;
  return prev.then(fn).finally(resolve) as Promise<T>;
}

async function listSourceServers(): Promise<McpServerInfo[]> {
  await ensureMcpDirs();
  const entries = await readdir(MCP_SOURCE_DIR, { withFileTypes: true }).catch(() => []);
  const servers: McpServerInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    const path = join(MCP_SOURCE_DIR, entry.name);
    const content = await readFile(path, "utf-8").catch(() => "{}");
    let description = "";
    let command = "";
    try {
      const parsed = JSON.parse(content) as McpServerDef;
      description = parsed.description ?? "";
      command = parsed.command ?? "";
    } catch {}
    servers.push({ id, description, command, path, content });
  }
  servers.sort((a, b) => a.id.localeCompare(b.id));
  return servers;
}

function computeStatuses(
  serverId: string,
  config: McpConfig,
  framework: { agentId: AgentId; installed: boolean; supported: boolean }
): McpServerStatus {
  if (!framework.installed) return "not_installed";
  if (!framework.supported) return "unsupported";
  if (config.globallyDisabled.includes(serverId)) return "globally_disabled";
  if (config.targets[framework.agentId]?.enabledServers.includes(serverId)) return "installed";
  return "available";
}

function serializeMcpToToml(mcpServers: Record<string, McpServerDef>): string {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(mcpServers)) {
    lines.push(`[mcp_servers.${name}]`);
    if (def.type) lines.push(`type = "${def.type}"`);
    if (def.command) lines.push(`command = "${def.command}"`);
    if (def.url) lines.push(`url = "${def.url}"`);
    if (def.args && def.args.length > 0) {
      const argsStr = def.args.map((a) => JSON.stringify(a)).join(", ");
      lines.push(`args = [${argsStr}]`);
    }
    const env = def.env ?? {};
    const envKeys = Object.keys(env);
    if (envKeys.length > 0) {
      lines.push(`[mcp_servers.${name}.env]`);
      for (const [k, v] of Object.entries(env)) {
        lines.push(`${k} = ${JSON.stringify(v)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function stripMcpSectionsFromToml(toml: string): string {
  const lines = toml.split("\n");
  const result: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (/^\[mcp_servers[.\]]/.test(line)) {
      skip = true;
      continue;
    }
    if (/^\[/.test(line)) skip = false;
    if (!skip) result.push(line);
  }
  while (result.length && !result[result.length - 1].trim()) result.pop();
  return result.join("\n");
}

async function applyMcpToTomlConfig(
  mcpConfigPath: string,
  mcpServers: Record<string, McpServerDef>
): Promise<void> {
  let existing = "";
  if (existsSync(mcpConfigPath)) {
    existing = await readFile(mcpConfigPath, "utf-8").catch(() => "");
  }
  const stripped = stripMcpSectionsFromToml(existing).trimEnd();
  const mcpToml = serializeMcpToToml(mcpServers);
  const result = stripped ? `${stripped}\n\n${mcpToml}` : mcpToml;
  await mkdir(join(mcpConfigPath, ".."), { recursive: true });
  await writeFile(mcpConfigPath, result, "utf-8");
}

async function applyMcpToAgentConfig(
  mcpConfigPath: string,
  mcpServers: Record<string, McpServerDef>
): Promise<void> {
  if (mcpConfigPath.endsWith(".toml")) {
    return applyMcpToTomlConfig(mcpConfigPath, mcpServers);
  }
  let existing: Record<string, unknown> = {};
  if (existsSync(mcpConfigPath)) {
    const raw = await readFile(mcpConfigPath, "utf-8").catch(() => "{}");
    try { existing = JSON.parse(raw); } catch {}
  }
  existing.mcpServers = mcpServers;
  await mkdir(join(mcpConfigPath, ".."), { recursive: true });
  await writeFile(mcpConfigPath, JSON.stringify(existing, null, 2), "utf-8");
}

async function syncFramework(agentId: AgentId, config: McpConfig): Promise<void> {
  const framework = MCP_FRAMEWORKS.find((f) => f.agentId === agentId);
  if (!framework) return;

  const target = getTarget(agentId);
  if (!isTargetInstalled(target)) return;

  const globallyDisabled = new Set(config.globallyDisabled);
  const agentCfg = config.targets[agentId] ?? { enabledServers: [], overrides: {} };
  const servers: Record<string, McpServerDef> = {};

  for (const serverId of agentCfg.enabledServers) {
    if (globallyDisabled.has(serverId)) continue;
    const serverPath = join(MCP_SOURCE_DIR, `${serverId}.json`);
    if (!existsSync(serverPath)) continue;
    const raw = await readFile(serverPath, "utf-8").catch(() => "{}");
    let def: McpServerDef = {};
    try { def = JSON.parse(raw); } catch {}
    const overrides = agentCfg.overrides?.[serverId] ?? {};
    const merged: McpServerDef = {
      ...def,
      ...(overrides.args ? { args: overrides.args } : {}),
      env: { ...(def.env ?? {}), ...(overrides.env ?? {}) },
    };
    delete merged.description;
    servers[serverId] = merged;
  }

  await applyMcpToAgentConfig(framework.mcpConfigPath, servers);
}

export async function ensureMcpSystem(): Promise<void> {
  await readConfig();
}

export async function getMcpState(): Promise<{
  servers: McpServerInfo[];
  frameworks: McpFramework[];
  globallyDisabled: string[];
}> {
  const [servers, config] = await Promise.all([listSourceServers(), readConfig()]);
  const serverIds = servers.map((s) => s.id);

  const frameworks: McpFramework[] = REGISTRY_TARGETS
    .filter((t) => t.id !== "agents-shared")
    .map((t) => {
      const installed = isTargetInstalled(t);
      const supported = t.mcpConfigPaths.length > 0;
      const agentCfg = config.targets[t.id] ?? { enabledServers: [], overrides: {} };
      const statuses: Record<string, McpServerStatus> = {};
      for (const serverId of serverIds) {
        statuses[serverId] = computeStatuses(serverId, config, { agentId: t.id, installed, supported });
      }
      return {
        agentId: t.id,
        label: t.label,
        installed,
        supported,
        mcpConfigPath: pickPath(t.mcpConfigPaths),
        enabledServers: agentCfg.enabledServers,
        overrides: agentCfg.overrides,
        statuses,
      };
    });

  return { servers, frameworks, globallyDisabled: config.globallyDisabled };
}

export async function readMcpContent(serverId: string): Promise<string> {
  const id = validateServerId(serverId);
  const path = join(MCP_SOURCE_DIR, `${id}.json`);
  return readFile(path, "utf-8").catch(() => "{}");
}

export async function saveMcpContent(serverId: string, content: string): Promise<void> {
  const id = validateServerId(serverId);
  JSON.parse(content); // validate JSON
  await ensureMcpDirs();
  await writeFile(join(MCP_SOURCE_DIR, `${id}.json`), content, "utf-8");
  // re-sync all frameworks that have this server enabled
  const config = await readConfig();
  const affectedAgents = Object.entries(config.targets)
    .filter(([, cfg]) => cfg.enabledServers.includes(id))
    .map(([agentId]) => agentId as AgentId);
  await Promise.all(affectedAgents.map((agentId) => syncFramework(agentId, config)));
}

export async function createMcpServer(serverId: string): Promise<void> {
  const id = validateServerId(serverId);
  await ensureMcpDirs();
  const path = join(MCP_SOURCE_DIR, `${id}.json`);
  if (existsSync(path)) throw new Error(`Server "${id}" already exists`);
  const def: McpServerDef = { command: "npx", args: [], env: {}, type: "stdio", description: "" };
  await writeFile(path, JSON.stringify(def, null, 2), "utf-8");
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  const id = validateServerId(serverId);
  const path = join(MCP_SOURCE_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`Server "${id}" not found`);
  await rm(path);
  // remove from config and re-sync
  await withConfigLock(async () => {
    const config = await readConfig();
    config.globallyDisabled = config.globallyDisabled.filter((s) => s !== id);
    for (const agentId of AGENT_IDS) {
      const t = config.targets[agentId];
      if (!t) continue;
      t.enabledServers = t.enabledServers.filter((s) => s !== id);
      delete t.overrides[id];
    }
    await writeConfig(config);
    await Promise.all(MCP_FRAMEWORKS.map((f) => syncFramework(f.agentId, config)));
  });
}

export async function setGlobalMcpEnabled(serverId: string, enabled: boolean): Promise<void> {
  const id = validateServerId(serverId);
  await withConfigLock(async () => {
    const config = await readConfig();
    const set = new Set(config.globallyDisabled);
    if (enabled) set.delete(id);
    else set.add(id);
    config.globallyDisabled = [...set].sort();
    await writeConfig(config);
    await Promise.all(MCP_FRAMEWORKS.map((f) => syncFramework(f.agentId, config)));
  });
}

export async function batchSetGlobalMcpEnabled(serverIds: string[], enabled: boolean): Promise<void> {
  const ids = serverIds.map(validateServerId);
  await withConfigLock(async () => {
    const config = await readConfig();
    const set = new Set(config.globallyDisabled);
    for (const id of ids) {
      if (enabled) set.delete(id);
      else set.add(id);
    }
    config.globallyDisabled = [...set].sort();
    await writeConfig(config);
    await Promise.all(MCP_FRAMEWORKS.map((f) => syncFramework(f.agentId, config)));
  });
}

export async function setMcpEnabled(agentId: AgentId, serverId: string, enabled: boolean): Promise<void> {
  const id = validateServerId(serverId);
  await withConfigLock(async () => {
    const config = await readConfig();
    const t = config.targets[agentId] ?? { enabledServers: [], overrides: {} };
    const set = new Set(t.enabledServers);
    if (enabled) set.add(id);
    else set.delete(id);
    t.enabledServers = [...set].sort();
    config.targets[agentId] = t;
    await writeConfig(config);
    await syncFramework(agentId, config);
  });
}

export async function batchSetMcpEnabled(agentId: AgentId, serverIds: string[], enabled: boolean): Promise<void> {
  const ids = serverIds.map(validateServerId);
  await withConfigLock(async () => {
    const config = await readConfig();
    const t = config.targets[agentId] ?? { enabledServers: [], overrides: {} };
    const set = new Set(t.enabledServers);
    for (const id of ids) {
      if (enabled) set.add(id);
      else set.delete(id);
    }
    t.enabledServers = [...set].sort();
    config.targets[agentId] = t;
    await writeConfig(config);
    await syncFramework(agentId, config);
  });
}

export async function setMcpOverride(agentId: AgentId, serverId: string, overrides: McpOverride): Promise<void> {
  const id = validateServerId(serverId);
  await withConfigLock(async () => {
    const config = await readConfig();
    const t = config.targets[agentId] ?? { enabledServers: [], overrides: {} };
    if (Object.keys(overrides).length === 0) {
      delete t.overrides[id];
    } else {
      t.overrides[id] = overrides;
    }
    config.targets[agentId] = t;
    await writeConfig(config);
    await syncFramework(agentId, config);
  });
}

export async function syncAllMcp(): Promise<void> {
  const config = await readConfig();
  await Promise.all(MCP_FRAMEWORKS.map((f) => syncFramework(f.agentId, config)));
}

export async function testAllMcpServers(serverIds: string[]): Promise<Record<string, { status: "ok" | "error" | "unknown"; message: string }>> {
  const results = await Promise.all(serverIds.map(async (id) => [id, await testMcpServer(id)] as const));
  return Object.fromEntries(results);
}

export async function renameMcpServer(oldId: string, newId: string): Promise<void> {
  const cleanOld = validateServerId(oldId);
  const cleanNew = validateServerId(newId);
  if (cleanOld === cleanNew) return;
  const oldPath = join(MCP_SOURCE_DIR, `${cleanOld}.json`);
  const newPath = join(MCP_SOURCE_DIR, `${cleanNew}.json`);
  if (!existsSync(oldPath)) throw new Error(`Server "${cleanOld}" not found`);
  if (existsSync(newPath)) throw new Error(`Server "${cleanNew}" already exists`);
  await rename(oldPath, newPath);
  await withConfigLock(async () => {
    const config = await readConfig();
    config.globallyDisabled = config.globallyDisabled.map((id) => (id === cleanOld ? cleanNew : id));
    for (const agentId of AGENT_IDS) {
      const t = config.targets[agentId];
      if (!t) continue;
      t.enabledServers = t.enabledServers.map((id) => (id === cleanOld ? cleanNew : id));
      if (t.overrides[cleanOld] !== undefined) {
        t.overrides[cleanNew] = t.overrides[cleanOld];
        delete t.overrides[cleanOld];
      }
    }
    await writeConfig(config);
    await Promise.all(MCP_FRAMEWORKS.map((f) => syncFramework(f.agentId, config)));
  });
}

type McpTool = { name: string; description?: string };
type TestResult = { status: "ok" | "error" | "unknown"; message: string; tools?: McpTool[] };

async function listToolsViaStdio(cmd: string, args: string[], env: Record<string, string>): Promise<McpTool[] | null> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: McpTool[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => done(null), 8000);
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "ignore"]
    });
    let buf = "";
    let phase: "init" | "tools" = "init";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (phase === "init" && msg.id === 1 && msg.result) {
            phase = "tools";
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
          } else if (phase === "tools" && msg.id === 2) {
            done(Array.isArray(msg.result?.tools) ? msg.result.tools : []);
          }
        } catch {}
      }
    });
    child.on("error", () => done(null));
    child.on("close", () => done(null));
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "agentsync", version: "1.0" } }
    }) + "\n");
  });
}

async function listToolsViaHttp(url: string): Promise<McpTool[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: ctrl.signal
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = await res.json() as any;
    return Array.isArray(json.result?.tools) ? json.result.tools : null;
  } catch {
    return null;
  }
}

export async function testMcpServer(serverId: string): Promise<TestResult> {
  const id = validateServerId(serverId);
  const serverPath = join(MCP_SOURCE_DIR, `${id}.json`);
  if (!existsSync(serverPath)) return { status: "error", message: "Server definition not found" };

  const raw = await readFile(serverPath, "utf-8").catch(() => "{}");
  let def: McpServerDef = {};
  try { def = JSON.parse(raw); } catch {
    return { status: "error", message: "Invalid server definition JSON" };
  }

  if (def.type === "http" || def.type === "sse" || def.url) {
    const url = def.url;
    if (!url) return { status: "error", message: "No URL configured" };
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timeout));
      if (!res.ok) return { status: "error", message: `HTTP ${res.status} ${res.statusText}` };
      const tools = await listToolsViaHttp(url);
      return { status: "ok", message: `HTTP ${res.status}`, ...(tools ? { tools } : {}) };
    } catch (e: any) {
      return { status: "error", message: e?.message ?? "Connection failed" };
    }
  }

  const cmd = def.command;
  if (!cmd) return { status: "unknown", message: "No command configured" };

  try {
    const { execFileSync } = await import("node:child_process");
    const whichCmd = process.platform === "win32" ? "where" : "which";
    execFileSync(whichCmd, [cmd], { stdio: "pipe" });
    const tools = await listToolsViaStdio(cmd, def.args ?? [], def.env ?? {});
    return { status: "ok", message: `Command found: ${cmd}`, ...(tools ? { tools } : {}) };
  } catch {
    return { status: "error", message: `Command not found in PATH: ${cmd}` };
  }
}
