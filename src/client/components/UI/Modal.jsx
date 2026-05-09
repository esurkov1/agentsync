import React from "react";

export function Modal({
  children,
  className = "",
  onClose,
  width,
  minWidth,
  maxWidth
}) {
  const style = {
    ...(width ? { "--modal-width": typeof width === "number" ? `${width}px` : width } : {}),
    ...(minWidth ? { "--modal-min-width": typeof minWidth === "number" ? `${minWidth}px` : minWidth } : {}),
    ...(maxWidth ? { "--modal-max-width": typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth } : {}),
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`.trim()} style={style} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
