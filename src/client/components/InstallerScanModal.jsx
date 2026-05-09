import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Modal } from "./UI";

export function InstallerScanModal({
  busy,
  error,
  ghStatus,
  ghStatusLoading,
  repoUrl,
  setRepoUrl,
  onScan,
  onClose
}) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const repoInputRef = useRef(null);

  useEffect(() => {
    repoInputRef.current?.focus();
  }, []);

  return (
    <Modal onClose={onClose} minWidth={520} maxWidth={680} className="installer-scan-modal">
      <div className="modal-head">
        <div className="modal-title-block">
          <strong className="modal-title">Repository Scan</strong>
        </div>
      </div>

      <div className="section-gap">
        <div className="installer-gh-status-row">
          <span className="muted">GitHub CLI</span>
          {ghStatusLoading ? (
            <span className="installer-gh-badge installer-gh-badge--loading">Checking...</span>
          ) : ghStatus?.authenticated ? (
            <span className="installer-gh-badge installer-gh-badge--ok">
              {ghStatus.login ? `@${ghStatus.login}` : "Authenticated"}
            </span>
          ) : (
            <span className="installer-gh-badge installer-gh-badge--fail">Not authenticated</span>
          )}
        </div>
        <button
          className="installer-gh-instructions-toggle"
          onClick={() => setInstructionsOpen((v) => !v)}
          type="button"
        >
          <span className="installer-gh-instructions-arrow">{instructionsOpen ? "▾" : "▸"}</span>
          How to install or configure gh CLI
        </button>
        {instructionsOpen && (
          <div className="installer-gh-instructions">
            <p className="installer-gh-instructions-p">Install the GitHub CLI:</p>
            <pre className="installer-gh-instructions-pre">brew install gh</pre>
            <p className="installer-gh-instructions-p">Authenticate:</p>
            <pre className="installer-gh-instructions-pre">gh auth login</pre>
            <p className="installer-gh-instructions-p">Or use a specific token:</p>
            <pre className="installer-gh-instructions-pre">{"gh auth login --with-token <<< YOUR_TOKEN"}</pre>
            <p className="installer-gh-instructions-p">Check current status:</p>
            <pre className="installer-gh-instructions-pre">gh auth status</pre>
          </div>
        )}
      </div>

      <div className="section-gap installer-scan-field">
<Input
          ref={repoInputRef}
          className="installer-scan-input"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy && repoUrl.trim()) onScan(); }}
          placeholder="https://github.com/owner/repo"
          disabled={busy}
        />
      </div>

      {error ? <div className="muted section-gap" style={{ color: "#fca5a5" }}>{error}</div> : null}

      <div className="section-gap installer-scan-footer">
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={onScan} disabled={busy || !repoUrl.trim()} loading={busy}>Scan</Button>
      </div>
    </Modal>
  );
}
