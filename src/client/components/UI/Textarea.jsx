import React from "react";

export function Textarea({ className = "", ...props }) {
  return <textarea className={`textarea ${className}`.trim()} {...props} />;
}
