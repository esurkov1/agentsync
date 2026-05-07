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

function mergeSkillState(prev, next) {
  if (!prev || !next) return next;
  const prevSkills = new Map((prev.skills || []).map((skill) => [skill.id, skill]));
  const prevAgents = new Map((prev.agents || []).map((agent) => [agent.agentId, agent]));

  return {
    ...next,
    skills: (next.skills || []).map((skill) => {
      const prevSkill = prevSkills.get(skill.id);
      if (
        prevSkill &&
        prevSkill.path === skill.path &&
        prevSkill.name === skill.name &&
        prevSkill.description === skill.description &&
        prevSkill.content === skill.content
      ) {
        return prevSkill;
      }
      return skill;
    }),
    agents: (next.agents || []).map((agent) => {
      const prevAgent = prevAgents.get(agent.agentId);
      if (
        prevAgent &&
        prevAgent.label === agent.label &&
        prevAgent.installed === agent.installed &&
        prevAgent.skillsPath === agent.skillsPath &&
        prevAgent.mode === agent.mode &&
        arraysEqual(prevAgent.enabledSkills || [], agent.enabledSkills || []) &&
        Object.keys(agent.statuses || {}).every((key) => prevAgent.statuses?.[key] === agent.statuses?.[key]) &&
        Object.keys(prevAgent.statuses || {}).length === Object.keys(agent.statuses || {}).length
      ) {
        return prevAgent;
      }
      return agent;
    })
  };
}

function updateGlobalSkillState(state, skillId, enabled) {
  if (!state) return state;
  const globallyDisabled = sortedToggle(state.globallyDisabled || [], skillId, !enabled);
  if (arraysEqual(state.globallyDisabled || [], globallyDisabled)) return state;
  return { ...state, globallyDisabled };
}

function updateTargetSkillState(state, agentId, skillId, enabled) {
  if (!state) return state;
  let changed = false;
  const agents = (state.agents || []).map((agent) => {
    if (agent.agentId !== agentId) return agent;
    const enabledSkills = sortedToggle(agent.enabledSkills || [], skillId, enabled);
    if (arraysEqual(agent.enabledSkills || [], enabledSkills)) return agent;
    changed = true;
    return { ...agent, enabledSkills };
  });
  return changed ? { ...state, agents } : state;
}

export function useSkillsState() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [skillsState, setSkillsState] = useState(null);
  const [skillModal, setSkillModal] = useState(null);
  const [skillModalContent, setSkillModalContent] = useState("");

  const loadSkills = async ({ silent = false } = {}) => {
    if (!silent) setBusy(true);
    try {
      const state = await api("/api/skills/state");
      setSkillsState((prev) => mergeSkillState(prev, state));
      if (!silent) setMessage("Skills ready");
      return state;
    } catch (e) {
      setMessage(`Skills load error: ${e.message}`);
      return null;
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const toggleSkill = useCallback(async (agentId, skillId, enabled) => {
    let previousState = null;
    setSkillsState((prev) => {
      previousState = prev;
      return updateTargetSkillState(prev, agentId, skillId, enabled);
    });
    try {
      await api("/api/skills/target-skill", {
        method: "PUT",
        body: JSON.stringify({ agentId, skillId, enabled })
      });
      const state = await loadSkills({ silent: true });
      setMessage(`${skillId}: ${enabled ? "enabled" : "disabled"} for ${agentId}`);
      return state;
    } catch (e) {
      setSkillsState(previousState);
      setMessage(`Skill switch error: ${e.message}`);
      return null;
    }
  }, []);

  const toggleAllAgents = async (skillId, enabled) => {
    const installedAgents = (skillsState?.agents || []).filter((a) => a.installed);
    if (!installedAgents.length) return null;
    setBusy(true);
    try {
      const ops = installedAgents.map((a) => ({ agentId: a.agentId, skillId, enabled }));
      await api("/api/skills/batch-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadSkills();
      setMessage(`${skillId}: ${enabled ? "enabled" : "disabled"} for all workspaces`);
      return state;
    } catch (e) {
      setMessage(`Toggle error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const setGlobalEnabled = useCallback(async (skillId, enabled) => {
    let previousState = null;
    setSkillsState((prev) => {
      previousState = prev;
      return updateGlobalSkillState(prev, skillId, enabled);
    });
    try {
      await api("/api/skills/global-toggle", {
        method: "POST",
        body: JSON.stringify({ skillId, enabled })
      });
      const state = await loadSkills({ silent: true });
      setMessage(`${skillId}: globally ${enabled ? "enabled" : "disabled"}`);
      return state;
    } catch (e) {
      setSkillsState(previousState);
      setMessage(`Global toggle error: ${e.message}`);
      return null;
    }
  }, []);

  const batchSetGlobalEnabled = async (skillIds, enabled) => {
    if (!skillIds.length) return null;
    setBusy(true);
    try {
      const ops = skillIds.map((skillId) => ({ skillId, enabled }));
      await api("/api/skills/batch-global-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadSkills();
      setMessage(`${skillIds.length} skills globally ${enabled ? "enabled" : "disabled"}`);
      return state;
    } catch (e) {
      setMessage(`Batch global toggle error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const batchToggleAllAgents = async (skillIds, enabled) => {
    const installedAgents = (skillsState?.agents || []).filter((a) => a.installed);
    if (!installedAgents.length || !skillIds.length) return null;
    setBusy(true);
    try {
      const ops = skillIds.flatMap((skillId) =>
        installedAgents.map((a) => ({ agentId: a.agentId, skillId, enabled }))
      );
      await api("/api/skills/batch-toggle", { method: "POST", body: JSON.stringify({ ops }) });
      const state = await loadSkills();
      setMessage(`${skillIds.length} skills ${enabled ? "enabled" : "disabled"}`);
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
      await api("/api/skills/sync", { method: "POST" });
      const state = await loadSkills();
      setMessage("Skills synced");
      return state;
    } catch (e) {
      setMessage(`Sync error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createNewSkill = async (skillId) => {
    setBusy(true);
    try {
      await api("/api/skills/create", { method: "POST", body: JSON.stringify({ skillId }) });
      const state = await loadSkills();
      setMessage(`Skill created: ${skillId}`);
      return state;
    } catch (e) {
      setMessage(`Create error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const deleteExistingSkill = async (skillId) => {
    setBusy(true);
    try {
      await api("/api/skills", { method: "DELETE", body: JSON.stringify({ skillId }) });
      const state = await loadSkills();
      setMessage(`Skill deleted: ${skillId}`);
      return state;
    } catch (e) {
      setMessage(`Delete error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openSkillModal = async (skillId) => {
    setBusy(true);
    try {
      const payload = await api(`/api/skills/content?skillId=${encodeURIComponent(skillId)}`);
      const currentSkill = (skillsState?.skills || []).find((item) => item.id === skillId);
      setSkillModal({
        skillId,
        name: currentSkill?.name || skillId,
        path: payload.path,
        content: payload.content || "",
        files: payload.files || []
      });
      setSkillModalContent(payload.content || "");
      setMessage(`Opened ${skillId}`);
    } catch (e) {
      setMessage(`Open error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveSkillModal = async () => {
    if (!skillModal) return;
    setBusy(true);
    try {
      await api("/api/skills/content", {
        method: "PUT",
        body: JSON.stringify({ skillId: skillModal.skillId, content: skillModalContent })
      });
      const state = await loadSkills();
      const fresh = (state?.skills || []).find((item) => item.id === skillModal.skillId);
      setSkillModal((prev) => (
        prev
          ? {
              ...prev,
              content: skillModalContent,
              name: fresh?.name || prev.name
            }
          : prev
      ));
      setMessage(`Saved ${skillModal.skillId}`);
    } catch (e) {
      setMessage(`Save error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const renameSkillModal = async (newName) => {
    if (!skillModal) return;
    const updatedContent = updateFrontmatterName(skillModalContent, newName);
    setSkillModalContent(updatedContent);
    setBusy(true);
    try {
      await api("/api/skills/content", {
        method: "PUT",
        body: JSON.stringify({ skillId: skillModal.skillId, content: updatedContent })
      });
      const state = await loadSkills({ silent: true });
      const fresh = (state?.skills || []).find((item) => item.id === skillModal.skillId);
      setSkillModal((prev) => prev ? { ...prev, content: updatedContent, name: fresh?.name || newName } : prev);
      setMessage(`Renamed to ${newName}`);
    } catch (e) {
      setMessage(`Rename error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (agentId, skillId) => {
    setBusy(true);
    try {
      await api("/api/skills/resolve-conflict", {
        method: "POST",
        body: JSON.stringify({ agentId, skillId })
      });
      await loadSkills();
      setMessage(`Conflict resolved for ${skillId} on ${agentId}`);
    } catch (e) {
      setMessage(`Resolve error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    message,
    skillsState,
    loadSkills,
    toggleSkill,
    toggleAllAgents,
    batchToggleAllAgents,
    batchSetGlobalEnabled,
    setGlobalEnabled,
    runSync,
    resolveConflict,
    renameSkillModal,
    skillModal,
    setSkillModal,
    skillModalContent,
    setSkillModalContent,
    openSkillModal,
    saveSkillModal,
    createNewSkill,
    deleteExistingSkill
  };
}
