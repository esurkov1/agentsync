import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

function updateFrontmatterName(content, newName) {
  if (/^name:\s*.+$/m.test(content)) return content.replace(/^name:\s*.+$/m, `name: ${newName}`);
  if (content.startsWith("---")) return content.replace("---", `---\nname: ${newName}`);
  return `---\nname: ${newName}\n---\n\n${content}`;
}

function sortedToggle(list = [], itemId, enabled) {
  const set = new Set(list);
  if (enabled) set.add(itemId);
  else set.delete(itemId);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function arraysEqual(a = [], b = []) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function mergeAgentsState(prev, next) {
  if (!prev || !next) return next;
  const prevAgents = new Map((prev.agents || []).map((agent) => [agent.id, agent]));
  const prevFrameworks = new Map((prev.frameworks || []).map((framework) => [framework.agentId, framework]));

  return {
    ...next,
    agents: (next.agents || []).map((agent) => {
      const prevAgent = prevAgents.get(agent.id);
      if (
        prevAgent &&
        prevAgent.path === agent.path &&
        prevAgent.name === agent.name &&
        prevAgent.description === agent.description &&
        prevAgent.content === agent.content
      ) {
        return prevAgent;
      }
      return agent;
    }),
    frameworks: (next.frameworks || []).map((framework) => {
      const prevFramework = prevFrameworks.get(framework.agentId);
      if (
        prevFramework &&
        prevFramework.label === framework.label &&
        prevFramework.installed === framework.installed &&
        prevFramework.agentsPath === framework.agentsPath &&
        prevFramework.mode === framework.mode &&
        arraysEqual(prevFramework.enabledAgents || [], framework.enabledAgents || []) &&
        Object.keys(framework.statuses || {}).every((key) => prevFramework.statuses?.[key] === framework.statuses?.[key]) &&
        Object.keys(prevFramework.statuses || {}).length === Object.keys(framework.statuses || {}).length
      ) {
        return prevFramework;
      }
      return framework;
    })
  };
}

function updateGlobalAgentState(state, agentName, enabled) {
  if (!state) return state;
  const globallyDisabled = sortedToggle(state.globallyDisabled || [], agentName, !enabled);
  if (arraysEqual(state.globallyDisabled || [], globallyDisabled)) return state;
  return { ...state, globallyDisabled };
}

function updateTargetAgentState(state, agentId, agentName, enabled) {
  if (!state) return state;
  let changed = false;
  const frameworks = (state.frameworks || []).map((framework) => {
    if (framework.agentId !== agentId) return framework;
    const enabledAgents = sortedToggle(framework.enabledAgents || [], agentName, enabled);
    if (arraysEqual(framework.enabledAgents || [], enabledAgents)) return framework;
    changed = true;
    return { ...framework, enabledAgents };
  });
  return changed ? { ...state, frameworks } : state;
}

export function useAgentsState() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [agentsState, setAgentsState] = useState(null);
  const [agentModal, setAgentModal] = useState(null);
  const [agentModalContent, setAgentModalContent] = useState("");

  const loadAgents = async ({ silent = false } = {}) => {
    if (!silent) setBusy(true);
    try {
      const state = await api("/api/agents/state");
      setAgentsState((prev) => mergeAgentsState(prev, state));
      if (!silent) setMessage("Agents ready");
      return state;
    } catch (e) {
      setMessage(`Agents load error: ${e.message}`);
      return null;
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const toggleAgent = useCallback(async (agentId, agentName, enabled) => {
    let previousState = null;
    setAgentsState((prev) => {
      previousState = prev;
      return updateTargetAgentState(prev, agentId, agentName, enabled);
    });
    try {
      await api("/api/agents/target-agent", {
        method: "PUT",
        body: JSON.stringify({ agentId, agentName, enabled })
      });
      const state = await loadAgents({ silent: true });
      setMessage(`${agentName}: ${enabled ? "enabled" : "disabled"} for ${agentId}`);
      return state;
    } catch (e) {
      setAgentsState(previousState);
      setMessage(`Agent switch error: ${e.message}`);
      return null;
    }
  }, []);

  const toggleAllFrameworks = async (agentName, enabled) => {
    const installedFrameworks = (agentsState?.frameworks || []).filter((f) => f.installed);
    if (!installedFrameworks.length) return null;
    setBusy(true);
    try {
      const ops = installedFrameworks.map((f) => ({ agentId: f.agentId, agentName, enabled }));
      await api("/api/agents/batch-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadAgents();
      setMessage(`${agentName}: ${enabled ? "enabled" : "disabled"} for all agent system`);
      return state;
    } catch (e) {
      setMessage(`Toggle error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const setGlobalEnabled = useCallback(async (agentName, enabled) => {
    let previousState = null;
    setAgentsState((prev) => {
      previousState = prev;
      return updateGlobalAgentState(prev, agentName, enabled);
    });
    try {
      await api("/api/agents/global-toggle", {
        method: "POST",
        body: JSON.stringify({ agentName, enabled })
      });
      const state = await loadAgents({ silent: true });
      setMessage(`${agentName}: globally ${enabled ? "enabled" : "disabled"}`);
      return state;
    } catch (e) {
      setAgentsState(previousState);
      setMessage(`Global toggle error: ${e.message}`);
      return null;
    }
  }, []);

  const batchSetGlobalEnabled = async (agentNames, enabled) => {
    if (!agentNames.length) return null;
    setBusy(true);
    try {
      const ops = agentNames.map((agentName) => ({ agentName, enabled }));
      await api("/api/agents/batch-global-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadAgents();
      setMessage(`${agentNames.length} agents globally ${enabled ? "enabled" : "disabled"}`);
      return state;
    } catch (e) {
      setMessage(`Batch global toggle error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const batchToggleAllFrameworks = async (agentNames, enabled) => {
    const installedFrameworks = (agentsState?.frameworks || []).filter((f) => f.installed);
    if (!installedFrameworks.length || !agentNames.length) return null;
    setBusy(true);
    try {
      const ops = agentNames.flatMap((agentName) =>
        installedFrameworks.map((f) => ({ agentId: f.agentId, agentName, enabled }))
      );
      await api("/api/agents/batch-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadAgents();
      setMessage(`${agentNames.length} agents ${enabled ? "enabled" : "disabled"}`);
      return state;
    } catch (e) {
      setMessage(`Batch toggle error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runSync = async () => {
    setBusy(true);
    try {
      await api("/api/agents/sync", { method: "POST" });
      const state = await loadAgents();
      setMessage("Agents synced");
      return state;
    } catch (e) {
      setMessage(`Sync error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createNewAgent = async (agentName) => {
    setBusy(true);
    try {
      await api("/api/agents/create", { method: "POST", body: JSON.stringify({ agentName }) });
      const state = await loadAgents();
      setMessage(`Agent created: ${agentName}`);
      return state;
    } catch (e) {
      setMessage(`Create error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const deleteExistingAgent = async (agentName) => {
    setBusy(true);
    try {
      await api("/api/agents", { method: "DELETE", body: JSON.stringify({ agentName }) });
      const state = await loadAgents();
      setMessage(`Agent deleted: ${agentName}`);
      return state;
    } catch (e) {
      setMessage(`Delete error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const openAgentModal = async (agentName) => {
    setBusy(true);
    try {
      const payload = await api(`/api/agents/content?agentName=${encodeURIComponent(agentName)}`);
      const currentAgent = (agentsState?.agents || []).find((a) => a.id === agentName);
      setAgentModal({
        agentName,
        name: currentAgent?.name || agentName,
        path: payload.path,
        content: payload.content || ""
      });
      setAgentModalContent(payload.content || "");
      setMessage(`Opened ${agentName}`);
    } catch (e) {
      setMessage(`Open error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveAgentModal = async () => {
    if (!agentModal) return;
    setBusy(true);
    try {
      await api("/api/agents/content", {
        method: "PUT",
        body: JSON.stringify({ agentName: agentModal.agentName, content: agentModalContent })
      });
      const state = await loadAgents();
      const fresh = (state?.agents || []).find((a) => a.id === agentModal.agentName);
      setAgentModal((prev) =>
        prev ? { ...prev, content: agentModalContent, name: fresh?.name || prev.name } : prev
      );
      setMessage(`Saved ${agentModal.agentName}`);
    } catch (e) {
      setMessage(`Save error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const renameAgentModal = async (newName) => {
    if (!agentModal) return;
    const updatedContent = updateFrontmatterName(agentModalContent, newName);
    setAgentModalContent(updatedContent);
    setBusy(true);
    try {
      await api("/api/agents/content", {
        method: "PUT",
        body: JSON.stringify({ agentName: agentModal.agentName, content: updatedContent })
      });
      const state = await loadAgents({ silent: true });
      const fresh = (state?.agents || []).find((a) => a.id === agentModal.agentName);
      setAgentModal((prev) => prev ? { ...prev, content: updatedContent, name: fresh?.name || newName } : prev);
      setMessage(`Renamed to ${newName}`);
    } catch (e) {
      setMessage(`Rename error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (agentId, agentName) => {
    setBusy(true);
    try {
      await api("/api/agents/resolve-conflict", {
        method: "POST",
        body: JSON.stringify({ agentId, agentName })
      });
      await loadAgents();
      setMessage(`Conflict resolved for ${agentName} on ${agentId}`);
    } catch (e) {
      setMessage(`Resolve error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    message,
    agentsState,
    loadAgents,
    toggleAgent,
    toggleAllFrameworks,
    batchToggleAllFrameworks,
    setGlobalEnabled,
    batchSetGlobalEnabled,
    runSync,
    agentModal,
    setAgentModal,
    agentModalContent,
    setAgentModalContent,
    openAgentModal,
    saveAgentModal,
    renameAgentModal,
    createNewAgent,
    deleteExistingAgent,
    resolveConflict
  };
}
