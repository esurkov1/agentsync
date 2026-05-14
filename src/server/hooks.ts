import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_TARGETS as REGISTRY_TARGETS, type AgentId, getTarget, isTargetInstalled, pickPath } from "./agentRegistry";

type JsonObject = Record<string, unknown>;

type HookFramework = {
  agentId: AgentId;
  label: string;
  installed: boolean;
  supported: boolean;
  targetPath: string;
  discoveredEntries: number;
};

type HooksScope = "global" | "system" | "discovered";

type HooksStore = {
  managedBy: "agentsync";
  version: 2;
  mode: "safe-merge";
  seeded: boolean;
  globalHooks: JsonObject;
  systemHooks: Record<string, JsonObject>;
  discoveredHooks: Record<string, JsonObject>;
};

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const HOOKS_ROOT = join(BASE_DIR, "hooks");
const HOOKS_STORE_FILE = join(HOOKS_ROOT, "store.json");
const LEGACY_HOOKS_FILE = join(HOOKS_ROOT, "hooks.json");

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base: JsonObject, overlay: JsonObject): JsonObject {
  const out: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(value)) {
      out[key] = deepMerge(prev, value);
      continue;
    }
    out[key] = deepClone(value);
  }
  return out;
}

function countHookEntries(hooks: JsonObject): number {
  return Object.values(hooks).reduce<number>((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    if (isPlainObject(value)) return sum + Object.keys(value).length;
    return sum;
  }, 0);
}

function defaultStore(): HooksStore {
  return {
    managedBy: "agentsync",
    version: 2,
    mode: "safe-merge",
    seeded: false,
    globalHooks: {},
    systemHooks: {},
    discoveredHooks: {}
  };
}

async function ensureHooksDirs(): Promise<void> {
  await mkdir(HOOKS_ROOT, { recursive: true });
}

function normalizeIncomingHooks(raw: unknown): JsonObject {
  if (!isPlainObject(raw)) return {};
  if (isPlainObject(raw.hooks) && Object.keys(raw).length <= 2) {
    return deepClone(raw.hooks as JsonObject);
  }
  return deepClone(raw);
}

async function readStore(): Promise<HooksStore> {
  await ensureHooksDirs();

  if (existsSync(HOOKS_STORE_FILE)) {
    const raw = await readFile(HOOKS_STORE_FILE, "utf-8").catch(() => "{}");
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      return {
        managedBy: "agentsync",
        version: 2,
        mode: "safe-merge",
        seeded: parsed.seeded === true,
        globalHooks: isPlainObject(parsed.globalHooks) ? parsed.globalHooks : {},
        systemHooks: isPlainObject(parsed.systemHooks) ? parsed.systemHooks as Record<string, JsonObject> : {},
        discoveredHooks: isPlainObject(parsed.discoveredHooks) ? parsed.discoveredHooks as Record<string, JsonObject> : {}
      };
    }
  }

  const initial = defaultStore();
  if (existsSync(LEGACY_HOOKS_FILE)) {
    const legacyRaw = await readFile(LEGACY_HOOKS_FILE, "utf-8").catch(() => "{}");
    const legacyParsed = JSON.parse(legacyRaw);
    initial.globalHooks = normalizeIncomingHooks(legacyParsed);
  }
  await writeStore(initial);
  return initial;
}

async function writeStore(store: HooksStore): Promise<void> {
  await ensureHooksDirs();
  await writeFile(HOOKS_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function hooksTargetPath(agentId: AgentId): string | null {
  switch (agentId) {
    case "codex":
      return join(HOME, ".codex", "hooks.json");
    case "claude-code":
      return join(HOME, ".claude", "settings.json");
    case "gemini-cli":
      return join(HOME, ".gemini", "settings.json");
    case "qwen-code":
      return join(HOME, ".qwen", "settings.json");
    default:
      return null;
  }
}

function supportsHooks(agentId: AgentId): boolean {
  return hooksTargetPath(agentId) !== null;
}

// Finds the installed root directory of a Claude Code plugin (e.g. oh-my-claudecode).
// Returns the latest version path that contains scripts/run.cjs, or null.
function findClaudePluginRoot(marketplace: string, pluginName: string): string | null {
  const base = join(HOME, ".claude", "plugins", "cache", marketplace, pluginName);
  if (!existsSync(base)) return null;
  try {
    const versions = readdirSync(base).sort().reverse();
    for (const v of versions) {
      const candidate = join(base, v);
      if (existsSync(join(candidate, "scripts")) || existsSync(join(candidate, "hooks", "hooks.json"))) {
        return candidate;
      }
    }
  } catch {}
  return null;
}

// Resolves $CLAUDE_PLUGIN_ROOT / ${CLAUDE_PLUGIN_ROOT} in hook commands to the absolute path.
// Claude Code only sets CLAUDE_PLUGIN_ROOT when running plugin hooks.json — not settings.json hooks.
// Without resolution those hooks fail with "Cannot find module '/scripts/run.cjs'".
function resolvePluginEnvVars(hooks: JsonObject): JsonObject {
  const omcRoot = findClaudePluginRoot("omc", "oh-my-claudecode");
  if (!omcRoot) return hooks;
  // Two-pass: first remove JSON-escaped quotes around the variable, then replace bare variable.
  // e.g. in raw JSON: \"$CLAUDE_PLUGIN_ROOT\"/scripts → /abs/path/scripts
  const json = JSON.stringify(hooks)
    .replace(/\\"(\$\{CLAUDE_PLUGIN_ROOT\}|\$CLAUDE_PLUGIN_ROOT)\\"/g, omcRoot)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}|\$CLAUDE_PLUGIN_ROOT/g, omcRoot);
  return JSON.parse(json);
}

// Extracts the first absolute file path from a shell command string.
// Handles: node "/abs/path/file.mjs", node /abs/path/file.mjs arg, etc.
function extractFirstAbsPath(command: string): string | null {
  const m = command.match(/(?:^|\s)"?(\/[^\s"]+)"?/);
  return m ? m[1] : null;
}

function isHookCommandAlive(command: string): boolean {
  if (!command.includes("/")) return true; // relative command, can't check
  const path = extractFirstAbsPath(command);
  if (!path) return true;
  // Only prune if it looks like a script path (has an extension)
  if (!/\.\w+$/.test(path)) return true;
  return existsSync(path);
}

// Removes individual hook commands whose target script file doesn't exist on disk.
function pruneDeadCommands(hooks: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) { out[event] = entries; continue; }
    const cleaned = (entries as unknown[]).map((entry) => {
      if (!isPlainObject(entry)) return entry;
      const hookList = entry.hooks;
      if (!Array.isArray(hookList)) return entry;
      const live = hookList.filter((h) => {
        if (!isPlainObject(h)) return true;
        const cmd = h.command;
        if (typeof cmd !== "string") return true;
        return isHookCommandAlive(cmd);
      });
      if (live.length === hookList.length) return entry;
      if (live.length === 0) return null;
      return { ...entry, hooks: live };
    }).filter(Boolean);
    if (cleaned.length > 0) out[event] = cleaned;
  }
  return out;
}

async function readClaudeCodePluginHooks(): Promise<JsonObject> {
  const cacheRoot = join(HOME, ".claude", "plugins", "cache");
  if (!existsSync(cacheRoot)) return {};

  const merged: Record<string, unknown[]> = {};
  const marketplaces = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);

  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const mPath = join(cacheRoot, marketplace.name);
    const plugins = await readdir(mPath, { withFileTypes: true }).catch(() => []);
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const pPath = join(mPath, plugin.name);
      const versions = await readdir(pPath, { withFileTypes: true }).catch(() => []);
      for (const version of versions) {
        if (!version.isDirectory()) continue;
        const hooksFile = join(pPath, version.name, "hooks", "hooks.json");
        if (!existsSync(hooksFile)) continue;
        const raw = await readFile(hooksFile, "utf-8").catch(() => null);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const hooksObj = isPlainObject((parsed as JsonObject).hooks)
            ? (parsed as JsonObject).hooks as JsonObject
            : isPlainObject(parsed) ? parsed as JsonObject
            : null;
          if (!hooksObj) continue;
          for (const [event, entries] of Object.entries(hooksObj)) {
            if (event === "description" || event === "managedBy") continue;
            if (!Array.isArray(entries)) continue;
            if (!merged[event]) merged[event] = [];
            merged[event].push(...(entries as unknown[]));
          }
        } catch {}
      }
    }
  }

  return merged as JsonObject;
}

async function readHooksFromTarget(agentId: AgentId): Promise<JsonObject> {
  const targetPath = hooksTargetPath(agentId);

  let base: JsonObject = {};
  if (targetPath && existsSync(targetPath)) {
    const raw = await readFile(targetPath, "utf-8").catch(() => "{}");
    let parsed: unknown = {};
    try { parsed = JSON.parse(raw); } catch { /* */ }
    if (isPlainObject(parsed)) {
      base = agentId === "codex"
        ? normalizeIncomingHooks(parsed)
        : isPlainObject(parsed.hooks) ? deepClone(parsed.hooks as JsonObject) : {};
    }
  }

  if (agentId === "claude-code") {
    const pluginHooks = await readClaudeCodePluginHooks();
    if (Object.keys(pluginHooks).length > 0) return deepMerge(base, pluginHooks);
  }

  return base;
}

async function writeHooksToTarget(agentId: AgentId, hooks: JsonObject): Promise<void> {
  const targetPath = hooksTargetPath(agentId);
  if (!targetPath) return;

  await mkdir(join(targetPath, ".."), { recursive: true });

  // Resolve $CLAUDE_PLUGIN_ROOT → absolute path, then remove commands whose script is missing.
  const resolved = pruneDeadCommands(resolvePluginEnvVars(hooks));

  if (agentId === "codex") {
    await writeFile(targetPath, JSON.stringify(resolved, null, 2), "utf-8");
    return;
  }

  let settings: JsonObject = {};
  if (existsSync(targetPath)) {
    const raw = await readFile(targetPath, "utf-8").catch(() => "{}");
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) settings = parsed;
    } catch {}
  }
  settings.hooks = resolved;
  await writeFile(targetPath, JSON.stringify(settings, null, 2), "utf-8");
}

async function bootstrapDiscovery(store: HooksStore): Promise<HooksStore> {
  let changed = false;
  const next = deepClone(store);

  const supportedInstalled = REGISTRY_TARGETS
    .filter((target) => target.id !== "agents-shared")
    .filter((target) => supportsHooks(target.id) && isTargetInstalled(getTarget(target.id)));

  for (const target of supportedInstalled) {
    const cached = next.discoveredHooks[target.id];
    // Re-discover if not yet set OR if cached as empty (stale initial run)
    const needsDiscovery = !isPlainObject(cached) || Object.keys(cached).length === 0;
    if (!needsDiscovery) continue;
    const discovered = await readHooksFromTarget(target.id);
    next.discoveredHooks[target.id] = discovered;
    changed = true;
  }

  if (!next.seeded) {
    const firstNonEmpty = supportedInstalled
      .map((target) => next.discoveredHooks[target.id])
      .find((hooks) => isPlainObject(hooks) && Object.keys(hooks).length > 0);
    if (firstNonEmpty && Object.keys(next.globalHooks).length === 0) {
      next.globalHooks = deepClone(firstNonEmpty);
    }
    next.seeded = true;
    changed = true;
  }

  if (changed) await writeStore(next);
  return next;
}

function getFrameworks(store: HooksStore): HookFramework[] {
  return REGISTRY_TARGETS
    .filter((target) => target.id !== "agents-shared")
    .map((target) => {
      const targetPath = hooksTargetPath(target.id) ?? pickPath(target.homePaths);
      return {
        agentId: target.id,
        label: target.label,
        installed: isTargetInstalled(getTarget(target.id)),
        supported: supportsHooks(target.id),
        targetPath,
        discoveredEntries: countHookEntries(store.discoveredHooks[target.id] ?? {})
      };
    });
}

function buildManagedHooksForAgent(store: HooksStore, agentId: AgentId): JsonObject {
  let hooks = deepClone(store.globalHooks);
  if (isPlainObject(store.systemHooks[agentId])) {
    hooks = deepMerge(hooks, store.systemHooks[agentId]);
  }
  return hooks;
}

async function syncAgentHooks(agentId: AgentId, store: HooksStore): Promise<void> {
  if (!supportsHooks(agentId)) return;
  if (!isTargetInstalled(getTarget(agentId))) return;

  const managed = buildManagedHooksForAgent(store, agentId);
  await writeHooksToTarget(agentId, managed);
}

export async function ensureHooksSystem(): Promise<void> {
  const store = await readStore();
  await bootstrapDiscovery(store);
}

export async function getHooksState(): Promise<{
  sourcePath: string;
  frameworks: HookFramework[];
  content: string;
  mode: "safe-merge";
}> {
  const store = await bootstrapDiscovery(await readStore());
  return {
    sourcePath: HOOKS_STORE_FILE,
    frameworks: getFrameworks(store),
    content: JSON.stringify(store.globalHooks, null, 2),
    mode: "safe-merge"
  };
}

export async function saveHooksContent(content: string): Promise<{ ok: true }> {
  const parsed = JSON.parse(content);
  if (!isPlainObject(parsed)) throw new Error("Hooks content must be a JSON object");

  const store = await readStore();
  store.globalHooks = deepClone(parsed);
  await writeStore(store);
  await syncHooks();
  return { ok: true };
}

export async function syncHooks(): Promise<{ ok: true }> {
  const store = await bootstrapDiscovery(await readStore());
  const frameworks = getFrameworks(store).filter((framework) => framework.supported && framework.installed);
  await Promise.all(frameworks.map((framework) => syncAgentHooks(framework.agentId, store)));
  return { ok: true };
}

function validateAgentId(agentId: string): AgentId {
  const match = REGISTRY_TARGETS.find((target) => target.id === agentId);
  if (!match) throw new Error(`Unknown agentId: ${agentId}`);
  return match.id;
}

function readScopedHooks(store: HooksStore, scope: HooksScope, agentId?: string): JsonObject {
  if (scope === "global") return deepClone(store.globalHooks);
  if (!agentId) throw new Error("agentId is required for system/discovered scope");
  const id = validateAgentId(agentId);
  if (scope === "system") return deepClone(store.systemHooks[id] ?? {});
  return deepClone(store.discoveredHooks[id] ?? {});
}

export async function getHooksContent(
  scope: HooksScope,
  agentId?: string
): Promise<{ scope: HooksScope; agentId: string | null; content: string }> {
  // System and discovered scopes both read live from the agent's config file.
  if (scope === "system" || scope === "discovered") {
    if (!agentId) throw new Error("agentId required for system scope");
    const id = validateAgentId(agentId);
    if (!supportsHooks(id)) return { scope, agentId, content: "{}" };
    const live = await readHooksFromTarget(id);
    return { scope, agentId, content: JSON.stringify(live, null, 2) };
  }

  const store = await bootstrapDiscovery(await readStore());
  const scoped = readScopedHooks(store, scope, agentId);
  return { scope, agentId: agentId ?? null, content: JSON.stringify(scoped, null, 2) };
}

export async function saveHooksScopedContent(
  scope: HooksScope,
  content: string,
  agentId?: string
): Promise<{ ok: true }> {
  if (scope === "discovered") throw new Error("discovered scope is read-only");
  const parsed = JSON.parse(content);
  if (!isPlainObject(parsed)) throw new Error("Hooks content must be a JSON object");
  if (scope === "system") {
    // Write directly to the agent's config file.
    if (!agentId) throw new Error("agentId is required for system scope");
    const id = validateAgentId(agentId);
    await writeHooksToTarget(id, parsed);
    return { ok: true };
  }
  const store = await readStore();
  store.globalHooks = deepClone(parsed);
  await writeStore(store);
  return { ok: true };
}

function diffEntryCount(prev: JsonObject, next: JsonObject): { before: number; after: number } {
  return { before: countHookEntries(prev), after: countHookEntries(next) };
}

export async function previewHooksSync(): Promise<{
  mode: "safe-merge";
  frameworks: Array<{ agentId: AgentId; label: string; targetPath: string; beforeEntries: number; afterEntries: number }>;
}> {
  const store = await bootstrapDiscovery(await readStore());
  const frameworks = getFrameworks(store).filter((framework) => framework.supported && framework.installed);
  const result: Array<{ agentId: AgentId; label: string; targetPath: string; beforeEntries: number; afterEntries: number }> = [];
  for (const framework of frameworks) {
    const current = await readHooksFromTarget(framework.agentId);
    const managed = buildManagedHooksForAgent(store, framework.agentId);
    const counts = diffEntryCount(current, managed);
    result.push({
      agentId: framework.agentId,
      label: framework.label,
      targetPath: framework.targetPath,
      beforeEntries: counts.before,
      afterEntries: counts.after
    });
  }
  return { mode: "safe-merge", frameworks: result };
}
