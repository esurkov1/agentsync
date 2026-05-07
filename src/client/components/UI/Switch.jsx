import React from "react";

export function Switch({ checked, onChange, disabled, title, tone = "default", className = "" }) {
  let cls = "skill-toggle";
  if (disabled) cls += " skill-toggle-disabled";
  if (tone && tone !== "default") cls += ` skill-toggle-${tone}`;
  if (className) cls += ` ${className}`;
  return (
    <label className={cls} title={title} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="skill-toggle-thumb" />
    </label>
  );
}

export const Toggle = Switch;
