import React from "react";

export function Button({ className = "", ...props }) {
  return <button className={`btn ${className}`.trim()} {...props} />;
}
