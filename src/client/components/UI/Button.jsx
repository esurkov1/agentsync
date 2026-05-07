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

export function Button({ className = "", variant, ...props }) {
  const baseClass = variantClasses[variant || "default"] || `btn ${variant}`;
  return <button className={`${baseClass} ${className}`.trim()} {...props} />;
}
