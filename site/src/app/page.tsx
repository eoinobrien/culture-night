import Image from "next/image";
import { CultureNightEvent } from "@/interfaces/event";

import Events from "../api/events.json";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Geocode } from "@/interfaces/geocode";

const IrelandLatLng: Geocode = { lat: 53.4230965, lng: -7.9254405 };

export default function Home() {
  const Map = useMemo(
    () =>
      dynamic(() => import("@/components/EventMap"), {
        loading: () => <p>A map is loading</p>,
        ssr: false,
      }),
    []
  );

  return (
    <div className="grid grid-rows-[20px_1fr_20px] p-4 min-h-screen gap-16">
      <Map
        position={IrelandLatLng}
        zoom={7}
        events={Events as CultureNightEvent[]}
      />
    </div>
  );
}
