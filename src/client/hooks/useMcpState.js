import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

function sortedToggle(list = [], itemId, enabled) {
  const set = new Set(list);
  if (enabled) set.add(itemId);
  else set.delete(itemId);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function arraysEqual(a = [], b = []) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function mergeMcpState(prev, next) {
  if (!prev || !next) return next;
  const prevServers = new Map((prev.servers || []).map((s) => [s.id, s]));
  const prevFrameworks = new Map((prev.frameworks || []).map((f) => [f.agentId, f]));

  return {
    ...next,
    servers: (next.servers || []).map((server) => {
      const prevServer = prevServers.get(server.id);
      if (prevServer && prevServer.command === server.command && prevServer.description === server.description) {
        return prevServer;
      }
      return server;
    }),
    frameworks: (next.frameworks || []).map((framework) => {
      const prevFramework = prevFrameworks.get(framework.agentId);
      if (
        prevFramework &&
        prevFramework.label === framework.label &&
        prevFramework.installed === framework.installed &&
        prevFramework.supported === framework.supported &&
        arraysEqual(prevFramework.enabledServers || [], framework.enabledServers || [])
      ) {
        return prevFramework;
      }
      return framework;
    })
  };
}

function updateGlobalState(state, serverId, enabled) {
  if (!state) return state;
  const globallyDisabled = sortedToggle(state.globallyDisabled || [], serverId, !enabled);
  if (arraysEqual(state.globallyDisabled || [], globallyDisabled)) return state;
  return { ...state, globallyDisabled };
}

function updateFrameworkState(state, agentId, serverId, enabled) {
  if (!state) return state;
  let changed = false;
  const frameworks = (state.frameworks || []).map((f) => {
    if (f.agentId !== agentId) return f;
    const enabledServers = sortedToggle(f.enabledServers || [], serverId, enabled);
    if (arraysEqual(f.enabledServers || [], enabledServers)) return f;
    changed = true;
    const statuses = { ...f.statuses, [serverId]: enabled ? "installed" : "available" };
    return { ...f, enabledServers, statuses };
  });
  return changed ? { ...state, frameworks } : state;
}

function fetchStatuses(servers, setServerStatuses) {
  const ids = (servers || []).map((s) => s.id);
  if (!ids.length) return;
  api("/api/mcp/test-all", {
    method: "POST",
    body: JSON.stringify({ serverIds: ids })
  }).then((result) => {
    setServerStatuses(result.results || {});
  }).catch(() => {});
}

export function useMcpState() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mcpState, setMcpState] = useState(null);
  const [serverModal, setServerModal] = useState(null);
  const [serverModalContent, setServerModalContent] = useState("");
  const [serverStatuses, setServerStatuses] = useState({});

  const loadMcp = useCallback(async () => {
    setBusy(true);
    try {
      const state = await api("/api/mcp/state");
      setMcpState((prev) => mergeMcpState(prev, state));
      fetchStatuses(state.servers, setServerStatuses);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { loadMcp(); }, [loadMcp]);

  const openServerModal = useCallback(async (serverId) => {
    setBusy(true);
    try {
      const [state, { content }] = await Promise.all([
        mcpState ? Promise.resolve(mcpState) : api("/api/mcp/state"),
        api(`/api/mcp/content?serverId=${encodeURIComponent(serverId)}`)
      ]);
      const server = (state.servers || []).find((s) => s.id === serverId);
      if (!server) throw new Error("Server not found");
      setServerModal({ ...server, content });
      setServerModalContent(content);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [mcpState]);

  const saveServerModal = useCallback(async () => {
    if (!serverModal) return;
    setBusy(true);
    try {
      await api("/api/mcp/content", {
        method: "PUT",
        body: JSON.stringify({ serverId: serverModal.id, content: serverModalContent })
      });
      setServerModal((prev) => prev ? { ...prev, content: serverModalContent } : prev);
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [serverModal, serverModalContent, loadMcp]);

  const setGlobalEnabled = useCallback(async (serverId, enabled) => {
    setMcpState((prev) => updateGlobalState(prev, serverId, enabled));
    try {
      await api("/api/mcp/global-toggle", {
        method: "POST",
        body: JSON.stringify({ serverId, enabled })
      });
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
      await loadMcp();
    }
  }, [loadMcp]);

  const batchSetGlobalEnabled = useCallback(async (serverIds, enabled) => {
    try {
      await api("/api/mcp/batch-global-toggle", {
        method: "POST",
        body: JSON.stringify({ serverIds, enabled })
      });
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    }
  }, [loadMcp]);

  const toggleServer = useCallback(async (agentId, serverId, enabled) => {
    setMcpState((prev) => updateFrameworkState(prev, agentId, serverId, enabled));
    try {
      await api("/api/mcp/toggle", {
        method: "POST",
        body: JSON.stringify({ agentId, serverId, enabled })
      });
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
      await loadMcp();
    }
  }, [loadMcp]);

  const batchToggleAllFrameworks = useCallback(async (serverId, enabled) => {
    const frameworks = mcpState?.frameworks || [];
    const ops = frameworks
      .filter((f) => f.installed && f.supported)
      .map((f) => ({ agentId: f.agentId, serverId, enabled }));
    if (!ops.length) return;
    try {
      await Promise.all(ops.map(({ agentId }) =>
        api("/api/mcp/toggle", {
          method: "POST",
          body: JSON.stringify({ agentId, serverId, enabled })
        })
      ));
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    }
  }, [mcpState, loadMcp]);

  const createNewServer = useCallback(async (serverId) => {
    setBusy(true);
    try {
      await api("/api/mcp/create", {
        method: "POST",
        body: JSON.stringify({ serverId })
      });
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadMcp]);

  const deleteExistingServer = useCallback(async (serverId) => {
    setBusy(true);
    try {
      await api("/api/mcp", {
        method: "DELETE",
        body: JSON.stringify({ serverId })
      });
      if (serverModal?.id === serverId) setServerModal(null);
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadMcp, serverModal]);

  const renameServerModal = useCallback(async (newId) => {
    if (!serverModal) return null;
    setBusy(true);
    try {
      await api("/api/mcp/rename", {
        method: "PUT",
        body: JSON.stringify({ oldId: serverModal.id, newId })
      });
      setServerModal((prev) => prev ? { ...prev, id: newId } : prev);
      await loadMcp();
      setMessage(`Renamed to ${newId}`);
      return newId;
    } catch (err) {
      setMessage(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [serverModal, loadMcp]);

  const syncMcp = useCallback(async () => {
    setBusy(true);
    try {
      await api("/api/mcp/sync", { method: "POST", body: JSON.stringify({}) });
      await loadMcp();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadMcp]);

  const testServer = useCallback(async (serverId) => {
    try {
      const result = await api("/api/mcp/test", {
        method: "POST",
        body: JSON.stringify({ serverId })
      });
      setServerStatuses((prev) => ({ ...prev, [serverId]: result }));
      return result;
    } catch (e) {
      const result = { status: "error", message: e?.message ?? "Request failed" };
      setServerStatuses((prev) => ({ ...prev, [serverId]: result }));
      return result;
    }
  }, []);

  return {
    busy,
    message,
    mcpState,
    loadMcp,
    serverModal,
    setServerModal,
    serverModalContent,
    setServerModalContent,
    openServerModal,
    saveServerModal,
    setGlobalEnabled,
    batchSetGlobalEnabled,
    toggleServer,
    batchToggleAllFrameworks,
    createNewServer,
    deleteExistingServer,
    renameServerModal,
    syncMcp,
    testServer,
    serverStatuses
  };
}
