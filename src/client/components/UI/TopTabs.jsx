import React from "react";
import { Tabs } from "./Tabs";

function formatLabel(base, count) {
  return `${base} (${typeof count === "number" ? count : 0})`;
}

export function TopTabs({ current, onChange, counts }) {
  const tabs = [
    { value: "RULES", label: "RULES" },
    { value: "SKILLS", label: formatLabel("SKILLS", counts?.SKILLS) },
    { value: "AGENTS", label: formatLabel("AGENTS", counts?.AGENTS) },
    { value: "MCP", label: formatLabel("MCP", counts?.MCP) },
    { value: "HOOKS", label: formatLabel("HOOKS", counts?.HOOKS) },
    { value: "PLUGINS", label: formatLabel("PLUGINS", counts?.PLUGINS) }
  ];

  return <Tabs tabs={tabs} current={current} onChange={onChange} />;
}
