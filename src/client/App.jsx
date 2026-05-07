import React, { memo, useCallback, useEffect, useState } from "react";
import { Button, TopTabs } from "./components/UI";
import { WorkspaceRulesModal } from "./components/WorkspaceRulesModal";
import { SkillsPanel } from "./components/SkillsPanel";
import { SkillDetailsPage } from "./pages/SkillDetailsPage";
import { AgentsPanel } from "./components/AgentsPanel";
import { AgentDetailsPage } from "./pages/AgentDetailsPage";
import { McpPanel } from "./components/McpPanel";
import { McpDetailsPage } from "./pages/McpDetailsPage";
import { RulesPage } from "./pages/RulesPage";
import { useRulesState } from "./hooks/useRulesState";
import { useSkillsState } from "./hooks/useSkillsState";
import { useAgentsState } from "./hooks/useAgentsState";
import { useMcpState } from "./hooks/useMcpState";
import { useRouter } from "./hooks/useRouter";

const EMPTY_STATUS = { RULES: false, SKILLS: false, AGENTS: false, MCP: false };
const EMPTY_COUNTS = { SKILLS: undefined, AGENTS: undefined, MCP: undefined };

export function App() {
  const { tab, skillId: routeSkillId, agentId: routeAgentId, serverId: routeServerId, navigate } = useRouter();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [busyByTab, setBusyByTab] = useState(EMPTY_STATUS);
  const [detailByTab, setDetailByTab] = useState(EMPTY_STATUS);
  const [tabCounts, setTabCounts] = useState(EMPTY_COUNTS);

  const busy = busyByTab.RULES || busyByTab.SKILLS || busyByTab.AGENTS || busyByTab.MCP;
  const showingDetail = !!detailByTab[tab];

  const setTabBusy = useCallback((tabName, nextBusy) => {
    setBusyByTab((prev) => (prev[tabName] === nextBusy ? prev : { ...prev, [tabName]: nextBusy }));
  }, []);

  const setTabDetail = useCallback((tabName, nextOpen) => {
    setDetailByTab((prev) => (prev[tabName] === nextOpen ? prev : { ...prev, [tabName]: nextOpen }));
  }, []);

  const handleTabChange = useCallback((nextTab) => navigate(nextTab), [navigate]);
  const handleCloseDetail = useCallback(() => navigate(tab), [navigate, tab]);

  const setTabCount = useCallback((tabName, nextCount) => {
    setTabCounts((prev) => (prev[tabName] === nextCount ? prev : { ...prev, [tabName]: nextCount }));
  }, []);

  const refreshAll = async () => {
    setRefreshVersion((version) => version + 1);
  };

  return (
    <div className="container">
      <div className="topbar">
        <h1 className="title">AgentSync</h1>
        <div className="row">
          <Button onClick={refreshAll} disabled={busy}>Refresh</Button>
        </div>
      </div>

      {showingDetail
        ? <Button onClick={handleCloseDetail} disabled={busy}>← Back</Button>
        : <TopTabs current={tab} onChange={handleTabChange} counts={tabCounts} />}

      <RulesRoute
        hidden={tab !== "RULES"}
        refreshVersion={refreshVersion}
        onBusyChange={setTabBusy}
      />

      <SkillsRoute
        hidden={tab !== "SKILLS"}
        routeSkillId={routeSkillId}
        refreshVersion={refreshVersion}
        navigate={navigate}
        appBusy={busy}
        onBusyChange={setTabBusy}
        onDetailChange={setTabDetail}
        onCountChange={setTabCount}
      />

      <AgentsRoute
        hidden={tab !== "AGENTS"}
        routeAgentId={routeAgentId}
        refreshVersion={refreshVersion}
        navigate={navigate}
        appBusy={busy}
        onBusyChange={setTabBusy}
        onDetailChange={setTabDetail}
        onCountChange={setTabCount}
      />

      <McpRoute
        hidden={tab !== "MCP"}
        routeServerId={routeServerId}
        refreshVersion={refreshVersion}
        navigate={navigate}
        appBusy={busy}
        onBusyChange={setTabBusy}
        onDetailChange={setTabDetail}
        onCountChange={setTabCount}
      />
    </div>
  );
}

const RulesRoute = memo(function RulesRoute({ hidden, refreshVersion, onBusyChange }) {
  const {
    busy,
    rulesState,
    masterContent,
    setMasterContent,
    globalDirty,
    loadRules,
    saveRules,
    switchMode,
    agentModal: workspaceModal,
    setAgentModal: setWorkspaceModal,
    agentModalContent: workspaceModalContent,
    setAgentModalContent: setWorkspaceModalContent,
    openAgentModal: openWorkspaceModal,
    saveAgentModal: saveWorkspaceModal,
    agentDirty: workspaceDirty
  } = useRulesState();

  useEffect(() => {
    onBusyChange("RULES", busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (refreshVersion > 0) loadRules();
  }, [refreshVersion]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      <RulesPage
        rulesState={rulesState}
        busy={busy}
        saveRules={saveRules}
        masterContent={masterContent}
        setMasterContent={setMasterContent}
        globalDirty={globalDirty}
        openAgentModal={openWorkspaceModal}
        switchMode={switchMode}
      />

      {workspaceModal ? (
        <WorkspaceRulesModal
          agent={workspaceModal}
          content={workspaceModalContent}
          onChangeContent={setWorkspaceModalContent}
          onClose={() => setWorkspaceModal(null)}
          onSave={saveWorkspaceModal}
          busy={busy}
          showSave={workspaceDirty}
        />
      ) : null}
    </div>
  );
});

const SkillsRoute = memo(function SkillsRoute({
  hidden,
  routeSkillId,
  refreshVersion,
  navigate,
  appBusy,
  onBusyChange,
  onDetailChange,
  onCountChange
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const {
    busy,
    skillsState,
    loadSkills,
    toggleSkill,
    batchToggleAllAgents,
    batchSetGlobalEnabled,
    setGlobalEnabled,
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
  } = useSkillsState();

  const routeBusy = appBusy || busy;

  useEffect(() => {
    onBusyChange("SKILLS", busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    onDetailChange("SKILLS", !!skillModal);
  }, [onDetailChange, skillModal]);

  useEffect(() => {
    onCountChange("SKILLS", skillsState?.skills?.length);
  }, [onCountChange, skillsState]);

  useEffect(() => {
    if (refreshVersion > 0) loadSkills();
  }, [refreshVersion]);

  useEffect(() => {
    if (hidden) return;
    if (routeSkillId && skillModal?.skillId !== routeSkillId) {
      openSkillModal(routeSkillId);
    } else if (!routeSkillId && skillModal) {
      setSkillModal(null);
    }
  }, [hidden, routeSkillId, skillModal]);

  const handleOpenSkill = useCallback((skillId) => navigate("SKILLS", skillId), [navigate]);
  const handleCloseSkill = useCallback(() => navigate("SKILLS"), [navigate]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      {!skillModal ? (
        <SkillsPanel
          skillsState={skillsState}
          busy={routeBusy}
          onOpenSkill={handleOpenSkill}
          onCreateSkill={createNewSkill}
          onDeleteSkill={deleteExistingSkill}
          onBatchToggleAllAgents={batchToggleAllAgents}
          onBatchSetGlobalEnabled={batchSetGlobalEnabled}
          onSetGlobalEnabled={setGlobalEnabled}
          onResolveConflict={resolveConflict}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
      {skillModal ? (
        <SkillDetailsPage
          skill={skillModal}
          content={skillModalContent}
          onChangeContent={setSkillModalContent}
          onSave={saveSkillModal}
          onRename={renameSkillModal}
          onBack={handleCloseSkill}
          busy={routeBusy}
          skillsState={skillsState}
          onToggleSkill={toggleSkill}
          onResolveConflict={resolveConflict}
          onSetGlobalEnabled={setGlobalEnabled}
        />
      ) : null}
    </div>
  );
});

const AgentsRoute = memo(function AgentsRoute({
  hidden,
  routeAgentId,
  refreshVersion,
  navigate,
  appBusy,
  onBusyChange,
  onDetailChange,
  onCountChange
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const {
    busy,
    agentsState,
    loadAgents,
    toggleAgent,
    batchToggleAllFrameworks,
    setGlobalEnabled: setAgentGlobalEnabled,
    batchSetGlobalEnabled: batchSetAgentGlobalEnabled,
    agentModal,
    setAgentModal,
    agentModalContent,
    setAgentModalContent,
    openAgentModal,
    saveAgentModal,
    renameAgentModal,
    createNewAgent,
    deleteExistingAgent,
    resolveConflict: resolveAgentConflict
  } = useAgentsState();

  const routeBusy = appBusy || busy;

  useEffect(() => {
    onBusyChange("AGENTS", busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    onDetailChange("AGENTS", !!agentModal);
  }, [agentModal, onDetailChange]);

  useEffect(() => {
    onCountChange("AGENTS", agentsState?.agents?.length);
  }, [agentsState, onCountChange]);

  useEffect(() => {
    if (refreshVersion > 0) loadAgents();
  }, [refreshVersion]);

  useEffect(() => {
    if (hidden) return;
    if (routeAgentId && agentModal?.agentName !== routeAgentId) {
      openAgentModal(routeAgentId);
    } else if (!routeAgentId && agentModal) {
      setAgentModal(null);
    }
  }, [hidden, routeAgentId, agentModal]);

  const handleOpenAgent = useCallback((agentName) => navigate("AGENTS", agentName), [navigate]);
  const handleCloseAgent = useCallback(() => navigate("AGENTS"), [navigate]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      {!agentModal ? (
        <AgentsPanel
          agentsState={agentsState}
          busy={routeBusy}
          onOpenAgent={handleOpenAgent}
          onCreateAgent={createNewAgent}
          onDeleteAgent={deleteExistingAgent}
          onBatchToggleAllFrameworks={batchToggleAllFrameworks}
          onBatchSetGlobalEnabled={batchSetAgentGlobalEnabled}
          onSetGlobalEnabled={setAgentGlobalEnabled}
          onResolveConflict={resolveAgentConflict}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          query={query}
          setQuery={setQuery}
        />
      ) : null}
      {agentModal ? (
        <AgentDetailsPage
          agent={agentModal}
          content={agentModalContent}
          onChangeContent={setAgentModalContent}
          onSave={saveAgentModal}
          onRename={renameAgentModal}
          onBack={handleCloseAgent}
          busy={routeBusy}
          agentsState={agentsState}
          onToggleAgent={toggleAgent}
          onResolveConflict={resolveAgentConflict}
          onSetGlobalEnabled={setAgentGlobalEnabled}
        />
      ) : null}
    </div>
  );
});

const McpRoute = memo(function McpRoute({
  hidden,
  routeServerId,
  refreshVersion,
  navigate,
  appBusy,
  onBusyChange,
  onDetailChange,
  onCountChange
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const {
    busy,
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
    testServer,
    serverStatuses
  } = useMcpState();

  const routeBusy = appBusy || busy;

  useEffect(() => { onBusyChange("MCP", busy); }, [busy, onBusyChange]);
  useEffect(() => { onDetailChange("MCP", !!serverModal); }, [serverModal, onDetailChange]);
  useEffect(() => { onCountChange("MCP", mcpState?.servers?.length); }, [mcpState, onCountChange]);
  useEffect(() => { if (refreshVersion > 0) loadMcp(); }, [refreshVersion]);

  useEffect(() => {
    if (hidden) return;
    if (routeServerId && serverModal?.id !== routeServerId) {
      openServerModal(routeServerId);
    } else if (!routeServerId && serverModal) {
      setServerModal(null);
    }
  }, [hidden, routeServerId, serverModal]);

  const handleOpenServer = useCallback((serverId) => navigate("MCP", serverId), [navigate]);
  const handleCloseServer = useCallback(() => navigate("MCP"), [navigate]);
  const handleRenameServer = useCallback(async (newId) => {
    const result = await renameServerModal(newId);
    if (result) navigate("MCP", result);
  }, [renameServerModal, navigate]);
  const handleBatchToggleAllFrameworks = useCallback(async (serverIds, enabled) => {
    await Promise.all(serverIds.map((id) => batchToggleAllFrameworks(id, enabled)));
  }, [batchToggleAllFrameworks]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      {!serverModal ? (
        <McpPanel
          mcpState={mcpState}
          busy={routeBusy}
          onOpenServer={handleOpenServer}
          onCreateServer={createNewServer}
          onDeleteServer={deleteExistingServer}
          onBatchToggleAllFrameworks={handleBatchToggleAllFrameworks}
          onBatchSetGlobalEnabled={batchSetGlobalEnabled}
          onSetGlobalEnabled={setGlobalEnabled}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          query={query}
          setQuery={setQuery}
          serverStatuses={serverStatuses}
        />
      ) : null}
      {serverModal ? (
        <McpDetailsPage
          server={serverModal}
          content={serverModalContent}
          onChangeContent={setServerModalContent}
          onSave={saveServerModal}
          onRename={handleRenameServer}
          onBack={handleCloseServer}
          busy={routeBusy}
          mcpState={mcpState}
          onToggleServer={toggleServer}
          onSetGlobalEnabled={setGlobalEnabled}
          onTestServer={testServer}
          serverStatuses={serverStatuses}
        />
      ) : null}
    </div>
  );
});
