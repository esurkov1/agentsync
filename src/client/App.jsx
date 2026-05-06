import React, { useMemo, useState, useEffect } from "react";
import { api } from "./lib/api";
import { markdown } from "./lib/markdown";
import { TopTabs } from "./components/TopTabs";
import { AgentRulesModal } from "./components/AgentRulesModal";
import { MarkdownCodeEditor } from "./components/MarkdownCodeEditor";

export function App() {
  const [tab, setTab] = useState("RULES");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rulesState, setRulesState] = useState(null);
  const [masterContent, setMasterContent] = useState("");
  const [globalViewTab, setGlobalViewTab] = useState("CODE");
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

  const globalHtmlPreview = useMemo(() => markdown.render(masterContent || ""), [masterContent]);
  const globalDirty = (rulesState?.masterContent || "") !== (masterContent || "");
  const agentDirty =
    !!agentModal &&
    (agentModal.mode === "local" && (agentModalContent || "") !== (agentModal.content || ""));

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

  const handleAgentModalModeChange = async (nextMode) => {
    if (!agentModal || nextMode === agentModal.mode) return;
    const hasUnsavedLocalChanges =
      agentModal.mode === "local" &&
      (agentModalContent || "") !== (agentModal.content || "");

    if (hasUnsavedLocalChanges && nextMode === "global") {
      const confirmed = window.confirm("You have unsaved local changes. Switch to global and discard them?");
      if (!confirmed) return;
    }

    await switchMode(agentModal.agentId, nextMode);
  };

  const saveAgentModal = async () => {
    if (!agentModal) return;
    if (agentModal.mode !== "local") return;
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

  return (
    <div className="container">
      <div className="topbar">
        <h1 className="title">AgentSync</h1>
        <div className="row">
          <button className="btn" onClick={loadRules} disabled={busy}>Refresh</button>
        </div>
      </div>
      <TopTabs current={tab} onChange={setTab} />
      <div className="muted section-gap">{busy ? "Working..." : message}</div>

      {tab === "RULES" ? (
        <section className="card section-gap">
          <div className="modal-head">
            <div className="modal-title-block">
              <strong className="modal-title">Global Rules</strong>
              <div className="muted modal-path">{rulesState?.masterPath || ""}</div>
            </div>
            <div className="modal-actions">
              <div className="segmented">
                <button className={`segmented-item ${globalViewTab === "CODE" ? "active" : ""}`} onClick={() => setGlobalViewTab("CODE")}>
                  Code
                </button>
                <button className={`segmented-item ${globalViewTab === "PREVIEW" ? "active" : ""}`} onClick={() => setGlobalViewTab("PREVIEW")}>
                  Preview
                </button>
              </div>
              {globalDirty ? <button className="btn primary" onClick={saveRules} disabled={busy}>Save</button> : null}
            </div>
          </div>

          {globalViewTab === "CODE" ? (
            <div className="section-gap">
              <MarkdownCodeEditor value={masterContent} onChangeText={setMasterContent} />
            </div>
          ) : (
            <div className="markdown-preview section-gap" dangerouslySetInnerHTML={{ __html: globalHtmlPreview }} />
          )}

          <div className="rule-cards section-gap">
            {(rulesState?.agents || []).map((agent) => (
              <div key={agent.agentId} className="rule-card" onClick={() => openAgentModal(agent)}>
                <div className="modal-head">
                  <div className="modal-title-block">
                    <strong className="modal-title">{agent.label}</strong>
                    <div className="muted modal-path">{agent.path}</div>
                  </div>
                  <div className="modal-actions">
                    <select
                      className={`input mode-select ${agent.mode === "global" ? "mode-global" : "mode-local"}`}
                      value={agent.mode}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => switchMode(agent.agentId, e.target.value)}
                      disabled={busy}
                    >
                      <option value="global">global</option>
                      <option value="local">local</option>
                    </select>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); openAgentModal(agent); }} disabled={busy}>Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {agentModal ? (
        <AgentRulesModal
          agent={agentModal}
          mode={agentModal.mode}
          content={agentModalContent}
          onChangeContent={setAgentModalContent}
          onChangeMode={handleAgentModalModeChange}
          onClose={() => setAgentModal(null)}
          onSave={saveAgentModal}
          busy={busy}
          showSave={agentDirty}
        />
      ) : null}
    </div>
  );
}
