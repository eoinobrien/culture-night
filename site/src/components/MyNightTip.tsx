"use client";

import { useEffect, useRef, type RefObject } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export default function MyNightTip({ anchor, onDismiss }: {
  anchor: RefObject<HTMLDivElement | null>;
  onDismiss: () => void;
}) {
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) onDismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (tip.current?.contains(document.activeElement)) anchor.current?.querySelector("button")?.focus();
      onDismiss();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor, onDismiss]);

  return (
    <div ref={tip} className="my-night-tip" role="region" aria-label="My Night tip">
      <p id="my-night-tip-message" role="status">Saved to My Night. Open My Night to customise the order and share your plan.</p>
      <button type="button" className="icon-button" aria-label="Dismiss My Night tip" onClick={() => {
        anchor.current?.querySelector("button")?.focus();
        onDismiss();
      }}><XMarkIcon aria-hidden="true" /></button>
    </div>
  );
}
