import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, TopTabs } from "./components/UI";
import { AgentSystemRulesModal } from "./components/AgentSystemRulesModal";
import { SkillsPanel } from "./components/SkillsPanel";
import { SkillDetailsPage } from "./pages/SkillDetailsPage";
import { AgentsPanel } from "./components/AgentsPanel";
import { AgentDetailsPage } from "./pages/AgentDetailsPage";
import { McpPanel } from "./components/McpPanel";
import { McpDetailsPage } from "./pages/McpDetailsPage";
import { HooksPage } from "./pages/HooksPage";
import { PluginsPanel } from "./components/PluginsPanel";
import { PluginDetailsPage } from "./pages/PluginDetailsPage";
import { RulesPage } from "./pages/RulesPage";
import { InstallerModal } from "./components/InstallerModal";
import { InstallerScanModal } from "./components/InstallerScanModal";
import { InstallDropdown } from "./components/InstallDropdown";
import { SkillsShModal } from "./components/SkillsShModal";
import { useSkillsShInstaller } from "./hooks/useSkillsShInstaller";
import { useRulesState } from "./hooks/useRulesState";
import { useSkillsState } from "./hooks/useSkillsState";
import { useAgentsState } from "./hooks/useAgentsState";
import { useMcpState } from "./hooks/useMcpState";
import { useHooksState } from "./hooks/useHooksState";
import { usePluginsState } from "./hooks/usePluginsState";
import { useRouter } from "./hooks/useRouter";
import { useInstaller } from "./hooks/useInstaller";
import { FileDetailOverlay } from "./components/FileDetailOverlay";

function useScrollRestore(isDetailOpen) {
  const savedY = useRef(0);
  useEffect(() => {
    if (isDetailOpen) {
      savedY.current = window.scrollY;
    } else {
      requestAnimationFrame(() => window.scrollTo(0, savedY.current));
    }
  }, [isDetailOpen]);
}

const EMPTY_STATUS = { RULES: false, SKILLS: false, AGENTS: false, MCP: false, HOOKS: false, PLUGINS: false };
const EMPTY_COUNTS = { SKILLS: undefined, AGENTS: undefined, MCP: undefined, HOOKS: undefined, PLUGINS: undefined };

export function App() {
  const {
    tab,
    skillId: routeSkillId,
    agentId: routeAgentId,
    serverId: routeServerId,
    pluginId: routePluginId,
    overlayType: routeOverlayType,
    overlayId: routeOverlayId,
    navigate,
    navigateOverlay
  } = useRouter();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [busyByTab, setBusyByTab] = useState(EMPTY_STATUS);
  const [detailByTab, setDetailByTab] = useState(EMPTY_STATUS);
  const [tabCounts, setTabCounts] = useState(EMPTY_COUNTS);

  const busy = busyByTab.RULES || busyByTab.SKILLS || busyByTab.AGENTS || busyByTab.MCP || busyByTab.HOOKS || busyByTab.PLUGINS;
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
  const installer = useInstaller(refreshAll);
  const skillssh = useSkillsShInstaller(refreshAll);

  return (
    <div className="container">
      <div className="app-header">
        <div className="topbar">
          <svg className="topbar-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="9" y="11" width="2" height="2" rx="0.5" fill="currentColor"/>
            <rect x="13" y="11" width="2" height="2" rx="0.5" fill="currentColor"/>
            <path d="M9 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 8V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="12" cy="4" r="1" fill="currentColor"/>
            <path d="M5 13H3M19 13h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div className="topbar-nav">
            {showingDetail
              ? <Button onClick={routeOverlayType ? () => history.back() : handleCloseDetail} disabled={busy}>← Back</Button>
              : <TopTabs current={tab} onChange={handleTabChange} counts={tabCounts} />}
          </div>
          <div className="row">
            <InstallDropdown onGitHub={installer.openScan} onSkillsSh={skillssh.openModal} disabled={busy} />
            <Button onClick={refreshAll} disabled={busy} loading={busy}>Refresh</Button>
          </div>
        </div>
      </div>

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

      <HooksRoute
        hidden={tab !== "HOOKS"}
        refreshVersion={refreshVersion}
        onBusyChange={setTabBusy}
        onCountChange={setTabCount}
      />

      <PluginsRoute
        hidden={tab !== "PLUGINS"}
        routePluginId={routePluginId}
        routeOverlayType={routeOverlayType}
        routeOverlayId={routeOverlayId}
        refreshVersion={refreshVersion}
        navigate={navigate}
        navigateOverlay={navigateOverlay}
        appBusy={busy}
        onBusyChange={setTabBusy}
        onDetailChange={setTabDetail}
        onCountChange={setTabCount}
      />

      {installer.open ? (
        <InstallerModal
          busy={installer.busy}
          error={installer.error}
          repoUrl={installer.repoUrl}
          grouped={installer.grouped}
          selectedKeys={installer.selectedKeys}
          onToggleItem={installer.toggleItem}
          onToggleCategory={installer.toggleCategory}
          onTogglePlugin={installer.togglePlugin}
          onToggleAll={installer.toggleAll}
          onSetItemType={installer.setItemType}
          onSetAllItemTypes={installer.setAllItemTypes}
          totalCount={installer.items.length}
          progress={installer.progress}
          onInstall={installer.install}
          onClose={() => installer.setOpen(false)}
        />
      ) : null}
      {installer.scanOpen ? (
        <InstallerScanModal
          busy={installer.busy}
          error={installer.error}
          ghStatus={installer.ghStatus}
          ghStatusLoading={installer.ghStatusLoading}
          repoUrl={installer.repoUrl}
          setRepoUrl={installer.setRepoUrl}
          onScan={installer.scan}
          onClose={() => installer.setScanOpen(false)}
        />
      ) : null}
      {skillssh.open ? (
        <SkillsShModal
          busy={skillssh.busy}
          searching={skillssh.searching}
          error={skillssh.error}
          results={skillssh.results}
          resultCount={skillssh.resultCount}
          selectedIds={skillssh.selectedIds}
          selectedCount={skillssh.selectedCount}
          progress={skillssh.progress}
          query={skillssh.query}
          setQuery={skillssh.setQuery}
          onSearch={skillssh.search}
          onToggleItem={skillssh.toggleItem}
          onToggleAll={skillssh.toggleAll}
          onInstall={skillssh.install}
          onClose={skillssh.closeModal}
        />
      ) : null}
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
    agentModal: agentSystemModal,
    setAgentModal: setAgentSystemModal,
    agentModalContent: agentSystemModalContent,
    setAgentModalContent: setAgentSystemModalContent,
    openAgentModal: openAgentSystemModal,
    saveAgentModal: saveAgentSystemModal,
    agentDirty: agentSystemDirty
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
        openAgentModal={openAgentSystemModal}
        switchMode={switchMode}
      />

      {agentSystemModal ? (
        <AgentSystemRulesModal
          agent={agentSystemModal}
          content={agentSystemModalContent}
          onChangeContent={setAgentSystemModalContent}
          onClose={() => setAgentSystemModal(null)}
          onSave={saveAgentSystemModal}
          busy={busy}
          showSave={agentSystemDirty}
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
  useScrollRestore(!!skillModal);

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
      <div style={skillModal ? { display: "none" } : undefined}>
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
      </div>
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
          onDelete={async () => { await deleteExistingSkill(skillModal.skillId); handleCloseSkill(); }}
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
  useScrollRestore(!!agentModal);

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
      <div style={agentModal ? { display: "none" } : undefined}>
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
      </div>
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
          onDelete={async () => { await deleteExistingAgent(agentModal.agentName); handleCloseAgent(); }}
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
  useScrollRestore(!!serverModal);

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
      <div style={serverModal ? { display: "none" } : undefined}>
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
      </div>
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
          onDelete={async () => { await deleteExistingServer(serverModal.id); handleCloseServer(); }}
        />
      ) : null}
    </div>
  );
});

const HooksRoute = memo(function HooksRoute({
  hidden,
  refreshVersion,
  onBusyChange,
  onCountChange
}) {
  const {
    busy,
    hooksState,
    hookCount,
    content,
    setContent,
    scope,
    setScope,
    selectedAgentId,
    setSelectedAgentId,
    reload,
    commitHooks,
    syncHooks,
  } = useHooksState();

  useEffect(() => { onBusyChange("HOOKS", busy); }, [busy, onBusyChange]);
  useEffect(() => { if (refreshVersion > 0) reload(); }, [refreshVersion]);
  useEffect(() => { onCountChange("HOOKS", hooksState ? hookCount : undefined); }, [hooksState, hookCount, onCountChange]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      <HooksPage
        hooksState={hooksState}
        content={content}
        onCommit={commitHooks}
        onSync={syncHooks}
        busy={busy}
        scope={scope}
        setScope={setScope}
        selectedAgentId={selectedAgentId}
        setSelectedAgentId={setSelectedAgentId}
      />
    </div>
  );
});

const PluginsRoute = memo(function PluginsRoute({
  hidden,
  routePluginId,
  routeOverlayType,
  routeOverlayId,
  refreshVersion,
  navigate,
  navigateOverlay,
  appBusy,
  onBusyChange,
  onDetailChange,
  onCountChange
}) {
  const {
    busy,
    pluginsState,
    loadPlugins,
    syncPlugins,
    createNewPlugin,
    deleteExistingPlugin,
    pluginModal,
    setPluginModal,
    pluginModalContent,
    setPluginModalContent,
    pluginContents,
    openPluginModal,
    savePluginModal,
    preview,
    previewSync
  } = usePluginsState();

  const routeBusy = appBusy || busy;
  useEffect(() => { onBusyChange("PLUGINS", busy); }, [busy, onBusyChange]);
  useEffect(() => { onDetailChange("PLUGINS", !!pluginModal || !!routeOverlayType); }, [pluginModal, routeOverlayType, onDetailChange]);
  useEffect(() => { onCountChange("PLUGINS", pluginsState?.plugins?.length); }, [pluginsState, onCountChange]);
  useEffect(() => { if (refreshVersion > 0) loadPlugins(); }, [refreshVersion]);

  useEffect(() => {
    if (hidden) return;
    if (routePluginId && pluginModal?.id !== routePluginId) {
      openPluginModal(routePluginId);
    } else if (!routePluginId && pluginModal) {
      setPluginModal(null);
    }
  }, [hidden, routePluginId, pluginModal, openPluginModal, setPluginModal]);

  const handleOpenPlugin = useCallback((pluginId) => navigate("PLUGINS", pluginId), [navigate]);
  const handleClosePlugin = useCallback(() => navigate("PLUGINS"), [navigate]);
  const handleNavigateSkill = useCallback((id) => navigateOverlay(routePluginId, "skill", id), [navigateOverlay, routePluginId]);
  const handleNavigateAgent = useCallback((id) => navigateOverlay(routePluginId, "agent", id), [navigateOverlay, routePluginId]);
  const handleNavigateMcp = useCallback((id) => navigateOverlay(routePluginId, "mcp", id), [navigateOverlay, routePluginId]);
  const handleNavigateHooks = useCallback(() => navigate("HOOKS"), [navigate]);

  return (
    <div className={hidden ? "hidden-block" : ""} aria-hidden={hidden}>
      <div className={routeOverlayType ? "hidden-block" : ""}>
        {!pluginModal ? (
          <PluginsPanel
            pluginsState={pluginsState}
            busy={routeBusy}
            onOpenPlugin={handleOpenPlugin}
            onCreatePlugin={createNewPlugin}
            onDeletePlugin={deleteExistingPlugin}
            onSyncPlugins={syncPlugins}
            onPreviewSync={previewSync}
            preview={preview}
          />
        ) : null}
        {pluginModal ? (
          <PluginDetailsPage
            plugin={pluginModal}
            frameworks={pluginsState?.frameworks || []}
            content={pluginModalContent}
            onChangeContent={setPluginModalContent}
            onSave={savePluginModal}
            onBack={handleClosePlugin}
            busy={routeBusy}
            dirty={pluginModalContent !== (pluginModal?.originalContent || "")}
            pluginContents={pluginContents}
            onNavigateSkill={handleNavigateSkill}
            onNavigateAgent={handleNavigateAgent}
            onNavigateMcp={handleNavigateMcp}
            onNavigateHooks={handleNavigateHooks}
          />
        ) : null}
      </div>
      {routeOverlayType ? (
        <FileDetailOverlay
          overlay={{ type: routeOverlayType, id: routeOverlayId }}
          onClose={() => history.back()}
        />
      ) : null}
    </div>
  );
});
