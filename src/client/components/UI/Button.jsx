import React from "react";

const variantClasses = {
  default: "btn",
  primary: "btn primary",
  danger: "btn danger",
  force: "btn-force",
  text: "btn-text",
  menu: "bulk-menu-item",
  tree: "skill-tree-row skill-tree-dir"
};

export function Button({ className = "", variant, size, loading, children, disabled, ...props }) {
  const baseClass = variantClasses[variant || "default"] || `btn ${variant}`;
  const sizeClass = size === "mini" ? "btn--mini" : "";
  return (
    <button className={`${baseClass} ${sizeClass} ${className}`.trim()} disabled={disabled || loading} {...props}>
      {loading ? <span className="btn-spinner" /> : children}
    </button>
  );
}
