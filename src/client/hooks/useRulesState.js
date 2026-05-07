import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useRulesState() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rulesState, setRulesState] = useState(null);
  const [masterContent, setMasterContent] = useState("");
  const [agentModal, setAgentModal] = useState(null);
  const [agentModalContent, setAgentModalContent] = useState("");

  const loadRules = async () => {
    setBusy(true);
    try {
      const state = await api("/api/rules/state");
      setRulesState(state);
      setMasterContent(state.masterContent || "");
      setMessage("Ready");
      return state;
    } catch (e) {
      setMessage(`Load error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const globalDirty = (rulesState?.masterContent || "") !== (masterContent || "");
  const agentDirty =
    !!agentModal &&
    (agentModalContent || "") !== (agentModal.content || "");

  const saveRules = async () => {
    setBusy(true);
    try {
      await api("/api/rules/master", { method: "PUT", body: JSON.stringify({ content: masterContent }) });
      await loadRules();
      setMessage("Global rules saved");
    } catch (e) {
      setMessage(`Save error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = async (agentId, mode) => {
    setRulesState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        agents: (prev.agents || []).map((a) => (a.agentId === agentId ? { ...a, mode } : a))
      };
    });
    setBusy(true);
    try {
      await api("/api/rules/agent-mode", { method: "PUT", body: JSON.stringify({ agentId, mode }) });
      const state = await loadRules();
      if (agentModal && agentModal.agentId === agentId && state) {
        const freshAgent = (state.agents || []).find((a) => a.agentId === agentId);
        if (freshAgent) {
          setAgentModal(freshAgent);
          setAgentModalContent(freshAgent.content || "");
        }
      }
      setMessage(`${agentId} switched to ${mode}`);
    } catch (e) {
      setMessage(`Mode switch error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const openAgentModal = (agent) => {
    setAgentModal(agent);
    setAgentModalContent(agent.content || "");
  };

  const saveAgentModal = async () => {
    if (!agentModal) return;
    setBusy(true);
    try {
      await api("/api/rules/agent-local-content", {
        method: "PUT",
        body: JSON.stringify({ agentId: agentModal.agentId, content: agentModalContent })
      });
      const state = await loadRules();
      if (state) {
        const freshAgent = (state.agents || []).find((a) => a.agentId === agentModal.agentId);
        if (freshAgent) {
          setAgentModal(freshAgent);
          setAgentModalContent(freshAgent.content || "");
        }
      }
      setMessage("Agent rules updated");
    } catch (e) {
      setMessage(`Agent save error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    message,
    rulesState,
    masterContent,
    setMasterContent,
    globalDirty,
    loadRules,
    saveRules,
    switchMode,
    agentModal,
    setAgentModal,
    agentModalContent,
    setAgentModalContent,
    openAgentModal,
    saveAgentModal,
    agentDirty
  };
}
