import React from "react";

export function Tabs({ tabs, current, onChange, disabled, className = "" }) {
  return (
    <div className={`segmented ${className}`.trim()}>
      {tabs.map((tab) => {
        const value = typeof tab === "string" ? tab : tab.value;
        const label = typeof tab === "string" ? tab : tab.label;
        return (
          <button
            key={value}
            className={`segmented-item ${current === value ? "active" : ""}`}
            onClick={() => onChange(value)}
            disabled={disabled}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
