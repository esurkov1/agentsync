import React from "react";

export function Checkbox({ className = "", ...props }) {
  return (
    <label className={`check-wrap ${className}`.trim()}>
      <input type="checkbox" className="check-input" {...props} />
      <span className="check-ui" />
    </label>
  );
}
