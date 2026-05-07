import React from "react";

export function Modal({ children, className = "", onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
