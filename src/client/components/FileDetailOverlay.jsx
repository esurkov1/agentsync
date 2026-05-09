import React, { useEffect } from "react";
import { SkillDetailsPage } from "../pages/SkillDetailsPage";
import { AgentDetailsPage } from "../pages/AgentDetailsPage";
import { McpDetailsPage } from "../pages/McpDetailsPage";
import { useSkillsState } from "../hooks/useSkillsState";
import { useAgentsState } from "../hooks/useAgentsState";
import { useMcpState } from "../hooks/useMcpState";

function SkillOverlay({ id, onClose }) {
  const {
    busy, skillsState, skillModal, skillModalContent, setSkillModalContent,
    openSkillModal, saveSkillModal, renameSkillModal, deleteExistingSkill,
    toggleSkill, resolveConflict, setGlobalEnabled
  } = useSkillsState();

  useEffect(() => { openSkillModal(id); }, [id]);

  if (!skillModal) return null;
  return (
    <SkillDetailsPage
      skill={skillModal}
      content={skillModalContent}
      onChangeContent={setSkillModalContent}
      onSave={saveSkillModal}
      onRename={renameSkillModal}
      onBack={onClose}
      busy={busy}
      skillsState={skillsState}
      onToggleSkill={toggleSkill}
      onResolveConflict={resolveConflict}
      onSetGlobalEnabled={setGlobalEnabled}
      onDelete={async () => { await deleteExistingSkill(skillModal.skillId); onClose(); }}
      fromPlugin
    />
  );
}

function AgentOverlay({ id, onClose }) {
  const {
    busy, agentsState, agentModal, agentModalContent, setAgentModalContent,
    openAgentModal, saveAgentModal, renameAgentModal, deleteExistingAgent,
    toggleAgent, resolveConflict, setGlobalEnabled
  } = useAgentsState();

  useEffect(() => { openAgentModal(id); }, [id]);

  if (!agentModal) return null;
  return (
    <AgentDetailsPage
      agent={agentModal}
      content={agentModalContent}
      onChangeContent={setAgentModalContent}
      onSave={saveAgentModal}
      onRename={renameAgentModal}
      onBack={onClose}
      busy={busy}
      agentsState={agentsState}
      onToggleAgent={toggleAgent}
      onResolveConflict={resolveConflict}
      onSetGlobalEnabled={setGlobalEnabled}
      onDelete={async () => { await deleteExistingAgent(agentModal.agentName); onClose(); }}
      fromPlugin
    />
  );
}

function McpOverlay({ id, onClose }) {
  const {
    busy, mcpState, serverModal, serverModalContent, setServerModalContent,
    openServerModal, saveServerModal, renameServerModal, deleteExistingServer,
    toggleServer, setGlobalEnabled, testServer, serverStatuses
  } = useMcpState();

  useEffect(() => { openServerModal(id); }, [id]);

  if (!serverModal) return null;
  return (
    <McpDetailsPage
      server={serverModal}
      content={serverModalContent}
      onChangeContent={setServerModalContent}
      onSave={saveServerModal}
      onRename={renameServerModal}
      onBack={onClose}
      busy={busy}
      mcpState={mcpState}
      onToggleServer={toggleServer}
      onSetGlobalEnabled={setGlobalEnabled}
      onTestServer={testServer}
      serverStatuses={serverStatuses}
      onDelete={async () => { await deleteExistingServer(serverModal.id); onClose(); }}
      fromPlugin
    />
  );
}

export function FileDetailOverlay({ overlay, onClose }) {
  if (!overlay) return null;
  if (overlay.type === "skill") return <SkillOverlay id={overlay.id} onClose={onClose} />;
  if (overlay.type === "agent") return <AgentOverlay id={overlay.id} onClose={onClose} />;
  if (overlay.type === "mcp") return <McpOverlay id={overlay.id} onClose={onClose} />;
  return null;
}
