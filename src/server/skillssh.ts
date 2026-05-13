import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { batchSetSkillEnabled, syncSkills } from "./skills";
import { AGENT_IDS, getTarget, isTargetInstalled } from "./agentRegistry";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const SKILLS_SOURCE = join(HOME, ".agentsync", "skills", "source");

export type SkillsShItem = {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
  installed?: boolean;
};

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function getInstalledSkillIds(): Promise<Set<string>> {
  try {
    const entries = await readdir(SKILLS_SOURCE, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  } catch { return new Set(); }
}

export async function searchSkillsSh(query: string): Promise<{ items: SkillsShItem[]; count: number; error?: string }> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query.trim())}`;
  try {
    const [res, installedIds] = await Promise.all([
      fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "agentsync/1.0", "Accept": "application/json" }
      }),
      getInstalledSkillIds(),
    ]);
    if (!res.ok) throw new Error(`skills.sh API returned ${res.status}`);
    const data = await res.json() as any;
    const raw: any[] = Array.isArray(data.skills) ? data.skills : [];
    const items: SkillsShItem[] = raw.map((s) => {
      const skillId = String(s.skillId ?? s.name);
      const installs = typeof s.installs === "number" ? s.installs : 0;
      return {
        id: String(s.id ?? s.skillId ?? s.name),
        skillId,
        name: String(s.name ?? s.skillId),
        installs,
        source: String(s.source ?? ""),
        installed: installedIds.has(skillId),
        installsFormatted: formatInstalls(installs),
      } as any;
    });
    items.sort((a, b) => b.installs - a.installs);
    return { items, count: data.count ?? items.length };
  } catch (err: any) {
    return { items: [], count: 0, error: err?.message ?? "Failed to reach skills.sh" };
  }
}

async function fetchRaw(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "agentsync/1.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export async function installSkillsShItems(
  items: SkillsShItem[],
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: true; installed: number }> {
  await mkdir(SKILLS_SOURCE, { recursive: true });

  const total = items.length;
  let done = 0;
  onProgress?.(0, total);

  // Install all skills in parallel — direct raw fetch, no GitHub tree scan needed.
  // skills.sh layout: skills live at <skillId>/SKILL.md in the repo root (source = owner/repo).
  await Promise.all(items.map(async (item) => {
    const src = item.source?.trim();
    if (!src) { done++; onProgress?.(done, total); return; }

    const skillMd = await fetchRaw(
      `https://raw.githubusercontent.com/${src}/HEAD/${item.skillId}/SKILL.md`
    );

    const target = join(SKILLS_SOURCE, item.skillId);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "SKILL.md"), skillMd, "utf-8");

    done++;
    onProgress?.(done, total);
  }));

  // Auto-enable for all installed agent systems
  const installedAgentIds = AGENT_IDS.filter((id) => isTargetInstalled(getTarget(id)));
  if (installedAgentIds.length) {
    const skillIds = items.map((i) => i.skillId);
    await batchSetSkillEnabled(
      installedAgentIds.flatMap((agentId) => skillIds.map((skillId) => ({ agentId, skillId, enabled: true })))
    );
  }

  await syncSkills();
  return { ok: true, installed: done };
}
