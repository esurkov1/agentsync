import React from "react";

export function Panel({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component className={`card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
