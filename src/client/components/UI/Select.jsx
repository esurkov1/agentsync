import React from "react";

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`input ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}
