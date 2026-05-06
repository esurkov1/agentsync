import React from "react";

export function SectionHeader({ title, children }) {
  return (
    <div className="row">
      <strong>{title}</strong>
      <span className="spacer" />
      {children}
    </div>
  );
}
