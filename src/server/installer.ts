import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { batchSetSkillEnabled, syncSkills } from "./skills";
import { batchSetAgentEnabled, syncAgents } from "./agents";
import { setMcpEnabled, syncAllMcp } from "./mcpServers";
import { getHooksContent, saveHooksScopedContent, syncHooks } from "./hooks";
import { syncPlugins } from "./plugins";
import { AGENT_IDS, getTarget, isTargetInstalled } from "./agentRegistry";

const execFileAsync = promisify(execFile);

async function getGhToken(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 5000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function getGhAuthStatus(): Promise<{ authenticated: boolean; login?: string }> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 5000 });
    const token = stdout.trim();
    if (!token) return { authenticated: false };
    try {
      const { stdout: userOut } = await execFileAsync("gh", ["api", "user", "--jq", ".login"], { timeout: 5000 });
      return { authenticated: true, login: userOut.trim() || undefined };
    } catch {
      return { authenticated: true };
    }
  } catch {
    return { authenticated: false };
  }
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const BASE = join(HOME, ".agentsync");
const SKILLS_SOURCE = join(BASE, "skills", "source");
const AGENTS_SOURCE = join(BASE, "agents", "source");
const MCP_SOURCE = join(BASE, "mcp", "source");
const PLUGINS_SOURCE = join(BASE, "plugins", "source");

type InstallType = "skills" | "agents" | "mcp" | "hooks" | "plugins";
export type ScanItem = {
  type: InstallType;
  id: string;
  relPath: string;
  details?: string;
  description?: string;
  sourceRelPath?: string;
  mcpParams?: Record<string, unknown>;
  pluginId?: string;
  installed?: boolean;
};
type McpServerPreview = {
  name: string;
  transport: "stdio" | "http" | "sse" | "unknown";
  command?: string;
  url?: string;
  argsCount?: number;
  envKeys?: string[];
};
type ScanItemWithMeta = ScanItem & { mcpServers?: McpServerPreview[] };
type PluginDef = { id: string; prefix: string };

type RepoRef = { owner: string; repo: string; ref: string };
type TreeItem = { path: string; type: "blob" | "tree"; sha: string; mode: string; url: string };
type RefResponse = { object?: { sha?: string } };
type TreeResponse = { truncated?: boolean; tree?: TreeItem[] };

function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").toLowerCase();
}

function normalizeMcpIdFromPath(path: string): string {
  let id = path;
  if (id.endsWith(".json")) id = id.slice(0, -5);
  if (id.endsWith(".mcp")) id = id.slice(0, -4);
  if (id.endsWith("_mcp")) id = id.slice(0, -4);
  if (id.endsWith("-mcp")) id = id.slice(0, -4);
  return sanitizeId(id);
}

function parseGithubUrl(url: string): { owner: string; repo: string; refHint: string | null } {
  const trimmed = url.trim();
  const match = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/?#]+))?/i);
  if (!match) throw new Error("Use GitHub URL format: https://github.com/owner/repo");
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ""),
    refHint: match[3] || null
  };
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agentsync"
  };
  if (token?.trim()) h.Authorization = `Bearer ${token.trim()}`;
  return h;
}

async function ghJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return await res.json() as T;
}

async function ghText(url: string, token?: string): Promise<string> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub raw error ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return await res.text();
}

async function resolveRef(owner: string, repo: string, refHint: string | null, token?: string): Promise<RepoRef> {
  const candidates = [refHint, "main", "master"].filter(Boolean) as string[];
  let lastError = "";
  for (const ref of candidates) {
    try {
      const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`;
      const payload = await ghJson<RefResponse>(endpoint, token);
      if (payload.object?.sha) return { owner, repo, ref };
    } catch (e: any) {
      lastError = e?.message || "unknown error";
    }
  }
  throw new Error(`Cannot resolve branch for ${owner}/${repo}. ${lastError}`);
}

async function loadTree(ref: RepoRef, token?: string): Promise<TreeItem[]> {
  const refEndpoint = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/ref/heads/${encodeURIComponent(ref.ref)}`;
  const refPayload = await ghJson<RefResponse>(refEndpoint, token);
  const sha = refPayload.object?.sha;
  if (!sha) throw new Error("Branch SHA not found");

  const treeEndpoint = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/trees/${sha}?recursive=1`;
  const treePayload = await ghJson<TreeResponse>(treeEndpoint, token);
  if (treePayload.truncated) {
    throw new Error("Repository tree is too large for recursive API response (truncated). Use narrower repo structure or split content.");
  }
  return (treePayload.tree || []).filter((i) => i.type === "blob");
}

function buildRawUrl(ref: RepoRef, path: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${encodeURIComponent(ref.ref)}/${path}`;
}

function extractFrontmatterField(content: string, field: string): string {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}


async function fetchContentsBatch(ref: RepoRef, paths: string[], token?: string): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (!paths.length || !token) return results;

  const BATCH_SIZE = 100;
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    batches.push(paths.slice(i, i + BATCH_SIZE));
  }

  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "agentsync",
    Authorization: `Bearer ${token}`
  };

  await Promise.all(batches.map(async (batch) => {
    const fields = batch.map((path, idx) => {
      const escaped = path.replace(/\\/g, "/").replace(/"/g, '\\"');
      return `f${idx}: object(expression: "${ref.ref}:${escaped}") { ... on Blob { text } }`;
    }).join(" ");
    const query = `query { repository(owner: "${ref.owner}", name: "${ref.repo}") { ${fields} } }`;

    try {
      const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: h, body: JSON.stringify({ query }) });
      if (!res.ok) return;
      const data = await res.json() as any;
      const repo = data?.data?.repository;
      if (!repo) return;
      batch.forEach((path, idx) => {
        const text = repo[`f${idx}`]?.text;
        if (typeof text === "string") results.set(path, text);
      });
    } catch {}
  }));

  return results;
}

async function summarizeMcpFile(ref: RepoRef, relPath: string, token?: string): Promise<McpServerPreview[]> {
  try {
    const content = await ghText(buildRawUrl(ref, relPath), token);
    const parsed = JSON.parse(content) as any;
    const obj = parsed?.mcpServers;
    if (!obj || typeof obj !== "object") return [];
    const previews: McpServerPreview[] = [];
    for (const [name, def] of Object.entries(obj as Record<string, any>)) {
      const transport: McpServerPreview["transport"] =
        def?.type === "stdio" || def?.type === "http" || def?.type === "sse"
          ? def.type
          : def?.url
          ? "http"
          : def?.command
          ? "stdio"
          : "unknown";
      previews.push({
        name,
        transport,
        ...(typeof def?.command === "string" ? { command: def.command } : {}),
        ...(typeof def?.url === "string" ? { url: def.url } : {}),
        ...(Array.isArray(def?.args) ? { argsCount: def.args.length } : {}),
        ...(def?.env && typeof def.env === "object" ? { envKeys: Object.keys(def.env) } : {})
      });
    }
    return previews.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function parseMcpServersFromFile(
  ref: RepoRef,
  relPath: string,
  token?: string
): Promise<Record<string, Record<string, unknown>>> {
  try {
    const content = await ghText(buildRawUrl(ref, relPath), token);
    const parsed = JSON.parse(content) as any;
    const obj = parsed?.mcpServers;
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [name, def] of Object.entries(obj as Record<string, unknown>)) {
      if (def && typeof def === "object" && !Array.isArray(def)) {
        out[name] = def as Record<string, unknown>;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function detectPluginDefs(fileSet: Set<string>, files: string[], repoName: string): PluginDef[] {
  const plugins: PluginDef[] = [];
  const rootManifests = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".plugin/plugin.json", "plugin.json"];
  for (const m of rootManifests) {
    if (fileSet.has(m)) {
      plugins.push({ id: sanitizeId(repoName), prefix: "" });
      break;
    }
  }
  for (const p of files) {
    const m = p.match(/^plugins\/([^/]+)\/(?:(?:\.codex-plugin|\.claude-plugin|\.plugin)\/)?plugin\.json$/);
    if (m) {
      const id = sanitizeId(m[1]);
      if (!plugins.some((pl) => pl.id === id)) plugins.push({ id, prefix: `plugins/${m[1]}/` });
    }
  }
  return plugins;
}

function resolvePlugin(path: string, plugins: PluginDef[]): string | undefined {
  let best: PluginDef | undefined;
  for (const p of plugins) {
    if (p.prefix === "" || path.startsWith(p.prefix)) {
      if (!best || p.prefix.length > best.prefix.length) best = p;
    }
  }
  return best?.id;
}

async function detectItems(ref: RepoRef, files: string[], repoName: string, token?: string): Promise<ScanItemWithMeta[]> {
  const items: ScanItemWithMeta[] = [];
  const seen = new Set<string>();
  const fileSet = new Set(files);
  const add = (item: ScanItemWithMeta) => {
    const key = `${item.type}:${item.id}:${item.relPath}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const plugins = detectPluginDefs(fileSet, files, repoName);
  const pid = (path: string) => resolvePlugin(path, plugins);

  if (fileSet.has("hooks.json")) add({ type: "hooks", id: "global", relPath: "hooks.json", pluginId: pid("hooks.json") });
  if (fileSet.has("SKILL.md")) add({ type: "skills", id: sanitizeId(repoName), relPath: ".", pluginId: pid("SKILL.md") });

  for (const p of files) {
    // skills/<name>/SKILL.md  OR  plugins/<plugin>/skills/<name>/SKILL.md
    const skillMatch = p.match(/^(?:plugins\/([^/]+)\/)?skills\/([^/]+)\/SKILL\.md$/);
    if (skillMatch) {
      const pf = skillMatch[1], name = skillMatch[2];
      add({
        type: "skills",
        id: sanitizeId(name),
        relPath: pf ? `plugins/${pf}/skills/${name}` : `skills/${name}`,
        pluginId: pf ? sanitizeId(pf) : pid(`skills/${name}/SKILL.md`)
      });
    }

    // <name>/SKILL.md at root level (directory-based skills without skills/ prefix)
    const rootDirSkillMatch = p.match(/^([^/]+)\/SKILL\.md$/);
    if (rootDirSkillMatch && rootDirSkillMatch[1] !== "skills") {
      const name = rootDirSkillMatch[1];
      add({ type: "skills", id: sanitizeId(name), relPath: name, pluginId: pid(p) });
    }

    // agents/<name>.md  OR  plugins/<plugin>/agents/<name>.md
    const agentMatch = p.match(/^(?:plugins\/([^/]+)\/)?agents\/([^/]+)\.md$/);
    if (agentMatch && agentMatch[2].toUpperCase() !== "AGENTS") {
      const pf = agentMatch[1], name = agentMatch[2];
      add({ type: "agents", id: sanitizeId(name), relPath: p, pluginId: pf ? sanitizeId(pf) : pid(p) });
    }

    // mcp/<name>.json  OR  plugins/<plugin>/mcp/<name>.json
    const mcpMatch = p.match(/^(?:plugins\/([^/]+)\/)?mcp\/([^/]+)\.json$/);
    if (mcpMatch) {
      const pf = mcpMatch[1], name = mcpMatch[2];
      add({ type: "mcp", id: normalizeMcpIdFromPath(name), relPath: p, pluginId: pf ? sanitizeId(pf) : pid(p) });
    }

    // root-level *.json with "mcp" in name
    if (!p.includes("/") && p.endsWith(".json") && p.toLowerCase().includes("mcp")) {
      add({ type: "mcp", id: normalizeMcpIdFromPath(p), relPath: p, pluginId: pid(p) });
    }

    // hooks.json inside a plugin subdir
    const hooksMatch = p.match(/^plugins\/([^/]+)\/hooks\.json$/);
    if (hooksMatch) {
      add({ type: "hooks", id: sanitizeId(hooksMatch[1]), relPath: p, pluginId: sanitizeId(hooksMatch[1]) });
    }

    // root-level agent *.md shorthand
    if (!p.includes("/") && p.endsWith(".md")) {
      const base = p.slice(0, -3).toLowerCase();
      if (base.includes("agent") && base !== "agents" && base !== "readme" && base !== "skill") {
        add({ type: "agents", id: sanitizeId(base), relPath: p, pluginId: pid(p) });
      }
    }
  }

  // Fallback: category-based repos (e.g. academic/agent-name.md, game-dev/blender/tool.md)
  // Activates when no standard agents/ folder exists. Treats any .md file in non-root
  // non-ignored subdirectories as an agent.
  const hasStandardAgents = files.some((p) => p.startsWith("agents/") && p.endsWith(".md"));
  if (!hasStandardAgents) {
    const IGNORED_TOP_DIRS = new Set(["agents", "skills", "mcp", "plugins", "hooks", "examples", ".github", ".git"]);
    const IGNORED_FILENAMES = new Set(["readme.md", "contributing.md", "changelog.md", "security.md", "license.md", "pull_request_template.md", "code_of_conduct.md"]);
    for (const p of files) {
      if (!p.includes("/") || !p.endsWith(".md")) continue;
      const parts = p.split("/");
      const topDir = parts[0].toLowerCase();
      const filename = parts[parts.length - 1].toLowerCase();
      if (topDir.startsWith(".") || IGNORED_TOP_DIRS.has(topDir)) continue;
      if (IGNORED_FILENAMES.has(filename)) continue;
      const nameBase = parts[parts.length - 1].slice(0, -3);
      add({ type: "agents", id: sanitizeId(nameBase), relPath: p, pluginId: pid(p) });
    }
  }

  // Collect paths needing descriptions, then fetch all in batched GraphQL requests
  const descPaths: string[] = [];
  for (const item of items) {
    if (item.type === "skills") {
      const p = item.relPath === "." ? "SKILL.md" : `${item.relPath}/SKILL.md`;
      if (fileSet.has(p)) descPaths.push(p);
    } else if (item.type === "agents" && fileSet.has(item.relPath)) {
      descPaths.push(item.relPath);
    }
  }
  const descContents = await fetchContentsBatch(ref, descPaths, token);
  for (const item of items) {
    if (item.type === "skills") {
      const p = item.relPath === "." ? "SKILL.md" : `${item.relPath}/SKILL.md`;
      const content = descContents.get(p);
      if (content) item.description = extractFrontmatterField(content, "description");
    } else if (item.type === "agents") {
      const content = descContents.get(item.relPath);
      if (content) item.description = extractFrontmatterField(content, "description");
    }
  }

  const expanded: ScanItemWithMeta[] = [];
  for (const item of items) {
    if (item.type !== "mcp") {
      expanded.push(item);
      continue;
    }
    const serverMap = await parseMcpServersFromFile(ref, item.relPath, token);
    const previews = await summarizeMcpFile(ref, item.relPath, token);
    const names = Object.keys(serverMap);
    if (names.length === 0) {
      expanded.push(item);
      continue;
    }
    for (const name of names) {
      const preview = previews.find((p) => p.name === name);
      expanded.push({
        type: "mcp",
        id: name,
        relPath: item.relPath,
        sourceRelPath: item.relPath,
        details: item.relPath,
        mcpParams: serverMap[name],
        pluginId: item.pluginId,
        ...(preview ? { mcpServers: [preview] } : {})
      });
    }
  }

  return expanded.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

async function getInstalledIds(): Promise<{ skills: Set<string>; agents: Set<string>; mcp: Set<string> }> {
  const readIds = async (dir: string, stripExt?: string): Promise<Set<string>> => {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return new Set(entries.map((e) => stripExt ? e.name.replace(new RegExp(`\\.${stripExt}$`), "") : e.name));
    } catch { return new Set(); }
  };
  const [skills, agents, mcp] = await Promise.all([
    readIds(SKILLS_SOURCE),
    readIds(AGENTS_SOURCE, "md"),
    readIds(MCP_SOURCE, "json"),
  ]);
  return { skills, agents, mcp };
}

export async function scanRepository(repoUrl: string, token?: string): Promise<{ repoUrl: string; items: ScanItemWithMeta[]; diagnostics: string[] }> {
  const resolvedToken = token ?? await getGhToken();
  const parsed = parseGithubUrl(repoUrl);
  const ref = await resolveRef(parsed.owner, parsed.repo, parsed.refHint, resolvedToken);
  const tree = await loadTree(ref, resolvedToken);
  const files = tree.map((i) => i.path);
  const [items, installedIds] = await Promise.all([
    detectItems(ref, files, parsed.repo, resolvedToken),
    getInstalledIds(),
  ]);
  for (const item of items) {
    if (item.type === "skills") item.installed = installedIds.skills.has(item.id);
    else if (item.type === "agents") item.installed = installedIds.agents.has(item.id);
    else if (item.type === "mcp") item.installed = installedIds.mcp.has(sanitizeId(item.id));
  }
  return {
    repoUrl,
    items,
    diagnostics: [
      `repo=${ref.owner}/${ref.repo}`,
      `ref=${ref.ref}`,
      `files=${files.length}`,
      `items=${items.length}`,
      `token=${resolvedToken ? "yes" : "no"}`
    ]
  };
}

function makeLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

function mergeObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    if (prev && typeof prev === "object" && !Array.isArray(prev) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = mergeObjects(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export async function installRepositorySelection(
  repoUrl: string,
  items: ScanItem[],
  token?: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: true; installed: number }> {
  const resolvedToken = token ?? await getGhToken();
  const parsed = parseGithubUrl(repoUrl);
  const ref = await resolveRef(parsed.owner, parsed.repo, parsed.refHint, resolvedToken);
  const tree = await loadTree(ref, resolvedToken);
  const fileSet = new Set(tree.map((i) => i.path));

  await Promise.all([
    mkdir(SKILLS_SOURCE, { recursive: true }),
    mkdir(AGENTS_SOURCE, { recursive: true }),
    mkdir(MCP_SOURCE, { recursive: true }),
    mkdir(PLUGINS_SOURCE, { recursive: true }),
  ]);

  const limit = makeLimiter(8);
  const total = items.length;
  let done = 0;
  onProgress?.(0, total);

  // cache raw file fetches so duplicate paths (e.g. multiple MCP servers from same file) are fetched once
  const fetchCache = new Map<string, Promise<string>>();
  const cachedFetch = (path: string): Promise<string> => {
    if (!fetchCache.has(path)) {
      fetchCache.set(path, limit(() => ghText(buildRawUrl(ref, path), resolvedToken)));
    }
    return fetchCache.get(path)!;
  };

  const writePath = async (root: string, rel: string, content: string) => {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  };

  const installItem = async (item: ScanItem): Promise<void> => {
    if (item.type === "skills") {
      const target = join(SKILLS_SOURCE, item.id);
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      // Flat .md file reclassified as skill — write as SKILL.md
      if (item.relPath.endsWith(".md") && item.relPath !== "SKILL.md" && !item.relPath.endsWith("/SKILL.md")) {
        await writeFile(join(target, "SKILL.md"), await cachedFetch(item.relPath), "utf-8");
      } else {
        const prefix = item.relPath === "." ? "" : `${item.relPath}/`;
        const needed = [...fileSet].filter((p) => item.relPath === "." ? p === "SKILL.md" : p.startsWith(prefix));
        await Promise.all(needed.map(async (path) => {
          const rel = item.relPath === "." ? path : path.slice(prefix.length);
          await writePath(target, rel, await cachedFetch(path));
        }));
      }

    } else if (item.type === "agents") {
      await writeFile(join(AGENTS_SOURCE, `${item.id}.md`), await cachedFetch(item.relPath), "utf-8");

    } else if (item.type === "mcp") {
      const sourcePath = item.sourceRelPath || item.relPath;
      const parsed = JSON.parse(await cachedFetch(sourcePath)) as any;
      const serverDef = parsed?.mcpServers?.[item.id];
      if (!serverDef || typeof serverDef !== "object") {
        throw new Error(`MCP server "${item.id}" not found in ${sourcePath}`);
      }
      await writeFile(join(MCP_SOURCE, `${sanitizeId(item.id)}.json`), JSON.stringify(serverDef, null, 2), "utf-8");

    } else if (item.type === "hooks") {
      const parsedHooks = JSON.parse(await cachedFetch(item.relPath)) as Record<string, unknown>;
      const currentRaw = await getHooksContent("global");
      const current = JSON.parse(currentRaw.content) as Record<string, unknown>;
      const hookObj = parsedHooks.hooks && typeof parsedHooks.hooks === "object"
        ? parsedHooks.hooks as Record<string, unknown>
        : parsedHooks;
      await saveHooksScopedContent("global", JSON.stringify(mergeObjects(current, hookObj), null, 2));

    } else if (item.type === "plugins") {
      const target = join(PLUGINS_SOURCE, item.id);
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      const prefix = item.relPath === "." ? "" : `${item.relPath}/`;
      const needed = [...fileSet].filter((p) => item.relPath === "." ? true : p.startsWith(prefix));
      await Promise.all(needed.map(async (path) => {
        if (path.startsWith(".git/")) return;
        const rel = item.relPath === "." ? path : path.slice(prefix.length);
        await writePath(target, rel, await cachedFetch(path));
      }));
    }

    done++;
    onProgress?.(done, total);
  };

  await Promise.all(items.map((item) => installItem(item)));

  // Auto-enable all newly installed items for every installed agent system
  const installedAgentIds = AGENT_IDS.filter((id) => isTargetInstalled(getTarget(id)));
  if (installedAgentIds.length) {
    const skillIds = items.filter((i) => i.type === "skills").map((i) => i.id);
    const agentNames = items.filter((i) => i.type === "agents").map((i) => i.id);
    const mcpServerIds = items.filter((i) => i.type === "mcp").map((i) => sanitizeId(i.id));
    await Promise.all([
      skillIds.length
        ? batchSetSkillEnabled(installedAgentIds.flatMap((agentId) => skillIds.map((skillId) => ({ agentId, skillId, enabled: true }))))
        : Promise.resolve(),
      agentNames.length
        ? batchSetAgentEnabled(installedAgentIds.flatMap((agentId) => agentNames.map((agentName) => ({ agentId, agentName, enabled: true }))))
        : Promise.resolve(),
      mcpServerIds.length
        ? Promise.all(installedAgentIds.flatMap((agentId) => mcpServerIds.map((serverId) => setMcpEnabled(agentId, serverId, true))))
        : Promise.resolve(),
    ]);
  }

  await Promise.all([syncSkills(), syncAgents(), syncAllMcp(), syncHooks(), syncPlugins()]);
  return { ok: true, installed: items.length };
}
