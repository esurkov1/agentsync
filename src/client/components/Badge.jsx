import React from "react";

export function Badge({ children, ok = false }) {
  return <span className={`badge ${ok ? "ok" : ""}`.trim()}>{children}</span>;
}
