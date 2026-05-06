import React, { useMemo, useState } from "react";
import { markdown } from "./lib/markdown";
import { TopTabs } from "./components/TopTabs";
import { AgentRulesModal } from "./components/AgentRulesModal";
import { GlobalRulesPanel } from "./components/GlobalRulesPanel";
import { AgentListPanel } from "./components/AgentListPanel";
import { useRulesState } from "./hooks/useRulesState";

export function App() {
  const [tab, setTab] = useState("RULES");
  const [globalViewTab, setGlobalViewTab] = useState("CODE");
  const {
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
    handleAgentModalModeChange,
    saveAgentModal,
    agentDirty
  } = useRulesState();
  const globalHtmlPreview = useMemo(() => markdown.render(masterContent || ""), [masterContent]);

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
        <>
          <GlobalRulesPanel
            rulesState={rulesState}
            globalViewTab={globalViewTab}
            setGlobalViewTab={setGlobalViewTab}
            globalDirty={globalDirty}
            busy={busy}
            saveRules={saveRules}
            masterContent={masterContent}
            setMasterContent={setMasterContent}
            globalHtmlPreview={globalHtmlPreview}
          />
          <AgentListPanel agents={rulesState?.agents} busy={busy} openAgentModal={openAgentModal} switchMode={switchMode} />
        </>
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
