import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_TARGETS as REGISTRY_TARGETS, type AgentId, getTarget, isTargetInstalled } from "./agentRegistry";

type PluginFrameworkState = {
  agentId: AgentId;
  label: string;
  installed: boolean;
  supported: boolean;
  notes: string;
  discoveredCount: number;
};

type MarketplaceEntry = {
  name: string;
  source: { source: "local"; path: string };
  policy: { installation: "AVAILABLE"; authentication: "ON_INSTALL" };
  category: "Productivity";
};

type PluginsStore = {
  managedBy: "agentsync";
  version: 2;
  discoveredBySystem: Record<string, string[]>;};

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const PLUGINS_ROOT = join(BASE_DIR, "plugins");
const PLUGINS_SOURCE_DIR = join(PLUGINS_ROOT, "source");
const PLUGINS_STORE_FILE = join(PLUGINS_ROOT, "store.json");

const MARKETPLACE_ROOT = join(HOME, ".agents");
const MARKETPLACE_DIR = join(MARKETPLACE_ROOT, "plugins");
const MARKETPLACE_FILE = join(MARKETPLACE_DIR, "marketplace.json");
const MARKETPLACE_PLUGINS_DIR = join(MARKETPLACE_DIR, "plugins");

function supportsPlugins(agentId: AgentId): boolean {
  return agentId === "codex" || agentId === "claude-code" || agentId === "github-copilot";
}

function isPluginDirectoryName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(name);
}

function normalizePluginId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").toLowerCase();
}

async function ensurePluginDirs(): Promise<void> {
  await mkdir(PLUGINS_SOURCE_DIR, { recursive: true });
  await mkdir(MARKETPLACE_PLUGINS_DIR, { recursive: true });
}

function defaultStore(): PluginsStore {
  return {
    managedBy: "agentsync",
    version: 2,
    discoveredBySystem: {},  };
}

async function readStore(): Promise<PluginsStore> {
  await ensurePluginDirs();
  if (!existsSync(PLUGINS_STORE_FILE)) {
    const store = defaultStore();
    await writeStore(store);
    return store;
  }
  const raw = await readFile(PLUGINS_STORE_FILE, "utf-8").catch(() => "{}");
  const parsed = JSON.parse(raw) as Partial<PluginsStore>;
  return {
    managedBy: "agentsync",
    version: 2,
    discoveredBySystem: parsed.discoveredBySystem && typeof parsed.discoveredBySystem === "object"
      ? parsed.discoveredBySystem
      : {}  };
}

async function writeStore(store: PluginsStore): Promise<void> {
  await ensurePluginDirs();
  await writeFile(PLUGINS_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function listSourcePlugins(): Promise<Array<{ id: string; path: string }>> {
  await ensurePluginDirs();
  const entries = await readdir(PLUGINS_SOURCE_DIR, { withFileTypes: true }).catch(() => []);
  const plugins: Array<{ id: string; path: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isPluginDirectoryName(entry.name)) continue;
    plugins.push({ id: entry.name, path: join(PLUGINS_SOURCE_DIR, entry.name) });
  }
  plugins.sort((a, b) => a.id.localeCompare(b.id));
  return plugins;
}

function pluginLooksValid(pluginPath: string): boolean {
  return (
    existsSync(join(pluginPath, ".codex-plugin", "plugin.json")) ||
    existsSync(join(pluginPath, ".claude-plugin", "plugin.json")) ||
    existsSync(join(pluginPath, ".plugin", "plugin.json")) ||
    existsSync(join(pluginPath, "plugin.json"))
  );
}

async function discoverFromClaude(): Promise<string[]> {
  const ids = new Set<string>();

  const settingsPath = join(HOME, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const raw = await readFile(settingsPath, "utf-8").catch(() => "{}");
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const enabled = parsed.enabledPlugins;
      if (enabled && typeof enabled === "object") {
        for (const key of Object.keys(enabled as Record<string, unknown>)) {
          const id = normalizePluginId(key.split("@")[0] || key);
          if (id) ids.add(id);
        }
      }
    } catch {}
  }

  const cacheRoot = join(HOME, ".claude", "plugins", "cache");
  const marketplaces = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const plugins = await readdir(join(cacheRoot, marketplace.name), { withFileTypes: true }).catch(() => []);
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const id = normalizePluginId(plugin.name);
      if (id) ids.add(id);
    }
  }

  return [...ids].sort();
}

async function discoverFromCodex(): Promise<string[]> {
  const ids = new Set<string>();
  const cacheRoot = join(HOME, ".codex", "plugins", "cache");
  const marketplaces = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const plugins = await readdir(join(cacheRoot, marketplace.name), { withFileTypes: true }).catch(() => []);
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const id = normalizePluginId(plugin.name);
      if (id) ids.add(id);
    }
  }
  return [...ids].sort();
}

async function discoverFromCopilot(): Promise<string[]> {
  const ids = new Set<string>();
  const installedRoot = join(HOME, ".copilot", "installed-plugins");
  const entries = await readdir(installedRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = normalizePluginId(entry.name.split("@")[0] || entry.name);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

async function ensureDiscoveredPluginStub(pluginId: string, discoveredFrom: string): Promise<void> {
  if (!pluginId || !isPluginDirectoryName(pluginId)) return;
  const dir = join(PLUGINS_SOURCE_DIR, pluginId);
  if (existsSync(dir)) return;
  await mkdir(join(dir, ".codex-plugin"), { recursive: true });
  await writeFile(
    join(dir, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: pluginId,
      version: "0.0.0-discovered",
      description: `Discovered from ${discoveredFrom}`
    }, null, 2),
    "utf-8"
  );
  await mkdir(join(dir, "skills"), { recursive: true });
}

async function bootstrapDiscovery(store: PluginsStore): Promise<PluginsStore> {
  const next: PluginsStore = {
    managedBy: "agentsync",
    version: 2,
    discoveredBySystem: { ...store.discoveredBySystem }
  };
  const discovered: Array<{ agentId: AgentId; ids: string[] }> = [
    { agentId: "claude-code", ids: await discoverFromClaude() },
    { agentId: "codex", ids: await discoverFromCodex() },
    { agentId: "github-copilot", ids: await discoverFromCopilot() }
  ];

  let changed = false;
  for (const item of discovered) {
    const prev = (next.discoveredBySystem[item.agentId] || []).slice().sort();
    const curr = item.ids.slice().sort();
    if (JSON.stringify(prev) !== JSON.stringify(curr)) {
      next.discoveredBySystem[item.agentId] = curr;
      changed = true;
    }
    for (const id of curr) {
      await ensureDiscoveredPluginStub(id, item.agentId);
    }
  }

  if (changed) await writeStore(next);
  return next;
}

function frameworkStates(store: PluginsStore): PluginFrameworkState[] {
  return REGISTRY_TARGETS
    .filter((target) => target.id !== "agents-shared")
    .map((target) => {
      const supported = supportsPlugins(target.id);
      const notes = supported
        ? "Safe sync via shared local marketplace + discovery import"
        : "No verified plugin marketplace/manifest sync path in AgentSync yet";
      return {
        agentId: target.id,
        label: target.label,
        installed: isTargetInstalled(getTarget(target.id)),
        supported,
        notes,
        discoveredCount: (store.discoveredBySystem[target.id] || []).length
      };
    });
}

function buildMarketplaceEntries(pluginIds: string[]): MarketplaceEntry[] {
  return pluginIds.map((id) => ({
    name: id,
    source: { source: "local", path: `./plugins/${id}` },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity"
  }));
}

async function readExistingMarketplace(): Promise<Record<string, unknown>> {
  if (!existsSync(MARKETPLACE_FILE)) {
    return { name: "agentsync-local", interface: { displayName: "AgentSync Local Plugins" }, plugins: [] };
  }
  const raw = await readFile(MARKETPLACE_FILE, "utf-8").catch(() => "{}");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {}
  return { name: "agentsync-local", interface: { displayName: "AgentSync Local Plugins" }, plugins: [] };
}

async function syncMarketplacePluginsDir(validPlugins: Array<{ id: string; path: string }>): Promise<void> {
  await mkdir(MARKETPLACE_PLUGINS_DIR, { recursive: true });
  const managedSet = new Set(validPlugins.map((plugin) => plugin.id));

  // Remove only managed entries that no longer exist in source. Leave unrelated local folders untouched.
  const existing = await readdir(MARKETPLACE_PLUGINS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of existing) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("agentsync-")) continue;
    const id = entry.name.slice("agentsync-".length);
    if (managedSet.has(id)) continue;
    await rm(join(MARKETPLACE_PLUGINS_DIR, entry.name), { recursive: true, force: true });
  }

  for (const plugin of validPlugins) {
    const dst = join(MARKETPLACE_PLUGINS_DIR, `agentsync-${plugin.id}`);
    await rm(dst, { recursive: true, force: true });
    await cp(plugin.path, dst, { recursive: true, force: true });
  }
}

export async function ensurePluginsSystem(): Promise<void> {
  await ensurePluginDirs();
  const store = await readStore();
  await bootstrapDiscovery(store);
}

async function countPluginContents(pluginPath: string): Promise<{ skills: number; agents: number; hooks: number; mcp: number }> {
  const counts = { skills: 0, agents: 0, hooks: 0, mcp: 0 };
  const skillsDir = join(pluginPath, "skills");
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))) counts.skills++;
    }
  }
  const agentsDir = join(pluginPath, "agents");
  if (existsSync(agentsDir)) {
    const entries = await readdir(agentsDir).catch(() => []);
    counts.agents = entries.filter((n) => n.endsWith(".md") && !["agents.md", "readme.md"].includes(n.toLowerCase())).length;
  }
  if (existsSync(join(pluginPath, "hooks.json")) || existsSync(join(pluginPath, "hooks", "hooks.json"))) {
    counts.hooks = 1;
  }
  const mcpDir = join(pluginPath, "mcp");
  if (existsSync(mcpDir)) {
    const entries = await readdir(mcpDir).catch(() => []);
    counts.mcp += entries.filter((n) => n.endsWith(".json")).length;
  }
  for (const candidate of [join(pluginPath, ".mcp.json"), join(pluginPath, "mcp.json")]) {
    if (existsSync(candidate)) { counts.mcp++; break; }
  }
  return counts;
}

export async function getPluginsState(): Promise<{
  sourcePath: string;
  marketplacePath: string;
  plugins: Array<{ id: string; path: string; valid: boolean; counts: { skills: number; agents: number; hooks: number; mcp: number } }>;
  frameworks: PluginFrameworkState[];
}> {
  const store = await bootstrapDiscovery(await readStore());
  const sourcePlugins = await listSourcePlugins();
  const sourceMap = new Map(sourcePlugins.map((plugin) => [plugin.id, plugin]));
  const plugins = [...sourceMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const pluginsWithCounts = await Promise.all(
    plugins.map(async (plugin) => ({
      id: plugin.id,
      path: plugin.path,
      valid: pluginLooksValid(plugin.path),
      counts: await countPluginContents(plugin.path)
    }))
  );
  return {
    sourcePath: PLUGINS_SOURCE_DIR,
    marketplacePath: MARKETPLACE_FILE,
    plugins: pluginsWithCounts,
    frameworks: frameworkStates(store)
  };
}

export async function syncPlugins(): Promise<{ ok: true; synced: number }> {
  await ensurePluginDirs();
  const store = await bootstrapDiscovery(await readStore());
  const sourcePlugins = await listSourcePlugins();
  const validPlugins = sourcePlugins.filter((plugin) => pluginLooksValid(plugin.path));

  await syncMarketplacePluginsDir(validPlugins);

  const existingMarketplace = await readExistingMarketplace();
  const prevPlugins = Array.isArray(existingMarketplace.plugins)
    ? existingMarketplace.plugins as Record<string, unknown>[]
    : [];

  const unmanaged = prevPlugins.filter((item) => {
    const path = item?.source && typeof item.source === "object"
      ? (item.source as Record<string, unknown>).path
      : null;
    const isManaged = typeof path === "string" && path.startsWith("./plugins/agentsync-");
    return !isManaged;
  });

  const managedEntries = buildMarketplaceEntries(validPlugins.map((plugin) => `agentsync-${plugin.id}`));
  const manifest = {
    name: "agentsync-local",
    interface: { displayName: "AgentSync Local Plugins" },
    plugins: [...unmanaged, ...managedEntries]
  };

  await mkdir(MARKETPLACE_DIR, { recursive: true });
  await writeFile(MARKETPLACE_FILE, JSON.stringify(manifest, null, 2), "utf-8");
  return { ok: true, synced: validPlugins.length };
}

export async function previewPluginsSync(): Promise<{
  sourceValid: string[];
  addManagedEntries: string[];
  keepUnmanagedEntries: string[];
}> {
  await ensurePluginDirs();
  const store = await bootstrapDiscovery(await readStore());
  const sourcePlugins = await listSourcePlugins();
  const valid = sourcePlugins.filter((plugin) => pluginLooksValid(plugin.path)).map((plugin) => plugin.id).sort();

  const existingMarketplace = await readExistingMarketplace();
  const prevPlugins = Array.isArray(existingMarketplace.plugins)
    ? existingMarketplace.plugins as Record<string, unknown>[]
    : [];
  const keepUnmanagedEntries = prevPlugins.flatMap((item) => {
    const name = typeof item?.name === "string" ? item.name : null;
    const path = item?.source && typeof item.source === "object"
      ? (item.source as Record<string, unknown>).path
      : null;
    const isManaged = typeof path === "string" && path.startsWith("./plugins/agentsync-");
    return !isManaged && name ? [name] : [];
  }).sort();

  const addManagedEntries = valid.map((id) => `agentsync-${id}`);
  return { sourceValid: valid, addManagedEntries, keepUnmanagedEntries };
}

export async function createPlugin(pluginId: string): Promise<{ ok: true }> {
  const id = normalizePluginId(pluginId);
  if (!isPluginDirectoryName(id)) {
    throw new Error("Invalid plugin ID: use letters, numbers, hyphens, underscores, and dots");
  }
  await ensurePluginDirs();
  const dir = join(PLUGINS_SOURCE_DIR, id);
  if (existsSync(dir)) throw new Error(`Plugin "${id}" already exists`);
  await mkdir(join(dir, ".codex-plugin"), { recursive: true });
  await writeFile(
    join(dir, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: id, version: "0.1.0", description: "" }, null, 2),
    "utf-8"
  );
  await mkdir(join(dir, "skills"), { recursive: true });
  return { ok: true };
}

export async function deletePlugin(pluginId: string): Promise<{ ok: true }> {
  const id = normalizePluginId(pluginId);
  if (!isPluginDirectoryName(id)) throw new Error("Invalid plugin ID");
  await rm(join(PLUGINS_SOURCE_DIR, id), { recursive: true, force: true });
  await rm(join(MARKETPLACE_PLUGINS_DIR, `agentsync-${id}`), { recursive: true, force: true }).catch(() => null);
  return { ok: true };
}

export type PluginContentItem = { id: string; path?: string; params?: Record<string, unknown> };
export type PluginContents = {
  pluginId: string;
  skills: PluginContentItem[];
  agents: PluginContentItem[];
  hookKeys: string[];
  mcp: PluginContentItem[];
};

export async function listPluginContents(pluginId: string): Promise<PluginContents> {
  const id = normalizePluginId(pluginId);
  if (!isPluginDirectoryName(id)) throw new Error("Invalid plugin ID");
  const root = join(PLUGINS_SOURCE_DIR, id);

  const skills: PluginContentItem[] = [];
  const agents: PluginContentItem[] = [];
  let hookKeys: string[] = [];
  const mcp: PluginContentItem[] = [];

  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(skillsDir, entry.name, "SKILL.md"))) skills.push({ id: entry.name, path: join(skillsDir, entry.name, "SKILL.md") });
    }
    skills.sort((a, b) => a.id.localeCompare(b.id));
  }

  const agentsDir = join(root, "agents");
  if (existsSync(agentsDir)) {
    const entries = await readdir(agentsDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const base = name.slice(0, -3).toLowerCase();
      if (base === "agents" || base === "readme") continue;
      agents.push({ id: base, path: join(agentsDir, name) });
    }
    agents.sort((a, b) => a.id.localeCompare(b.id));
  }

  for (const candidate of [join(root, "hooks.json"), join(root, "hooks", "hooks.json")]) {
    if (existsSync(candidate)) {
      const raw = await readFile(candidate, "utf-8").catch(() => "{}");
      try {
        const parsed = JSON.parse(raw);
        const hooksObj = parsed?.hooks ?? parsed;
        if (hooksObj && typeof hooksObj === "object") {
          hookKeys = Object.keys(hooksObj).filter((k) => k !== "managedBy");
        }
      } catch {}
      break;
    }
  }

  const mcpDir = join(root, "mcp");
  if (existsSync(mcpDir)) {
    const entries = await readdir(mcpDir).catch(() => []);
    for (const name of entries) {
      if (name.endsWith(".json")) {
        const raw = await readFile(join(mcpDir, name), "utf-8").catch(() => "{}");
        try {
          const parsed = JSON.parse(raw) as any;
          mcp.push({ id: name.slice(0, -5), path: join(mcpDir, name), params: parsed ?? undefined });
        } catch {
          mcp.push({ id: name.slice(0, -5), path: join(mcpDir, name) });
        }
      }
    }
  }
  for (const candidate of [join(root, ".mcp.json"), join(root, "mcp.json")]) {
    if (existsSync(candidate)) {
      const raw = await readFile(candidate, "utf-8").catch(() => "{}");
      try {
        const parsed = JSON.parse(raw) as any;
        const servers = parsed?.mcpServers;
        if (servers && typeof servers === "object") {
          for (const [name, def] of Object.entries(servers)) {
            if (!mcp.some((m) => m.id === name)) {
              mcp.push({ id: name, path: candidate, params: def as Record<string, unknown> ?? undefined });
            }
          }
        }
      } catch {}
      break;
    }
  }
  mcp.sort((a, b) => a.id.localeCompare(b.id));

  return { pluginId: id, skills, agents, hookKeys, mcp };
}

export async function readPluginManifest(pluginId: string): Promise<{ pluginId: string; path: string; content: string }> {
  const id = normalizePluginId(pluginId);
  if (!isPluginDirectoryName(id)) throw new Error("Invalid plugin ID");
  const root = join(PLUGINS_SOURCE_DIR, id);
  const candidates = [
    join(root, ".codex-plugin", "plugin.json"),
    join(root, ".claude-plugin", "plugin.json"),
    join(root, ".plugin", "plugin.json"),
    join(root, "plugin.json")
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`Plugin "${id}" manifest not found`);
  const content = await readFile(path, "utf-8");
  return { pluginId: id, path, content };
}

export async function savePluginManifest(pluginId: string, content: string): Promise<{ ok: true }> {
  const id = normalizePluginId(pluginId);
  if (!isPluginDirectoryName(id)) throw new Error("Invalid plugin ID");
  JSON.parse(content);

  const root = join(PLUGINS_SOURCE_DIR, id);
  const candidates = [
    join(root, ".codex-plugin", "plugin.json"),
    join(root, ".claude-plugin", "plugin.json"),
    join(root, ".plugin", "plugin.json"),
    join(root, "plugin.json")
  ];
  const path = candidates.find((candidate) => existsSync(candidate)) ?? join(root, ".codex-plugin", "plugin.json");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf-8");
  return { ok: true };
}
