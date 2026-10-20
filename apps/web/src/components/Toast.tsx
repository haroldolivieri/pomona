import React, { useEffect, useRef } from "react";

interface ToastProps {
  message: string;
  onDone: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onDone, durationMs = 2500 }) => {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="brand-toast"
      style={{
        position: "fixed",
        bottom: "calc(max(24px, env(safe-area-inset-bottom)) + 24px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 120,
        background: "rgba(0,0,0,0.72)",
        color: "#ffffff",
        padding: "8px 14px",
        borderRadius: "12px",
        fontSize: "12.5px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
};
