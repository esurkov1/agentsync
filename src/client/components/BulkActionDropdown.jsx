import React, { useEffect, useRef, useState } from "react";
import { Button } from "./UI";

const ACTIONS = [
  { key: "enable",      label: "Enable" },
  { key: "disable",     label: "Disable" },
  { key: "activateAll", label: "Activate all workspaces" },
  { key: "force",       label: "Force fix" },
  { key: "divider" },
  { key: "delete",      label: "Delete",             className: "bulk-menu-delete" },
];

export function BulkActionDropdown({ count, onEnable, onDisable, onActivateAll, onForce, onDelete, disabled, showForce = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handlers = { enable: onEnable, disable: onDisable, activateAll: onActivateAll, force: onForce, delete: onDelete };

  const run = (key) => {
    setOpen(false);
    handlers[key]?.();
  };

  return (
    <div className="bulk-dropdown" ref={ref}>
      <Button
        className="bulk-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        {count} selected
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginLeft: 5 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      {open ? (
        <div className="bulk-dropdown-menu">
          {ACTIONS
            .filter((action) => showForce || action.key !== "force")
            .map((action) =>
            action.key === "divider" ? (
              <div key="divider" className="bulk-menu-divider" />
            ) : (
              <Button
                key={action.key}
                variant="menu"
                className={action.className}
                onClick={() => run(action.key)}
              >
                {action.label}
              </Button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
