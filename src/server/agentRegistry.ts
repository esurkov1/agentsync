import { existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const SHARED_AGENTS_HOME = join(HOME, ".agents");

export type AgentId = string;

export type AgentTarget = {
  id: AgentId;
  label: string;
  homePaths: string[];
  rulesFiles: string[];
  agentsPaths: string[];
  skillsPaths: string[];
  mcpConfigPaths: string[];
};

function r(id: string, label: string, cfg: Partial<AgentTarget> & { scopedFallback?: boolean }): AgentTarget {
  const sharedHome = join(SHARED_AGENTS_HOME, id);
  const scoped = cfg.scopedFallback ?? true;
  return {
    id,
    label,
    homePaths: [...(cfg.homePaths ?? []), ...(scoped ? [sharedHome] : [])],
    rulesFiles: [...(cfg.rulesFiles ?? []), ...(scoped ? [join(sharedHome, "AGENTS.md")] : [])],
    agentsPaths: [...(cfg.agentsPaths ?? []), ...(scoped ? [join(sharedHome, "agents")] : [])],
    skillsPaths: [...(cfg.skillsPaths ?? []), ...(scoped ? [join(sharedHome, "skills")] : [])],
    mcpConfigPaths: cfg.mcpConfigPaths ?? [],
  };
}

// Top 20 coding-agent frameworks we support by default.
export const AGENT_TARGETS: AgentTarget[] = [
  r("agents-shared", "Shared (.agents)", {
    scopedFallback: false,
    homePaths: [SHARED_AGENTS_HOME],
    rulesFiles: [join(SHARED_AGENTS_HOME, "AGENTS.md")],
    agentsPaths: [join(SHARED_AGENTS_HOME, "agents")],
    skillsPaths: [join(SHARED_AGENTS_HOME, "skills")],
  }),
  r("claude-code", "Claude Code", {
    homePaths: [join(HOME, ".claude")],
    rulesFiles: [join(HOME, ".claude", "CLAUDE.md")],
    agentsPaths: [join(HOME, ".claude", "agents")],
    skillsPaths: [join(HOME, ".claude", "skills")],
    mcpConfigPaths: [join(HOME, ".claude", "settings.json")],
  }),
  r("codex", "Codex", {
    homePaths: [join(HOME, ".codex")],
    rulesFiles: [join(HOME, ".codex", "AGENTS.md")],
    agentsPaths: [join(HOME, ".codex", "agents")],
    skillsPaths: [join(HOME, ".codex", "skills")],
    mcpConfigPaths: [join(HOME, ".codex", "config.toml")],
  }),
  r("opencode", "OpenCode", {
    homePaths: [join(HOME, ".config", "opencode")],
    rulesFiles: [join(HOME, ".config", "opencode", "AGENTS.md")],
    agentsPaths: [join(HOME, ".config", "opencode", "agents")],
    skillsPaths: [join(HOME, ".config", "opencode", "skills")],
    mcpConfigPaths: [join(HOME, ".config", "opencode", "config.json")],
  }),
  r("gemini-cli", "Gemini CLI", {
    homePaths: [join(HOME, ".gemini")],
    rulesFiles: [join(HOME, ".gemini", "GEMINI.md")],
    agentsPaths: [join(HOME, ".gemini", "agents")],
    skillsPaths: [join(HOME, ".gemini", "skills")],
    mcpConfigPaths: [join(HOME, ".gemini", "settings.json")],
  }),
  r("cursor", "Cursor", {
    homePaths: [join(HOME, ".cursor")],
    rulesFiles: [join(HOME, ".cursor", "AGENTS.md")],
  }),
  r("windsurf", "Windsurf", {
    homePaths: [join(HOME, ".windsurf")],
    rulesFiles: [join(HOME, ".windsurf", "AGENTS.md")],
  }),
  r("github-copilot", "GitHub Copilot", {
    homePaths: [join(HOME, ".github", "copilot")],
    rulesFiles: [join(HOME, ".github", "copilot", "instructions.md")],
  }),
  r("cline", "Cline", {
    homePaths: [join(HOME, ".cline")],
    rulesFiles: [join(HOME, ".cline", "AGENTS.md")],
  }),
  r("roo-code", "Roo Code", {
    homePaths: [join(HOME, ".roo")],
    rulesFiles: [join(HOME, ".roo", "AGENTS.md")],
  }),
  r("goose", "Goose", {
    homePaths: [join(HOME, ".config", "goose")],
    rulesFiles: [join(HOME, ".config", "goose", "AGENTS.md")],
  }),
  r("amp", "AMP", {
    homePaths: [join(HOME, ".amp")],
    rulesFiles: [join(HOME, ".amp", "AGENTS.md")],
  }),
  r("qodo-gen", "Qodo Gen", {
    homePaths: [join(HOME, ".qodo")],
    rulesFiles: [join(HOME, ".qodo", "AGENTS.md")],
  }),
  r("sourcegraph-cody", "Sourcegraph Cody", {
    homePaths: [join(HOME, ".sourcegraph")],
    rulesFiles: [join(HOME, ".sourcegraph", "AGENTS.md")],
  }),
  r("kilocode", "Kilo Code", {
    homePaths: [join(HOME, ".kilocode")],
    rulesFiles: [join(HOME, ".kilocode", "AGENTS.md")],
  }),
  r("openclaw", "OpenClaw", {
    homePaths: [join(HOME, ".openclaw")],
    rulesFiles: [join(HOME, ".openclaw", "AGENTS.md")],
  }),
  r("hermes", "Hermes", {
    homePaths: [join(HOME, ".hermes")],
    rulesFiles: [join(HOME, ".hermes", "AGENTS.md")],
  }),
  r("replit", "Replit Agent", {
    homePaths: [join(HOME, ".replit")],
    rulesFiles: [join(HOME, ".replit", "AGENTS.md")],
  }),
  r("warp", "Warp Agent", {
    homePaths: [join(HOME, ".warp")],
    rulesFiles: [join(HOME, ".warp", "AGENTS.md")],
  }),
];

export const AGENT_IDS = AGENT_TARGETS.map((target) => target.id);

export function getTarget(agentId: AgentId): AgentTarget {
  const target = AGENT_TARGETS.find((item) => item.id === agentId);
  if (!target) throw new Error(`Unknown agent: ${agentId}`);
  return target;
}

export function isTargetInstalled(target: AgentTarget): boolean {
  return target.homePaths.some((path) => existsSync(path));
}

export function pickPath(paths: string[]): string {
  return paths.find((path) => existsSync(path)) ?? paths[0] ?? "";
}

export function pickExistingPath(paths: string[]): string | null {
  return paths.find((path) => existsSync(path)) ?? null;
}
