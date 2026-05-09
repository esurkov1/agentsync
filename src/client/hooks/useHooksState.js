import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

export function useHooksState() {
  const [busy, setBusy] = useState(false);
  const [hooksState, setHooksState] = useState(null);
  const [content, setContentRaw] = useState("{}");
  const [scope, setScopeRaw] = useState("global");
  const [selectedAgentId, setAgentIdRaw] = useState("claude-code");

  const scopeRef = useRef("global");
  const agentIdRef = useRef("claude-code");

  const load = useCallback(async (s, aid) => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ scope: s });
      if (s !== "global" && aid) query.set("agentId", aid);
      const [state, scoped] = await Promise.all([
        api("/api/hooks/state"),
        api(`/api/hooks/content?${query}`),
      ]);
      setHooksState(state);
      setContentRaw(scoped.content || "{}");
    } catch (err) {
      console.error("hooks load:", err);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load("global", "claude-code"); }, [load]);

  const setScope = useCallback((s) => {
    scopeRef.current = s;
    setScopeRaw(s);
    load(s, agentIdRef.current);
  }, [load]);

  const setSelectedAgentId = useCallback((aid) => {
    agentIdRef.current = aid;
    setAgentIdRaw(aid);
    load(scopeRef.current, aid);
  }, [load]);

  const reload = useCallback(() => {
    load(scopeRef.current, agentIdRef.current);
  }, [load]);

  const commitHooks = useCallback(async (nextContent) => {
    const s = scopeRef.current;
    const aid = agentIdRef.current;
    setContentRaw(nextContent);
    setBusy(true);
    try {
      await api("/api/hooks/content", {
        method: "PUT",
        body: JSON.stringify({ content: nextContent, scope: s, agentId: s === "global" ? undefined : aid }),
      });
      await api("/api/hooks/sync", { method: "POST", body: "{}" });
      await load(s, aid);
    } catch (err) {
      console.error("hooks commit:", err);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const syncHooks = useCallback(async () => {
    setBusy(true);
    try {
      await api("/api/hooks/sync", { method: "POST", body: "{}" });
      await load(scopeRef.current, agentIdRef.current);
    } catch (err) {
      console.error("hooks sync:", err);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const hookCount = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      const n = Object.values(parsed).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      if (n > 0) return n;
    } catch {}
    return (hooksState?.frameworks || []).reduce((s, fw) => s + (fw.discoveredEntries || 0), 0);
  }, [content, hooksState]);

  return {
    busy,
    hooksState,
    hookCount,
    content,
    scope,
    setScope,
    selectedAgentId,
    setSelectedAgentId,
    reload,
    commitHooks,
    syncHooks,
  };
}
