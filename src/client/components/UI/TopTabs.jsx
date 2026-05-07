import React from "react";
import { Tabs } from "./Tabs";

function formatLabel(base, count) {
  return typeof count === "number" ? `${base} (${count})` : base;
}

export function TopTabs({ current, onChange, counts }) {
  const tabs = [
    { value: "RULES", label: "RULES" },
    { value: "SKILLS", label: formatLabel("SKILLS", counts?.SKILLS) },
    { value: "AGENTS", label: formatLabel("AGENTS", counts?.AGENTS) },
    { value: "MCP", label: formatLabel("MCP", counts?.MCP) }
  ];

  return <Tabs tabs={tabs} current={current} onChange={onChange} />;
}
