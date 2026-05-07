import React from "react";

const toneClasses = {
  neutral: "ui-badge ui-badge-neutral",
  success: "ui-badge ui-badge-success",
  warning: "ui-badge ui-badge-warning",
  danger: "ui-badge ui-badge-danger",
  info: "ui-badge ui-badge-info",
  accent: "ui-badge ui-badge-accent"
};

export function Badge({ tone = "neutral", className = "", children, ...props }) {
  const baseClass = toneClasses[tone] || toneClasses.neutral;
  return (
    <span className={`${baseClass} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
