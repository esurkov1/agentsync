export function extractFrontmatter(content: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end < 0) return null;
  return content.slice(3, end);
}

const stripQuotes = (s: string) => s.replace(/^['"]|['"]$/g, "").trim();

export function parseFrontmatterScalar(content: string, key: string): string {
  const fm = extractFrontmatter(content);
  if (!fm) return "";
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, "m");
  const m = fm.match(re);
  return m ? stripQuotes(m[1].trim()) : "";
}

export function parseFrontmatterList(content: string, key: string): string[] {
  const fm = extractFrontmatter(content);
  if (!fm) return [];
  const lines = fm.split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(new RegExp(`^${key}\\s*:\\s*(.*)$`));
    if (!m) continue;
    const rest = m[1].trim();

    if (rest.startsWith("[") && rest.endsWith("]")) {
      for (const item of rest.slice(1, -1).split(",")) {
        const v = stripQuotes(item.trim());
        if (v) result.push(v);
      }
      return result;
    }

    if (rest && rest !== "|" && rest !== ">") {
      const v = stripQuotes(rest);
      if (v) result.push(v);
    }

    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j];
      const itemMatch = nextLine.match(/^\s*-\s+(.+?)\s*(?:#.*)?$/);
      if (itemMatch) {
        const v = stripQuotes(itemMatch[1].trim());
        if (v) result.push(v);
        continue;
      }
      if (nextLine.trim() === "" || /^\s+/.test(nextLine)) continue;
      break;
    }
    return result;
  }
  return result;
}
