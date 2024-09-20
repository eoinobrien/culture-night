"use client";

import { ReactNode } from "react";

type PopupDetailProps = {
  icon: ReactNode;
  text: string;
};

export default function PopupDetail({ icon, text }: PopupDetailProps) {
  return (
    <div className="flex gap-2">
      <div className="size-6 min-w-6">{icon}</div>
      <h2 className="text-base text-balance text-ellipsis">{text.substring(0,100)}</h2>
    </div>
  );
}
