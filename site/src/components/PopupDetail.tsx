"use client";

import { ReactNode } from "react";

type PopupDetailProps = {
  icon: ReactNode;
  text: string;
  label: string;
  children?: ReactNode;
  hideLabel?: boolean;
};

export default function PopupDetail({ icon, text, label, children, hideLabel = false }: PopupDetailProps) {
  return (
    <div className={`popup-detail min-w-0${children ? " popup-detail-linked" : ""}${hideLabel ? " popup-detail-inline" : ""}`}>
      <dt className="flex items-center gap-2 text-xs text-gray-300">
        <span className="size-5 min-w-5" aria-hidden="true">{icon}</span>
        <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
      </dt>
      <dd className="pl-7 whitespace-pre-line [overflow-wrap:anywhere]">{text}{children !== undefined && <> {children}</>}</dd>
    </div>
  );
}
