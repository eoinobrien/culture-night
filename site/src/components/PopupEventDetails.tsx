"use client";

import { CultureNightEvent } from "@/interfaces/event";
import { ClockIcon, DocumentTextIcon, MapPinIcon, UserIcon } from "@heroicons/react/24/solid";
import PopupDetail from "./PopupDetail";

type PopupEventDetailsProps = {
  event: CultureNightEvent;
};

export default function PopupEventDetails({ event }: PopupEventDetailsProps) {
  return (
    <div>
      <h1 className="text-lg font-bold">{event.title}</h1>
      <div className="grid truncate">
        {event.venueName && (
          <PopupDetail icon={<MapPinIcon />} text={event.venueName} />
        )}
        {event.host && <PopupDetail icon={<UserIcon />} text={event.host} />}
        {event.time && <PopupDetail icon={<ClockIcon />} text={event.time} />}
        {event.description && <PopupDetail icon={<DocumentTextIcon />} text={event.description} />}
      </div>
    </div>
  );
}
