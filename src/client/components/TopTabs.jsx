import React from "react";

const tabs = ["RULES"];

export function TopTabs({ current, onChange }) {
  return (
    <div className="segmented">
      {tabs.map((tab) => (
        <button key={tab} className={`segmented-item ${current === tab ? "active" : ""}`} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}
