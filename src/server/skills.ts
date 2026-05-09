import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_IDS, AGENT_TARGETS as REGISTRY_TARGETS, type AgentId, getTarget, isTargetInstalled, pickPath } from "./agentRegistry";

type AgentSkillsTarget = { id: AgentId; label: string; skillsPath: string };

type SkillsConfig = {
  targets: Record<AgentId, { mode: "symlink"; enabledSkills: string[] }>;
  globallyDisabled: string[];
  bootstrappedTargets: string[];
};

type AgentManifest = {
  managedBy: "agentsync";
  version: 1;
  entries: Record<string, { sourcePath: string; targetPath: string; mode: "symlink"; updatedAt: string }>;
};

type SkillStatus = "installed" | "available" | "local" | "conflict" | "missing" | "not_installed";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const SKILLS_ROOT = join(BASE_DIR, "skills");
const SKILLS_SOURCE_DIR = join(SKILLS_ROOT, "source");
const SKILLS_CONFIG_FILE = join(SKILLS_ROOT, "config.json");
const SKILLS_MANIFESTS_DIR = join(SKILLS_ROOT, "manifests");

const AGENT_TARGETS: AgentSkillsTarget[] = REGISTRY_TARGETS.map((target) => ({
  id: target.id,
  label: target.label,
  skillsPath: pickPath(target.skillsPaths)
}));

function getSkillTarget(agentId: AgentId): AgentSkillsTarget {
  const target = AGENT_TARGETS.find((item) => item.id === agentId);
  if (!target) throw new Error(`Unknown agent: ${agentId}`);
  return target;
}

function getManifestPath(agentId: AgentId): string {
  return join(SKILLS_MANIFESTS_DIR, `${agentId}.json`);
}

function sanitizeSkillId(name: string): string {
  return name.trim();
}

function validateSkillId(skillId: string): string {
  const trimmed = skillId.trim();
  if (!trimmed) throw new Error("skillId is required");
  if (/[/\\]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error(`Invalid skill ID: must not contain path separators`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new Error(`Invalid skill ID: use letters, numbers, hyphens, and underscores only`);
  }
  return trimmed;
}

async function ensureSkillsDirs(): Promise<void> {
  await mkdir(SKILLS_ROOT, { recursive: true });
  await mkdir(SKILLS_SOURCE_DIR, { recursive: true });
  await mkdir(SKILLS_MANIFESTS_DIR, { recursive: true });
}

function defaultConfig(): SkillsConfig {
  const targets = Object.fromEntries(AGENT_IDS.map((id) => [id, { mode: "symlink", enabledSkills: [] }])) as SkillsConfig["targets"];
  return { targets, globallyDisabled: [], bootstrappedTargets: [] };
}

async function readConfig(): Promise<SkillsConfig> {
  await ensureSkillsDirs();
  if (!existsSync(SKILLS_CONFIG_FILE)) {
    const cfg = defaultConfig();
    await writeFile(SKILLS_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
    return cfg;
  }

  const raw = await readFile(SKILLS_CONFIG_FILE, "utf-8").catch(() => "{}");
  let parsed: Partial<SkillsConfig> = {};
  try {
    parsed = JSON.parse(raw) as Partial<SkillsConfig>;
  } catch {
    const backupPath = `${SKILLS_CONFIG_FILE}.corrupt-${Date.now()}`;
    await rename(SKILLS_CONFIG_FILE, backupPath).catch(() => null);
    const cfg = defaultConfig();
    await writeFile(SKILLS_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
    return cfg;
  }
  const cfg = defaultConfig();
  for (const agentId of Object.keys(cfg.targets) as AgentId[]) {
    const incoming = parsed.targets?.[agentId];
    if (incoming) {
      cfg.targets[agentId] = {
        mode: "symlink",
        enabledSkills: Array.isArray(incoming.enabledSkills) ? incoming.enabledSkills.filter((v) => typeof v === "string") : []
      };
    }
  }
  cfg.globallyDisabled = Array.isArray(parsed.globallyDisabled)
    ? parsed.globallyDisabled.filter((v) => typeof v === "string")
    : [];
  cfg.bootstrappedTargets = Array.isArray(parsed.bootstrappedTargets)
    ? parsed.bootstrappedTargets.filter((v) => typeof v === "string")
    : [];
  return cfg;
}

async function writeConfig(config: SkillsConfig): Promise<void> {
  await ensureSkillsDirs();
  await writeFile(SKILLS_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

async function readManifest(agentId: AgentId): Promise<AgentManifest> {
  await ensureSkillsDirs();
  const path = getManifestPath(agentId);
  if (!existsSync(path)) {
    return { managedBy: "agentsync", version: 1, entries: {} };
  }
  const raw = await readFile(path, "utf-8").catch(() => "{}");
  let parsed: Partial<AgentManifest> = {};
  try {
    parsed = JSON.parse(raw) as Partial<AgentManifest>;
  } catch {
    const backupPath = `${path}.corrupt-${Date.now()}`;
    await rename(path, backupPath).catch(() => null);
    const clean: AgentManifest = { managedBy: "agentsync", version: 1, entries: {} };
    await writeFile(path, JSON.stringify(clean, null, 2), "utf-8");
    return clean;
  }
  return {
    managedBy: "agentsync",
    version: 1,
    entries: parsed.entries ?? {}
  };
}

async function writeManifest(agentId: AgentId, manifest: AgentManifest): Promise<void> {
  await ensureSkillsDirs();
  await writeFile(getManifestPath(agentId), JSON.stringify(manifest, null, 2), "utf-8");
}

// Global config mutex: serializes config read-modify-write
let configLock: Promise<void> = Promise.resolve();
function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  const prev = configLock;
  configLock = next;
  return prev.then(fn).finally(resolve) as Promise<T>;
}

// Per-agent mutex: serializes manifest read-modify-write to prevent concurrent corruption
const manifestLocks = new Map<AgentId, Promise<void>>();

function withManifestLock<T>(agentId: AgentId, fn: () => Promise<T>): Promise<T> {
  const prev = manifestLocks.get(agentId) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  manifestLocks.set(agentId, next);
  return prev.then(fn).finally(resolve) as Promise<T>;
}

async function listSourceSkills(): Promise<Array<{ id: string; path: string; content: string }>> {
  await ensureSkillsDirs();
  const dirEntries = await readdir(SKILLS_SOURCE_DIR, { withFileTypes: true });
  const skills: Array<{ id: string; path: string; content: string }> = [];
  for (const dir of dirEntries) {
    if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
    const skillId = sanitizeSkillId(dir.name);
    const skillPath = join(SKILLS_SOURCE_DIR, skillId);
    const skillMdPath = join(skillPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const content = await readFile(skillMdPath, "utf-8").catch(() => "");
    skills.push({ id: skillId, path: skillPath, content });
  }
  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

async function listSkillsFromPath(basePath: string): Promise<Array<{ id: string; path: string; content: string }>> {
  if (!existsSync(basePath)) return [];
  const dirEntries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  const skills: Array<{ id: string; path: string; content: string }> = [];
  for (const dir of dirEntries) {
    if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
    if (dir.name.startsWith(".")) continue;
    const skillId = sanitizeSkillId(dir.name);
    const skillPath = join(basePath, skillId);
    const skillMdPath = join(skillPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const content = await readFile(skillMdPath, "utf-8").catch(() => "");
    skills.push({ id: skillId, path: skillPath, content });
  }
  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

async function listSkillFilesRecursive(baseDir: string, rel = ""): Promise<string[]> {
  const dirPath = rel ? join(baseDir, rel) : baseDir;
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const entryRel = rel ? join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      const nested = await listSkillFilesRecursive(baseDir, entryRel);
      files.push(...nested);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const fullPath = join(baseDir, entryRel);
      const st = await lstat(fullPath).catch(() => null);
      if (!st) continue;
      const real = await realpath(fullPath).catch(() => "");
      if (!real) continue;
      const realSt = await lstat(real).catch(() => null);
      if (realSt?.isDirectory()) {
        const nested = await listSkillFilesRecursive(real, "");
        for (const item of nested) files.push(join(entryRel, item));
      } else {
        files.push(entryRel);
      }
      continue;
    }
    if (entry.isFile()) files.push(entryRel);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function discoverAgentSkills(): Promise<Array<{ id: string; path: string; content: string }>> {
  const discovered = new Map<string, { id: string; path: string; content: string }>();
  for (const target of AGENT_TARGETS) {
    if (!isTargetInstalled(getTarget(target.id))) continue;
    const items = await listSkillsFromPath(target.skillsPath);
    for (const item of items) {
      if (discovered.has(item.id)) continue;
      discovered.set(item.id, item);
    }
  }
  return [...discovered.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function bootstrapSourceFromAgents(excludedSkills: Set<string>): Promise<void> {
  await ensureSkillsDirs();
  const sourceSkills = await listSourceSkills();
  const sourceSet = new Set(sourceSkills.map((s) => s.id));
  const discovered = await discoverAgentSkills();

  for (const skill of discovered) {
    if (excludedSkills.has(skill.id)) continue;
    if (sourceSet.has(skill.id)) continue;
    const sourcePath = join(SKILLS_SOURCE_DIR, skill.id);
    const st = await lstat(skill.path).catch(() => null);
    if (!st) continue;
    const realSrc = st.isSymbolicLink() ? (await realpath(skill.path).catch(() => "")) : skill.path;
    if (!realSrc) continue;
    await cp(realSrc, sourcePath, { recursive: true, dereference: true }).catch(() => null);
  }
}

function parseSkillMeta(content: string): { name: string; description: string } {
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

async function classifyAgentSkillStatus(params: {
  agentId: AgentId;
  skillId: string;
  sourcePath: string;
  agentSkillsPath: string;
  enabled: boolean;
  installed: boolean;
  manifest: AgentManifest;
}): Promise<SkillStatus> {
  if (!params.installed) return "not_installed";
  const targetPath = join(params.agentSkillsPath, params.skillId);
  const targetExists = existsSync(targetPath);
  const entry = params.manifest.entries[params.skillId];

  if (!params.enabled) {
    if (!targetExists) return "available";
    if (entry) return "conflict";
    return "local";
  }

  if (!targetExists) return "missing";

  const isManaged = entry && entry.targetPath === targetPath;
  if (!isManaged) return "conflict";

  const symlinkOk = await isManagedSymlink(targetPath, params.sourcePath);
  if (!symlinkOk) return "conflict";

  return "installed";
}

async function syncSkillForAgent(agentId: AgentId, skillId: string, enabled: boolean): Promise<void> {
  const target = getSkillTarget(agentId);
  if (!isTargetInstalled(getTarget(agentId))) return;
  await mkdir(target.skillsPath, { recursive: true });

  const targetPath = join(target.skillsPath, skillId);

  await withManifestLock(agentId, async () => {
    const manifest = await readManifest(agentId);

    if (enabled) {
      const sourcePath = join(SKILLS_SOURCE_DIR, skillId);
      if (!existsSync(sourcePath)) return;

      const existingSt = await lstat(targetPath).catch(() => null);
      if (existingSt) {
        const prev = manifest.entries[skillId];
        if (!prev || prev.targetPath !== targetPath) return;
        await rm(targetPath, { recursive: true, force: true });
      }

      await symlink(sourcePath, targetPath);
      manifest.entries[skillId] = {
        sourcePath,
        targetPath,
        mode: "symlink",
        updatedAt: new Date().toISOString()
      };
    } else {
      const targetSt = await lstat(targetPath).catch(() => null);
      if (targetSt?.isSymbolicLink()) {
        await rm(targetPath, { force: true }).catch(() => null);
      }
      delete manifest.entries[skillId];
    }

    await writeManifest(agentId, manifest);
  });
}

async function removeSkillFromAllAgents(skillId: string): Promise<void> {
  for (const target of AGENT_TARGETS) {
    await syncSkillForAgent(target.id, skillId, false);
  }
}

async function purgeSkillFromAllKnownPaths(skillId: string): Promise<void> {
  await Promise.all(
    AGENT_TARGETS.map(async (target) => {
      const targetPath = join(target.skillsPath, skillId);
      await rm(targetPath, { recursive: true, force: true }).catch(() => null);
      await withManifestLock(target.id, async () => {
        const manifest = await readManifest(target.id);
        if (manifest.entries[skillId]) {
          delete manifest.entries[skillId];
          await writeManifest(target.id, manifest);
        }
      });
    })
  );
}

export async function ensureSkillsSystem(): Promise<void> {
  await ensureSkillsDirs();
  await readConfig();
  await bootstrapSourceFromAgents(new Set());
}

export async function syncSkills(): Promise<{ ok: true }> {
  await ensureSkillsSystem();
  const config = await readConfig();
  const sourceSkills = await listSourceSkills();
  const sourceMap = new Map(sourceSkills.map((s) => [s.id, s]));

  // Bootstrap newly detected installed agent systems with all existing skills
  const unbootstrapped = AGENT_TARGETS.filter(
    (t) => isTargetInstalled(getTarget(t.id)) && !config.bootstrappedTargets.includes(t.id)
  );
  if (unbootstrapped.length > 0 && sourceSkills.length > 0) {
    for (const target of unbootstrapped) {
      const current = new Set(config.targets[target.id].enabledSkills);
      for (const s of sourceSkills) current.add(s.id);
      config.targets[target.id].enabledSkills = [...current].sort();
      config.bootstrappedTargets.push(target.id);
    }
    await writeConfig(config);
  }

  for (const target of AGENT_TARGETS) {
    if (!isTargetInstalled(getTarget(target.id))) continue;
    await mkdir(target.skillsPath, { recursive: true });

    const manifest = await readManifest(target.id);
    const enabled = new Set(config.targets[target.id]?.enabledSkills ?? []);

    for (const skillId of enabled) {
      const source = sourceMap.get(skillId);
      if (!source) continue;
      const targetPath = join(target.skillsPath, skillId);
      const existing = await lstat(targetPath).catch(() => null);

      if (existing) {
        const prev = manifest.entries[skillId];
        const prevManaged = prev && prev.targetPath === targetPath;
        if (!prevManaged) continue;
        await rm(targetPath, { recursive: true, force: true });
      }

      await symlink(source.path, targetPath);
      manifest.entries[skillId] = {
        sourcePath: source.path,
        targetPath,
        mode: "symlink",
        updatedAt: new Date().toISOString()
      };
    }

    for (const [skillId, entry] of Object.entries(manifest.entries)) {
      if (enabled.has(skillId)) continue;
      const targetPath = join(target.skillsPath, skillId);
      const targetSt = await lstat(targetPath).catch(() => null);
      if (targetSt?.isSymbolicLink()) {
        await rm(targetPath, { force: true }).catch(() => null);
      }
      delete manifest.entries[skillId];
    }

    await writeManifest(target.id, manifest);
  }

  return { ok: true };
}

export async function getSkillsState(): Promise<{
  sourcePath: string;
  configPath: string;
  manifestPath: string;
  globallyDisabled: string[];
  skills: Array<{ id: string; path: string; name: string; description: string; content: string }>;
  agents: Array<{
    agentId: AgentId;
    label: string;
    installed: boolean;
    skillsPath: string;
    mode: "symlink";
    enabledSkills: string[];
    statuses: Record<string, SkillStatus>;
  }>;
}> {
  await ensureSkillsSystem();
  const config = await readConfig();
  const sourceSkills = await listSourceSkills();
  const discoveredSkills = await discoverAgentSkills();
  const discoveredMap = new Map(discoveredSkills.map((s) => [s.id, s]));

  const unionSkills = new Map<string, { id: string; path: string; content: string }>();
  for (const skill of discoveredSkills) unionSkills.set(skill.id, skill);
  for (const skill of sourceSkills) unionSkills.set(skill.id, skill);
  const skills = [...unionSkills.values()].sort((a, b) => a.id.localeCompare(b.id)).map((skill) => {
    const meta = parseSkillMeta(skill.content);
    return {
      id: skill.id,
      path: skill.path,
      name: meta.name || skill.id,
      description: meta.description,
      content: skill.content
    };
  });

  const agents = await Promise.all(
    AGENT_TARGETS.map(async (target) => {
      const installed = isTargetInstalled(getTarget(target.id));
      const manifest = await readManifest(target.id);
      const enabledSkills = config.targets[target.id]?.enabledSkills ?? [];
      const statuses: Record<string, SkillStatus> = {};

      for (const skill of skills) {
        const sourceItem = sourceSkills.find((s) => s.id === skill.id) ?? discoveredMap.get(skill.id);
        statuses[skill.id] = await classifyAgentSkillStatus({
          agentId: target.id,
          skillId: skill.id,
          sourcePath: sourceItem?.path || skill.path,
          agentSkillsPath: target.skillsPath,
          enabled: enabledSkills.includes(skill.id),
          installed,
          manifest
        });
      }

      return {
        agentId: target.id,
        label: target.label,
        installed,
        skillsPath: target.skillsPath,
        mode: "symlink" as const,
        enabledSkills,
        statuses
      };
    })
  );

  return {
    sourcePath: SKILLS_SOURCE_DIR,
    configPath: SKILLS_CONFIG_FILE,
    manifestPath: SKILLS_MANIFESTS_DIR,
    globallyDisabled: config.globallyDisabled,
    skills,
    agents
  };
}

export async function batchSetSkillEnabled(
  ops: Array<{ agentId: AgentId; skillId: string; enabled: boolean }>
): Promise<{ ok: true }> {
  if (!ops.length) return { ok: true };
  await ensureSkillsDirs();

  const byAgent = new Map<AgentId, Array<{ skillId: string; enabled: boolean }>>();
  for (const op of ops) {
    const list = byAgent.get(op.agentId) ?? [];
    list.push({ skillId: validateSkillId(op.skillId), enabled: op.enabled });
    byAgent.set(op.agentId, list);
  }

  const config = await readConfig();
  for (const [agentId, agentOps] of byAgent) {
    if (!isTargetInstalled(getTarget(agentId))) continue;
    const current = new Set(config.targets[agentId].enabledSkills);
    for (const { skillId, enabled } of agentOps) {
      if (enabled) current.add(skillId);
      else current.delete(skillId);
    }
    config.targets[agentId].enabledSkills = [...current].sort((a, b) => a.localeCompare(b));
  }
  await writeConfig(config);

  await Promise.all(
    ops.map(({ agentId, skillId, enabled }) =>
      syncSkillForAgent(agentId, validateSkillId(skillId), enabled)
    )
  );

  return { ok: true };
}

export async function setSkillEnabled(agentId: AgentId, skillId: string, enabled: boolean): Promise<{ ok: true }> {
  await ensureSkillsDirs();
  if (!isTargetInstalled(getTarget(agentId))) throw new Error("Agent is not installed");

  const cleanSkill = validateSkillId(skillId);
  let isGloballyDisabled = false;
  await withConfigLock(async () => {
    const config = await readConfig();
    const current = new Set(config.targets[agentId].enabledSkills);
    if (enabled) current.add(cleanSkill);
    else current.delete(cleanSkill);
    config.targets[agentId].enabledSkills = [...current].sort((a, b) => a.localeCompare(b));
    isGloballyDisabled = config.globallyDisabled.includes(cleanSkill);
    await writeConfig(config);
  });
  if (!isGloballyDisabled) await syncSkillForAgent(agentId, cleanSkill, enabled);
  return { ok: true };
}

export async function setGlobalSkillEnabled(skillId: string, enabled: boolean): Promise<{ ok: true }> {
  const cleanId = validateSkillId(skillId);
  let enabledSkillsByAgent: Map<AgentId, boolean>;

  await withConfigLock(async () => {
    const config = await readConfig();
    if (enabled) {
      config.globallyDisabled = config.globallyDisabled.filter((id) => id !== cleanId);
    } else {
      if (!config.globallyDisabled.includes(cleanId)) {
        config.globallyDisabled = [...config.globallyDisabled, cleanId].sort();
      }
    }
    enabledSkillsByAgent = new Map(
      AGENT_TARGETS.map((t) => [t.id, config.targets[t.id].enabledSkills.includes(cleanId)])
    );
    await writeConfig(config);
  });

  await Promise.all(
    AGENT_TARGETS.map((target) => {
      if (!isTargetInstalled(getTarget(target.id))) return Promise.resolve();
      if (!enabled) return syncSkillForAgent(target.id, cleanId, false);
      return enabledSkillsByAgent!.get(target.id)
        ? syncSkillForAgent(target.id, cleanId, true)
        : Promise.resolve();
    })
  );

  return { ok: true };
}

export async function batchSetGlobalEnabled(
  ops: Array<{ skillId: string; enabled: boolean }>
): Promise<{ ok: true }> {
  if (!ops.length) return { ok: true };
  const validated = ops.map(({ skillId, enabled }) => ({ skillId: validateSkillId(skillId), enabled }));
  const syncOps: Array<{ agentId: AgentId; skillId: string; enabled: boolean }> = [];

  await withConfigLock(async () => {
    const config = await readConfig();
    const disabledSet = new Set(config.globallyDisabled);
    for (const { skillId, enabled } of validated) {
      if (enabled) disabledSet.delete(skillId);
      else disabledSet.add(skillId);
    }
    config.globallyDisabled = [...disabledSet].sort();
    await writeConfig(config);

    for (const { skillId, enabled } of validated) {
      for (const target of AGENT_TARGETS) {
        if (!isTargetInstalled(getTarget(target.id))) continue;
        if (enabled) {
          if (config.targets[target.id].enabledSkills.includes(skillId)) {
            syncOps.push({ agentId: target.id, skillId, enabled: true });
          }
        } else {
          syncOps.push({ agentId: target.id, skillId, enabled: false });
        }
      }
    }
  });

  await Promise.all(syncOps.map(({ agentId, skillId, enabled }) =>
    syncSkillForAgent(agentId, skillId, enabled)
  ));
  return { ok: true };
}

export async function saveSkillContent(skillId: string, content: string): Promise<{ ok: true }> {
  await ensureSkillsSystem();
  const cleanSkill = validateSkillId(skillId);
  const skillDir = join(SKILLS_SOURCE_DIR, cleanSkill);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
  return { ok: true };
}

export function getSkillFolderPath(skillId: string): string {
  return join(SKILLS_SOURCE_DIR, validateSkillId(skillId));
}

export async function createSkill(skillId: string): Promise<{ ok: true }> {
  await ensureSkillsSystem();
  const cleanSkill = validateSkillId(skillId);
  const skillDir = join(SKILLS_SOURCE_DIR, cleanSkill);
  if (existsSync(skillDir)) throw new Error("Skill already exists");
  await mkdir(skillDir, { recursive: true });
  const template = `---\nname: ${cleanSkill}\ndescription: Describe what this skill does\n---\n\n## What I do\n\n-\n\n## When to use me\n\n`;
  await writeFile(join(skillDir, "SKILL.md"), template, "utf-8");

  await withConfigLock(async () => {
    const config = await readConfig();
    config.globallyDisabled = config.globallyDisabled.filter((id) => id !== cleanSkill);
    for (const agentId of Object.keys(config.targets) as AgentId[]) {
      if (!isTargetInstalled(getTarget(agentId))) continue;
      const current = new Set(config.targets[agentId].enabledSkills);
      current.add(cleanSkill);
      config.targets[agentId].enabledSkills = [...current].sort();
    }
    await writeConfig(config);
  });

  await Promise.all(
    AGENT_TARGETS.filter((t) => isTargetInstalled(getTarget(t.id)))
      .map((t) => syncSkillForAgent(t.id, cleanSkill, true))
  );

  return { ok: true };
}

export async function deleteSkill(skillId: string): Promise<{ ok: true }> {
  await ensureSkillsDirs();
  const cleanSkill = validateSkillId(skillId);

  await removeSkillFromAllAgents(cleanSkill);
  await purgeSkillFromAllKnownPaths(cleanSkill);

  const skillDir = join(SKILLS_SOURCE_DIR, cleanSkill);
  if (existsSync(skillDir)) {
    await rm(skillDir, { recursive: true, force: true });
  }

  const config = await readConfig();
  for (const agentId of Object.keys(config.targets) as AgentId[]) {
    config.targets[agentId].enabledSkills = config.targets[agentId].enabledSkills.filter((id) => id !== cleanSkill);
  }
  await writeConfig(config);
  return { ok: true };
}

export async function readSkillContent(skillId: string): Promise<{ skillId: string; path: string; content: string; files: string[] }> {
  await ensureSkillsSystem();
  const cleanSkill = validateSkillId(skillId);
  const skillPath = join(SKILLS_SOURCE_DIR, cleanSkill, "SKILL.md");
  if (existsSync(skillPath)) {
    const content = await readFile(skillPath, "utf-8");
    const files = await listSkillFilesRecursive(join(SKILLS_SOURCE_DIR, cleanSkill));
    return { skillId: cleanSkill, path: skillPath, content, files };
  }
  const pluginsSourceDir = join(BASE_DIR, "plugins", "source");
  for (const entry of await readdir(pluginsSourceDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const p = join(pluginsSourceDir, entry.name, "skills", cleanSkill, "SKILL.md");
    if (existsSync(p)) {
      const content = await readFile(p, "utf-8");
      const files = await listSkillFilesRecursive(join(pluginsSourceDir, entry.name, "skills", cleanSkill));
      return { skillId: cleanSkill, path: p, content, files };
    }
  }
  throw new Error("Skill not found");
}

export async function resolveSkillConflict(agentId: AgentId, skillId: string): Promise<{ ok: true }> {
  await ensureSkillsDirs();
  const cleanSkill = validateSkillId(skillId);
  const target = getSkillTarget(agentId);
  if (!isTargetInstalled(getTarget(agentId))) throw new Error("Agent is not installed");

  const targetPath = join(target.skillsPath, cleanSkill);
  const st = await lstat(targetPath).catch(() => null);
  if (st) {
    await rm(targetPath, { recursive: true, force: true });
  }

  const manifest = await readManifest(agentId);
  delete manifest.entries[cleanSkill];
  await writeManifest(agentId, manifest);

  const config = await readConfig();
  const enabled = config.targets[agentId].enabledSkills.includes(cleanSkill);
  await syncSkillForAgent(agentId, cleanSkill, enabled);
  return { ok: true };
}

export function getOpenCodeSkillDiscoveryNote(): string {
  return "OpenCode global skills path: ~/.config/opencode/skills/<name>/SKILL.md (docs updated May 6, 2026).";
}
