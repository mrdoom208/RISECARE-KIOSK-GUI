import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalBackdrop = "blur" | "scrim";

interface ModalShellProps {
  open: boolean;
  /** Explicit stacking order. Must stay below the virtual keyboard (9999). */
  zIndex?: number;
  /** "blur" is retained as a legacy option; both options use GPU-cheap scrims. */
  backdrop?: ModalBackdrop;
  /**
   * Shrinks the centering area by the virtual keyboard height so a focused field
   * is never covered. A no-op while no input holds focus (--vk-height is 0).
   */
  avoidKeyboard?: boolean;
  panelClassName?: string;
  children: ReactNode;
}

const BACKDROP_CLASS: Record<ModalBackdrop, string> = {
  // Keep the modal backdrop cheap to composite on Raspberry Pi kiosk GPUs.
  // A full-screen backdrop-filter causes repeated off-screen blur passes.
  blur: "bg-foreground/25",
  scrim: "bg-foreground/10",
};

export function ModalShell({
  open,
  zIndex = 50,
  backdrop = "blur",
  avoidKeyboard = true,
  panelClassName,
  children,
}: ModalShellProps) {
  if (!open) return null;

  return createPortal(
    <div
      data-modal-shell=""
      className={`fixed inset-0 flex items-center justify-center p-4 ${BACKDROP_CLASS[backdrop]}`}
      style={{
        zIndex,
        paddingBottom: avoidKeyboard ? "calc(1rem + var(--vk-height, 0px))" : "1rem",
      }}
    >
      <div className={panelClassName}>{children}</div>
    </div>,
    document.body,
  );
}
