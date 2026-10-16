"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipAnchor = { x: number; y: number; mode: "pointer" | "focus" | "touch" };

export function AssessmentAccountCard({ summary, disabled, active, onOpen, children }: {
  summary?: string;
  disabled: boolean;
  active: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef("");
  const dismissed = useRef(false);
  const tooltipId = useId();
  const explanation = summary?.trim();
  const open = Boolean(active && anchor && explanation && !disabled);

  function showAboveCard(button: HTMLButtonElement, mode: "focus" | "touch") {
    if (!explanation || disabled) return;
    const bounds = button.getBoundingClientRect();
    onOpen();
    setAnchor({ x: bounds.left + bounds.width / 2, y: bounds.top, mode });
  }

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!open || !anchor || !tooltip) return;
    const bounds = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.x - bounds.width / 2, window.innerWidth - bounds.width - margin));
    const top = Math.max(margin, Math.min(anchor.y - bounds.height - 12, window.innerHeight - bounds.height - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = "visible";
  }, [open, anchor, explanation]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !cardRef.current?.contains(event.target)) setAnchor(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      dismissed.current = true;
      setAnchor(null);
    }
    function closeOnViewportChange() { setAnchor(null); }
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [open]);

  return <div
    ref={cardRef}
    className="assessment-account"
    onPointerDown={(event) => { pointerType.current = event.pointerType; }}
    onPointerEnter={(event) => {
      if (event.pointerType !== "mouse" || !explanation || disabled || dismissed.current) return;
      onOpen();
      setAnchor({ x: event.clientX, y: event.clientY, mode: "pointer" });
    }}
    onPointerMove={(event) => {
      if (event.pointerType !== "mouse" || dismissed.current) return;
      setAnchor((current) => current?.mode === "pointer" ? { x: event.clientX, y: event.clientY, mode: "pointer" } : current);
    }}
    onPointerLeave={() => {
      dismissed.current = false;
      setAnchor((current) => current?.mode === "pointer" ? null : current);
    }}
  >
    <button
      type="button"
      className="assessment-account-trigger w-full text-left"
      disabled={disabled}
      aria-describedby={open ? tooltipId : undefined}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":focus-visible") || (open && anchor?.mode === "pointer")) return;
        dismissed.current = false;
        showAboveCard(event.currentTarget, "focus");
      }}
      onBlur={() => {
        dismissed.current = false;
        setAnchor(null);
      }}
      onClick={(event) => {
        if (event.detail === 0) {
          dismissed.current = false;
          showAboveCard(event.currentTarget, "focus");
        } else if (pointerType.current === "touch" || pointerType.current === "pen") {
          dismissed.current = false;
          if (anchor?.mode === "touch") setAnchor(null);
          else showAboveCard(event.currentTarget, "touch");
        }
      }}
    >{children}</button>
    {open && createPortal(<div
      ref={tooltipRef}
      id={tooltipId}
      className="assessment-summary-tooltip"
      role="tooltip"
      style={{ visibility: "hidden" }}
    >{explanation}</div>, document.body)}
  </div>;
}
