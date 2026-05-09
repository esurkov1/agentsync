import React, { forwardRef } from "react";

export const Input = forwardRef(function Input({ className = "", size, ...props }, ref) {
  const sizeClass = size === "mini" ? "btn--mini" : "";
  return <input ref={ref} className={`input ${sizeClass} ${className}`.trim()} {...props} />;
});
