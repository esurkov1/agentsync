import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AgentId = "claude-code" | "codex" | "opencode";
export type AgentMode = "global" | "local";
export type AgentStatus = "global" | "local" | "missing" | "not_installed" | "drift";

type Agent = { id: AgentId; label: string; homePath: string; filePath: string };

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE_DIR = join(HOME, ".agentsync");
const MASTER_FILE = join(BASE_DIR, "AGENTS.md");
const FRAMEWORKS_DIR = join(BASE_DIR, "frameworks");
const LOCAL_DIR = join(FRAMEWORKS_DIR, "local");

const AGENTS: Agent[] = [
  { id: "claude-code", label: "Claude Code", homePath: join(HOME, ".claude"), filePath: join(HOME, ".claude", "CLAUDE.md") },
  { id: "codex", label: "Codex", homePath: join(HOME, ".codex"), filePath: join(HOME, ".codex", "AGENTS.md") },
  { id: "opencode", label: "OpenCode", homePath: join(HOME, ".config", "opencode"), filePath: join(HOME, ".config", "opencode", "AGENTS.md") }
];

function localStorePath(agentId: AgentId): string {
  return join(LOCAL_DIR, agentId, "LOCAL.md");
}

async function ensureDirs(): Promise<void> {
  await mkdir(BASE_DIR, { recursive: true });
  await mkdir(FRAMEWORKS_DIR, { recursive: true });
  await mkdir(LOCAL_DIR, { recursive: true });
}

function getAgent(agentId: AgentId): Agent {
  const found = AGENTS.find((a) => a.id === agentId);
  if (!found) throw new Error(`Unknown agent: ${agentId}`);
  return found;
}

async function classifyAgent(agent: Agent): Promise<AgentStatus> {
  if (!existsSync(agent.homePath)) return "not_installed";
  if (!existsSync(agent.filePath)) return "missing";
  const st = await lstat(agent.filePath).catch(() => null);
  if (!st) return "missing";
  if (st.isSymbolicLink()) {
    const target = await realpath(agent.filePath).catch(() => "");
    if (target === MASTER_FILE) return "global";
    return "drift";
  }
  return "local";
}

async function ensureLocalArchive(agent: Agent): Promise<void> {
  const archive = localStorePath(agent.id);
  await mkdir(dirname(archive), { recursive: true });
  if (!existsSync(archive)) {
    const master = existsSync(MASTER_FILE) ? await readFile(MASTER_FILE, "utf-8") : "# AGENTS\n";
    await writeFile(archive, master, "utf-8");
  }
}

export async function ensureSystem(): Promise<void> {
  await ensureDirs();
  if (!existsSync(MASTER_FILE)) await writeFile(MASTER_FILE, "# AGENTS\n", "utf-8");
}

export async function getRulesState(): Promise<{
  masterPath: string;
  masterContent: string;
  agents: Array<{
    agentId: AgentId;
    label: string;
    path: string;
    installed: boolean;
    status: AgentStatus;
    mode: AgentMode;
    localStorePath: string;
    content: string;
  }>;
}> {
  await ensureSystem();
  const masterContent = await readFile(MASTER_FILE, "utf-8");
  const agents = await Promise.all(
    AGENTS.map(async (agent) => {
      const status = await classifyAgent(agent);
      const mode: AgentMode = status === "global" ? "global" : "local";
      let content = "";
      if (status === "global") content = masterContent;
      else if (existsSync(agent.filePath)) content = await readFile(agent.filePath, "utf-8").catch(() => "");
      return {
        agentId: agent.id,
        label: agent.label,
        path: agent.filePath,
        installed: existsSync(agent.homePath),
        status,
        mode,
        localStorePath: localStorePath(agent.id),
        content
      };
    })
  );
  return { masterPath: MASTER_FILE, masterContent, agents };
}

export async function saveMasterRules(content: string): Promise<{ ok: true }> {
  await ensureSystem();
  await writeFile(MASTER_FILE, content, "utf-8");
  return { ok: true };
}

export async function setAgentMode(agentId: AgentId, mode: AgentMode): Promise<{ ok: true }> {
  await ensureSystem();
  const agent = getAgent(agentId);
  if (!existsSync(agent.homePath)) throw new Error("Agent is not installed");
  const current = await classifyAgent(agent);
  const archive = localStorePath(agent.id);
  await mkdir(dirname(archive), { recursive: true });

  if (mode === "global") {
    if (current !== "global" && existsSync(agent.filePath)) {
      const st = await lstat(agent.filePath).catch(() => null);
      if (st && !st.isSymbolicLink()) {
        await copyFile(agent.filePath, archive);
      }
    }
    await mkdir(dirname(agent.filePath), { recursive: true });
    if (existsSync(agent.filePath)) await rm(agent.filePath, { force: true });
    await symlink(MASTER_FILE, agent.filePath);
    return { ok: true };
  }

  await ensureLocalArchive(agent);
  const localContent = await readFile(archive, "utf-8");
  await mkdir(dirname(agent.filePath), { recursive: true });
  if (existsSync(agent.filePath)) await rm(agent.filePath, { force: true });
  await writeFile(agent.filePath, localContent, "utf-8");
  return { ok: true };
}

export async function saveAgentLocalRules(agentId: AgentId, content: string): Promise<{ ok: true }> {
  await ensureSystem();
  const agent = getAgent(agentId);
  if (!existsSync(agent.homePath)) throw new Error("Agent is not installed");
  const archive = localStorePath(agent.id);
  await mkdir(dirname(archive), { recursive: true });
  await writeFile(archive, content, "utf-8");
  await mkdir(dirname(agent.filePath), { recursive: true });
  if (existsSync(agent.filePath)) await rm(agent.filePath, { force: true });
  await writeFile(agent.filePath, content, "utf-8");
  return { ok: true };
}
