import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_IDS, AGENT_TARGETS as REGISTRY_TARGETS, type AgentId, getTarget, isTargetInstalled, pickPath } from "./agentRegistry";

type AgentTarget = { id: AgentId; label: string; agentsPath: string };

type AgentsConfig = {
  targets: Record<AgentId, { mode: "symlink"; enabledAgents: string[] }>;
  globallyDisabled: string[];
};

type AgentManifest = {
  managedBy: "agentsync";
  version: 1;
  entries: Record<string, { sourcePath: string; targetPath: string; mode: "symlink"; updatedAt: string }>;
};

export type AgentStatus = "installed" | "available" | "local" | "conflict" | "missing" | "not_installed";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const AGENTS_ROOT = join(BASE_DIR, "agents");
const AGENTS_SOURCE_DIR = join(AGENTS_ROOT, "source");
const AGENTS_CONFIG_FILE = join(AGENTS_ROOT, "config.json");
const AGENTS_MANIFESTS_DIR = join(AGENTS_ROOT, "manifests");

const AGENT_TARGETS: AgentTarget[] = REGISTRY_TARGETS.map((target) => ({
  id: target.id,
  label: target.label,
  agentsPath: pickPath(target.agentsPaths)
}));

function getAgentTarget(agentId: AgentId): AgentTarget {
  const target = AGENT_TARGETS.find((item) => item.id === agentId);
  if (!target) throw new Error(`Unknown agent: ${agentId}`);
  return target;
}

function getManifestPath(agentId: AgentId): string {
  return join(AGENTS_MANIFESTS_DIR, `${agentId}.json`);
}

function validateAgentName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("agentName is required");
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Invalid agent name: must not contain path separators");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new Error("Invalid agent name: use letters, numbers, hyphens, and underscores only");
  }
  return trimmed;
}

async function ensureAgentsDirs(): Promise<void> {
  await mkdir(AGENTS_ROOT, { recursive: true });
  await mkdir(AGENTS_SOURCE_DIR, { recursive: true });
  await mkdir(AGENTS_MANIFESTS_DIR, { recursive: true });
}

function defaultConfig(): AgentsConfig {
  const targets = Object.fromEntries(AGENT_IDS.map((id) => [id, { mode: "symlink", enabledAgents: [] }])) as AgentsConfig["targets"];
  return {
    targets,
    globallyDisabled: []
  };
}

async function readConfig(): Promise<AgentsConfig> {
  await ensureAgentsDirs();
  if (!existsSync(AGENTS_CONFIG_FILE)) {
    const cfg = defaultConfig();
    await writeFile(AGENTS_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
    return cfg;
  }
  const raw = await readFile(AGENTS_CONFIG_FILE, "utf-8");
  const parsed = JSON.parse(raw) as Partial<AgentsConfig>;
  const cfg = defaultConfig();
  for (const agentId of Object.keys(cfg.targets) as AgentId[]) {
    const incoming = parsed.targets?.[agentId];
    if (incoming) {
      cfg.targets[agentId] = {
        mode: "symlink",
        enabledAgents: Array.isArray(incoming.enabledAgents)
          ? incoming.enabledAgents.filter((v) => typeof v === "string")
          : []
      };
    }
  }
  cfg.globallyDisabled = Array.isArray(parsed.globallyDisabled)
    ? parsed.globallyDisabled.filter((v) => typeof v === "string")
    : [];
  return cfg;
}

async function writeConfig(config: AgentsConfig): Promise<void> {
  await ensureAgentsDirs();
  await writeFile(AGENTS_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

async function readManifest(agentId: AgentId): Promise<AgentManifest> {
  await ensureAgentsDirs();
  const path = getManifestPath(agentId);
  if (!existsSync(path)) return { managedBy: "agentsync", version: 1, entries: {} };
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as Partial<AgentManifest>;
  return { managedBy: "agentsync", version: 1, entries: parsed.entries ?? {} };
}

async function writeManifest(agentId: AgentId, manifest: AgentManifest): Promise<void> {
  await ensureAgentsDirs();
  await writeFile(getManifestPath(agentId), JSON.stringify(manifest, null, 2), "utf-8");
}

let configLock: Promise<void> = Promise.resolve();
function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  const prev = configLock;
  configLock = next;
  return prev.then(fn).finally(resolve) as Promise<T>;
}

const manifestLocks = new Map<AgentId, Promise<void>>();
function withManifestLock<T>(agentId: AgentId, fn: () => Promise<T>): Promise<T> {
  const prev = manifestLocks.get(agentId) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  manifestLocks.set(agentId, next);
  return prev.then(fn).finally(resolve) as Promise<T>;
}

function sourceFilePath(agentName: string): string {
  return join(AGENTS_SOURCE_DIR, `${agentName}.md`);
}

function targetFilePath(agentsPath: string, agentName: string): string {
  return join(agentsPath, `${agentName}.md`);
}

async function listSourceAgents(): Promise<Array<{ id: string; path: string; content: string }>> {
  await ensureAgentsDirs();
  const entries = await readdir(AGENTS_SOURCE_DIR, { withFileTypes: true });
  const agents: Array<{ id: string; path: string; content: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (!entry.name.endsWith(".md")) continue;
    const agentName = entry.name.slice(0, -3);
    const agentPath = join(AGENTS_SOURCE_DIR, entry.name);
    const content = await readFile(agentPath, "utf-8").catch(() => "");
    agents.push({ id: agentName, path: agentPath, content });
  }
  agents.sort((a, b) => a.id.localeCompare(b.id));
  return agents;
}

async function listAgentsFromPath(basePath: string): Promise<Array<{ id: string; path: string; content: string }>> {
  if (!existsSync(basePath)) return [];
  const entries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  const agents: Array<{ id: string; path: string; content: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name.startsWith(".")) continue;
    const agentName = entry.name.slice(0, -3);
    const agentPath = join(basePath, entry.name);
    const content = await readFile(agentPath, "utf-8").catch(() => "");
    agents.push({ id: agentName, path: agentPath, content });
  }
  agents.sort((a, b) => a.id.localeCompare(b.id));
  return agents;
}

async function discoverFrameworkAgents(): Promise<Array<{ id: string; path: string; content: string }>> {
  const discovered = new Map<string, { id: string; path: string; content: string }>();
  for (const target of AGENT_TARGETS) {
    if (!isTargetInstalled(getTarget(target.id))) continue;
    const items = await listAgentsFromPath(target.agentsPath);
    for (const item of items) {
      if (discovered.has(item.id)) continue;
      discovered.set(item.id, item);
    }
  }
  return [...discovered.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function bootstrapSourceFromFrameworks(): Promise<void> {
  await ensureAgentsDirs();
  const sourceAgents = await listSourceAgents();
  const sourceSet = new Set(sourceAgents.map((a) => a.id));
  const discovered = await discoverFrameworkAgents();

  for (const agent of discovered) {
    if (sourceSet.has(agent.id)) continue;
    const st = await lstat(agent.path).catch(() => null);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      const real = await realpath(agent.path).catch(() => "");
      if (real.startsWith(AGENTS_SOURCE_DIR)) continue;
    }
    const content = await readFile(agent.path, "utf-8").catch(() => "");
    await writeFile(sourceFilePath(agent.id), content, "utf-8");
  }
}

function parseAgentMeta(content: string): { name: string; description: string } {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descriptionMatch = content.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() || "",
    description: descriptionMatch?.[1]?.trim() || ""
  };
}

async function isManagedSymlink(targetPath: string, sourcePath: string): Promise<boolean> {
  const st = await lstat(targetPath).catch(() => null);
  if (!st?.isSymbolicLink()) return false;
  const real = await realpath(targetPath).catch(() => "");
  return real === sourcePath;
}

async function classifyAgentStatus(params: {
  agentId: AgentId;
  agentName: string;
  sourcePath: string;
  agentsPath: string;
  enabled: boolean;
  installed: boolean;
  manifest: AgentManifest;
}): Promise<AgentStatus> {
  if (!params.installed) return "not_installed";
  const tgtPath = targetFilePath(params.agentsPath, params.agentName);
  const targetExists = existsSync(tgtPath);
  const entry = params.manifest.entries[params.agentName];

  if (!params.enabled) {
    if (!targetExists) return "available";
    if (entry) return "conflict";
    return "local";
  }

  if (!targetExists) return "missing";
  const isManaged = entry && entry.targetPath === tgtPath;
  if (!isManaged) return "conflict";
  const symlinkOk = await isManagedSymlink(tgtPath, params.sourcePath);
  if (!symlinkOk) return "conflict";
  return "installed";
}

async function syncAgentForFramework(agentId: AgentId, agentName: string, enabled: boolean): Promise<void> {
  const target = getAgentTarget(agentId);
  if (!isTargetInstalled(getTarget(agentId))) return;
  await mkdir(target.agentsPath, { recursive: true });

  const srcPath = sourceFilePath(agentName);
  const tgtPath = targetFilePath(target.agentsPath, agentName);

  await withManifestLock(agentId, async () => {
    const manifest = await readManifest(agentId);

    if (enabled) {
      if (!existsSync(srcPath)) return;
      const existingSt = await lstat(tgtPath).catch(() => null);
      if (existingSt) {
        const prev = manifest.entries[agentName];
        if (!prev || prev.targetPath !== tgtPath) return;
        await rm(tgtPath, { force: true });
      }
      await symlink(srcPath, tgtPath);
      manifest.entries[agentName] = {
        sourcePath: srcPath,
        targetPath: tgtPath,
        mode: "symlink",
        updatedAt: new Date().toISOString()
      };
    } else {
      const targetSt = await lstat(tgtPath).catch(() => null);
      if (targetSt?.isSymbolicLink()) {
        await rm(tgtPath, { force: true }).catch(() => null);
      }
      delete manifest.entries[agentName];
    }

    await writeManifest(agentId, manifest);
  });
}

async function removeAgentFromAllFrameworks(agentName: string): Promise<void> {
  for (const target of AGENT_TARGETS) {
    await syncAgentForFramework(target.id, agentName, false);
  }
}

export async function ensureAgentsSystem(): Promise<void> {
  await ensureAgentsDirs();
  await readConfig();
  await bootstrapSourceFromFrameworks();
}

export async function syncAgents(): Promise<{ ok: true }> {
  await ensureAgentsSystem();
  const config = await readConfig();
  const sourceAgents = await listSourceAgents();
  const sourceMap = new Map(sourceAgents.map((a) => [a.id, a]));
  const globallyDisabled = new Set(config.globallyDisabled);

  for (const target of AGENT_TARGETS) {
    if (!isTargetInstalled(getTarget(target.id))) continue;
    await mkdir(target.agentsPath, { recursive: true });

    const manifest = await readManifest(target.id);
    const enabled = new Set(config.targets[target.id]?.enabledAgents ?? []);

    for (const agentName of enabled) {
      if (globallyDisabled.has(agentName)) continue;
      const source = sourceMap.get(agentName);
      if (!source) continue;
      const tgtPath = targetFilePath(target.agentsPath, agentName);
      const existing = await lstat(tgtPath).catch(() => null);

      if (existing) {
        const prev = manifest.entries[agentName];
        if (!prev || prev.targetPath !== tgtPath) continue;
        await rm(tgtPath, { force: true });
      }

      await symlink(source.path, tgtPath);
      manifest.entries[agentName] = {
        sourcePath: source.path,
        targetPath: tgtPath,
        mode: "symlink",
        updatedAt: new Date().toISOString()
      };
    }

    for (const [agentName] of Object.entries(manifest.entries)) {
      if (enabled.has(agentName) && !globallyDisabled.has(agentName)) continue;
      const tgtPath = targetFilePath(target.agentsPath, agentName);
      const targetSt = await lstat(tgtPath).catch(() => null);
      if (targetSt?.isSymbolicLink()) {
        await rm(tgtPath, { force: true }).catch(() => null);
      }
      delete manifest.entries[agentName];
    }

    await writeManifest(target.id, manifest);
  }

  return { ok: true };
}

export async function getAgentsState(): Promise<{
  sourcePath: string;
  configPath: string;
  manifestPath: string;
  globallyDisabled: string[];
  agents: Array<{ id: string; path: string; name: string; description: string; content: string }>;
  frameworks: Array<{
    agentId: AgentId;
    label: string;
    installed: boolean;
    agentsPath: string;
    mode: "symlink";
    enabledAgents: string[];
    statuses: Record<string, AgentStatus>;
  }>;
}> {
  await ensureAgentsSystem();
  const config = await readConfig();
  const sourceAgents = await listSourceAgents();
  const discoveredAgents = await discoverFrameworkAgents();
  const discoveredMap = new Map(discoveredAgents.map((a) => [a.id, a]));

  const unionAgents = new Map<string, { id: string; path: string; content: string }>();
  for (const a of discoveredAgents) unionAgents.set(a.id, a);
  for (const a of sourceAgents) unionAgents.set(a.id, a);

  const agents = [...unionAgents.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((agent) => {
      const meta = parseAgentMeta(agent.content);
      return {
        id: agent.id,
        path: agent.path,
        name: meta.name || agent.id,
        description: meta.description,
        content: agent.content
      };
    });

  const frameworks = await Promise.all(
    AGENT_TARGETS.map(async (target) => {
      const installed = isTargetInstalled(getTarget(target.id));
      const manifest = await readManifest(target.id);
      const enabledAgents = config.targets[target.id]?.enabledAgents ?? [];
      const statuses: Record<string, AgentStatus> = {};

      for (const agent of agents) {
        const sourceItem = sourceAgents.find((a) => a.id === agent.id) ?? discoveredMap.get(agent.id);
        statuses[agent.id] = await classifyAgentStatus({
          agentId: target.id,
          agentName: agent.id,
          sourcePath: sourceItem?.path || agent.path,
          agentsPath: target.agentsPath,
          enabled: enabledAgents.includes(agent.id),
          installed,
          manifest
        });
      }

      return {
        agentId: target.id,
        label: target.label,
        installed,
        agentsPath: target.agentsPath,
        mode: "symlink" as const,
        enabledAgents,
        statuses
      };
    })
  );

  return {
    sourcePath: AGENTS_SOURCE_DIR,
    configPath: AGENTS_CONFIG_FILE,
    manifestPath: AGENTS_MANIFESTS_DIR,
    globallyDisabled: config.globallyDisabled,
    agents,
    frameworks
  };
}

export async function setAgentEnabled(agentId: AgentId, agentName: string, enabled: boolean): Promise<{ ok: true }> {
  await ensureAgentsDirs();
  if (!isTargetInstalled(getTarget(agentId))) throw new Error("Framework is not installed");

  const cleanName = validateAgentName(agentName);
  let isGloballyDisabled = false;
  await withConfigLock(async () => {
    const config = await readConfig();
    const current = new Set(config.targets[agentId].enabledAgents);
    if (enabled) current.add(cleanName);
    else current.delete(cleanName);
    config.targets[agentId].enabledAgents = [...current].sort((a, b) => a.localeCompare(b));
    isGloballyDisabled = config.globallyDisabled.includes(cleanName);
    await writeConfig(config);
  });
  if (!isGloballyDisabled) await syncAgentForFramework(agentId, cleanName, enabled);
  return { ok: true };
}

export async function batchSetAgentEnabled(
  ops: Array<{ agentId: AgentId; agentName: string; enabled: boolean }>
): Promise<{ ok: true }> {
  if (!ops.length) return { ok: true };
  await ensureAgentsDirs();

  const byAgent = new Map<AgentId, Array<{ agentName: string; enabled: boolean }>>();
  for (const op of ops) {
    const list = byAgent.get(op.agentId) ?? [];
    list.push({ agentName: validateAgentName(op.agentName), enabled: op.enabled });
    byAgent.set(op.agentId, list);
  }

  const config = await readConfig();
  for (const [agentId, agentOps] of byAgent) {
    if (!isTargetInstalled(getTarget(agentId))) continue;
    const current = new Set(config.targets[agentId].enabledAgents);
    for (const { agentName, enabled } of agentOps) {
      if (enabled) current.add(agentName);
      else current.delete(agentName);
    }
    config.targets[agentId].enabledAgents = [...current].sort((a, b) => a.localeCompare(b));
  }
  await writeConfig(config);

  await Promise.all(
    ops.map(({ agentId, agentName, enabled }) =>
      syncAgentForFramework(agentId, validateAgentName(agentName), enabled)
    )
  );

  return { ok: true };
}

export async function setGlobalAgentEnabled(agentName: string, enabled: boolean): Promise<{ ok: true }> {
  const cleanName = validateAgentName(agentName);
  let enabledByFramework: Map<AgentId, boolean>;
  const sourcePath = sourceFilePath(cleanName);

  await withConfigLock(async () => {
    const config = await readConfig();
    if (enabled) {
      config.globallyDisabled = config.globallyDisabled.filter((n) => n !== cleanName);
    } else {
      if (!config.globallyDisabled.includes(cleanName)) {
        config.globallyDisabled = [...config.globallyDisabled, cleanName].sort();
      }
    }
    enabledByFramework = new Map(
      AGENT_TARGETS.map((t) => [t.id, config.targets[t.id].enabledAgents.includes(cleanName)])
    );
    await writeConfig(config);
  });

  await Promise.all(
    AGENT_TARGETS.map(async (target) => {
      if (!isTargetInstalled(getTarget(target.id))) return;

      const config = await readConfig();
      const manifest = await readManifest(target.id);
      const currentStatus = await classifyAgentStatus({
        agentId: target.id,
        agentName: cleanName,
        sourcePath,
        agentsPath: target.agentsPath,
        enabled: config.targets[target.id].enabledAgents.includes(cleanName),
        installed: true,
        manifest
      });
      if (currentStatus === "conflict") return;

      if (!enabled) return syncAgentForFramework(target.id, cleanName, false);
      return enabledByFramework!.get(target.id)
        ? syncAgentForFramework(target.id, cleanName, true)
        : Promise.resolve();
    })
  );

  return { ok: true };
}

export async function batchSetGlobalAgentEnabled(
  ops: Array<{ agentName: string; enabled: boolean }>
): Promise<{ ok: true }> {
  if (!ops.length) return { ok: true };
  const validated = ops.map(({ agentName, enabled }) => ({ agentName: validateAgentName(agentName), enabled }));
  const syncOps: Array<{ agentId: AgentId; agentName: string; enabled: boolean }> = [];

  await withConfigLock(async () => {
    const config = await readConfig();
    const disabledSet = new Set(config.globallyDisabled);
    for (const { agentName, enabled } of validated) {
      if (enabled) disabledSet.delete(agentName);
      else disabledSet.add(agentName);
    }
    config.globallyDisabled = [...disabledSet].sort();
    await writeConfig(config);

    for (const { agentName, enabled } of validated) {
      for (const target of AGENT_TARGETS) {
        if (!isTargetInstalled(getTarget(target.id))) continue;
        if (enabled) {
          if (config.targets[target.id].enabledAgents.includes(agentName)) {
            syncOps.push({ agentId: target.id, agentName, enabled: true });
          }
        } else {
          syncOps.push({ agentId: target.id, agentName, enabled: false });
        }
      }
    }
  });

  await Promise.all(syncOps.map(async ({ agentId, agentName, enabled }) => {
    const target = getAgentTarget(agentId);
    const manifest = await readManifest(agentId);
    const config = await readConfig();
    const currentStatus = await classifyAgentStatus({
      agentId,
      agentName,
      sourcePath: sourceFilePath(agentName),
      agentsPath: target.agentsPath,
      enabled: config.targets[agentId].enabledAgents.includes(agentName),
      installed: isTargetInstalled(getTarget(agentId)),
      manifest
    });
    if (currentStatus === "conflict") return;
    await syncAgentForFramework(agentId, agentName, enabled);
  }));
  return { ok: true };
}

export async function saveAgentContent(agentName: string, content: string): Promise<{ ok: true }> {
  await ensureAgentsSystem();
  const cleanName = validateAgentName(agentName);
  await writeFile(sourceFilePath(cleanName), content, "utf-8");
  return { ok: true };
}

export async function readAgentContent(agentName: string): Promise<{ agentName: string; path: string; content: string }> {
  await ensureAgentsSystem();
  const cleanName = validateAgentName(agentName);
  const path = sourceFilePath(cleanName);
  if (!existsSync(path)) throw new Error("Agent not found");
  const content = await readFile(path, "utf-8");
  return { agentName: cleanName, path, content };
}

export async function createAgent(agentName: string): Promise<{ ok: true }> {
  await ensureAgentsSystem();
  const cleanName = validateAgentName(agentName);
  const path = sourceFilePath(cleanName);
  if (existsSync(path)) throw new Error("Agent already exists");
  const template = `---\nname: ${cleanName}\ndescription: Describe when Claude should delegate to this agent\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n\nYou are a specialized assistant. Describe the agent behavior and focus here.\n`;
  await writeFile(path, template, "utf-8");
  return { ok: true };
}

export async function deleteAgent(agentName: string): Promise<{ ok: true }> {
  await ensureAgentsDirs();
  const cleanName = validateAgentName(agentName);

  await removeAgentFromAllFrameworks(cleanName);

  const path = sourceFilePath(cleanName);
  if (existsSync(path)) await rm(path, { force: true });

  const config = await readConfig();
  for (const agentId of Object.keys(config.targets) as AgentId[]) {
    config.targets[agentId].enabledAgents = config.targets[agentId].enabledAgents.filter((n) => n !== cleanName);
  }
  config.globallyDisabled = config.globallyDisabled.filter((n) => n !== cleanName);
  await writeConfig(config);
  return { ok: true };
}

export async function resolveAgentConflict(agentId: AgentId, agentName: string): Promise<{ ok: true }> {
  await ensureAgentsDirs();
  const cleanName = validateAgentName(agentName);
  const target = getAgentTarget(agentId);
  if (!isTargetInstalled(getTarget(agentId))) throw new Error("Framework is not installed");

  const tgtPath = targetFilePath(target.agentsPath, cleanName);
  const st = await lstat(tgtPath).catch(() => null);
  if (st) await rm(tgtPath, { force: true });

  const manifest = await readManifest(agentId);
  delete manifest.entries[cleanName];
  await writeManifest(agentId, manifest);

  const config = await readConfig();
  const enabled = config.targets[agentId].enabledAgents.includes(cleanName)
    && !config.globallyDisabled.includes(cleanName);
  await syncAgentForFramework(agentId, cleanName, enabled);
  return { ok: true };
}
