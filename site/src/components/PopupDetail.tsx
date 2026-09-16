"use client";

import { ReactNode } from "react";

type PopupDetailProps = {
  icon: ReactNode;
  text: string;
  label: string;
};

export default function PopupDetail({ icon, text, label }: PopupDetailProps) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2 text-xs text-gray-300">
        <span className="size-5 min-w-5" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="pl-7 whitespace-pre-line [overflow-wrap:anywhere]">{text}</dd>
    </div>
  );
}
