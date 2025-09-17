"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import { Geocode } from "@/interfaces/geocode";
import { CultureNightEvent } from "@/interfaces/culture-night-event";
import PopupEventDetails from "./PopupEventDetails";

type EventMapProps = {
  position: Geocode;
  zoom: number;
  events: CultureNightEvent[];
};

export default function EventMap({ position, zoom, events }: EventMapProps) {
  return (
    <MapContainer
      center={position}
      zoom={zoom}
      scrollWheelZoom={true}
      className="w-full lg:h-dvh h-[80dvh]"
    >
      <TileLayer
        attribution='&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
      />

      <MarkerClusterGroup chunkedLoading>
        {events.map((event, index) => {
          if (event.geocode === null) {
            return <></>;
          }
          // console.log(event.title);
          return (
            <Marker key={index} title={event.title} position={event.geocode}>
              <Popup>
                <PopupEventDetails event={event} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
