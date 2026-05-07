import { useCallback, useEffect, useState } from "react";

function parseHash(hash) {
  const path = hash.replace(/^#/, "") || "/rules";
  const parts = path.replace(/^\//, "").split("/");
  const segment = parts[0]?.toLowerCase() || "rules";
  const itemId = parts[1] ? decodeURIComponent(parts[1]) : null;

  let tab = "RULES";
  if (segment === "skills") tab = "SKILLS";
  else if (segment === "agents") tab = "AGENTS";
  else if (segment === "mcp") tab = "MCP";

  const skillId = tab === "SKILLS" ? itemId : null;
  const agentId = tab === "AGENTS" ? itemId : null;
  const serverId = tab === "MCP" ? itemId : null;
  return { tab, skillId, agentId, serverId };
}

export function useRouter() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((tab, itemId = null) => {
    const tabPath = tab.toLowerCase();
    const hash = itemId ? `#/${tabPath}/${encodeURIComponent(itemId)}` : `#/${tabPath}`;
    window.location.hash = hash;
  }, []);

  return { tab: route.tab, skillId: route.skillId, agentId: route.agentId, serverId: route.serverId, navigate };
}
