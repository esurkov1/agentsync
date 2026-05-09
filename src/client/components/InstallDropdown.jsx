import React, { useEffect, useRef, useState } from "react";
import { Button } from "./UI";

export function InstallDropdown({ onGitHub, onSkillsSh, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (fn) => { setOpen(false); fn(); };

  return (
    <div className="install-dropdown" ref={ref}>
      <Button onClick={() => setOpen((v) => !v)} disabled={disabled}>
        Install
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginLeft: 5 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      {open && (
        <div className="install-dropdown-menu">
          <Button variant="menu" onClick={() => run(onGitHub)}>From GitHub</Button>
          <Button variant="menu" onClick={() => run(onSkillsSh)}>Install skills</Button>
        </div>
      )}
    </div>
  );
}
