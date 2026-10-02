import type { ReactNode } from "react";

function ModalIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function CloseIcon() {
  return <ModalIcon><path d="M6 6L18 18" /><path d="M18 6L6 18" /></ModalIcon>;
}

export function FullscreenIcon({ active }: { active: boolean }) {
  const paths = active
    ? ["M8 3v5H3", "M21 8h-5V3", "M16 21v-5h5", "M3 16h5v5"]
    : ["M3 8V3h5", "M16 3h5v5", "M21 16v5h-5", "M8 21H3v-5"];
  return <ModalIcon>{paths.map(d => <path key={d} d={d} />)}</ModalIcon>;
}
