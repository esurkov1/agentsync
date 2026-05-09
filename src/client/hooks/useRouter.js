import { useCallback, useEffect, useState } from "react";

const OVERLAY_SEGMENTS = { skills: "skill", agents: "agent", mcp: "mcp" };
const OVERLAY_SEGMENTS_REV = { skill: "skills", agent: "agents", mcp: "mcp" };

function parseHash(hash) {
  const path = hash.replace(/^#/, "") || "/rules";
  const parts = path.replace(/^\//, "").split("/");
  const segment = parts[0]?.toLowerCase() || "rules";

  let tab = "RULES";
  if (segment === "skills") tab = "SKILLS";
  else if (segment === "agents") tab = "AGENTS";
  else if (segment === "mcp") tab = "MCP";
  else if (segment === "hooks") tab = "HOOKS";
  else if (segment === "plugins") tab = "PLUGINS";

  const itemId = parts[1] ? decodeURIComponent(parts[1]) : null;
  const skillId = tab === "SKILLS" ? itemId : null;
  const agentId = tab === "AGENTS" ? itemId : null;
  const serverId = tab === "MCP" ? itemId : null;
  const pluginId = tab === "PLUGINS" ? itemId : null;

  let overlayType = null;
  let overlayId = null;
  if (tab === "PLUGINS" && parts[2] && parts[3]) {
    overlayType = OVERLAY_SEGMENTS[parts[2]] || null;
    overlayId = decodeURIComponent(parts.slice(3).join("/")) || null;
  }

  return { tab, skillId, agentId, serverId, pluginId, overlayType, overlayId };
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
    window.location.hash = itemId
      ? `#/${tabPath}/${encodeURIComponent(itemId)}`
      : `#/${tabPath}`;
  }, []);

  const navigateOverlay = useCallback((pluginId, type, itemId) => {
    const seg = OVERLAY_SEGMENTS_REV[type];
    window.location.hash = `#/plugins/${encodeURIComponent(pluginId)}/${seg}/${encodeURIComponent(itemId)}`;
  }, []);

  return {
    tab: route.tab,
    skillId: route.skillId,
    agentId: route.agentId,
    serverId: route.serverId,
    pluginId: route.pluginId,
    overlayType: route.overlayType,
    overlayId: route.overlayId,
    navigate,
    navigateOverlay
  };
}
