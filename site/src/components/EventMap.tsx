"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import { Geocode } from "@/interfaces/geocode";
import { CultureNightEvent } from "@/interfaces/culture-night-event";
import PopupEventDetails from "./PopupEventDetails";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type EventMapProps = {
  position: Geocode;
  zoom: number;
  events: CultureNightEvent[];
  selectedTitle?: string;
};

export default function EventMap({ position, zoom, events, selectedTitle }: EventMapProps) {
  // store marker refs so we can open a popup programmatically
  const markerRefs = useRef<Map<string, any>>(new Map());
  const clusterRef = useRef<any>(null);
  const previousSelectedMarker = useRef<any>(null);

  const createIcon = (color = "#2880c9") => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='25' height='41' viewBox='0 0 25 41'>
      <path d='M12.5 0C7 0 2.5 4.5 2.5 10c0 8.3 10 21 10 21s10-12.7 10-21C22.5 4.5 18 0 12.5 0z' fill='${color}' stroke='#ffffff' stroke-width='1'/>
    </svg>`;
    const url = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    const shadowUrl = (L.Icon.Default && (L.Icon.Default.prototype as any).options && (L.Icon.Default.prototype as any).options.shadowUrl) || undefined;
    return new L.Icon({
      iconUrl: url,
      shadowUrl,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  };

  // Controller that uses leaflet's useMap inside MapContainer
  function MapController({
    events,
    selectedTitle,
    markerRefs,
  }: {
    events: CultureNightEvent[];
    selectedTitle?: string;
    markerRefs: React.MutableRefObject<Map<string, any>>;
  }) {
    const map = useMap();

    useEffect(() => {
      if (!selectedTitle) return;
      const ev = events.find((e) => e.title === selectedTitle);
      if (!ev || !ev.geocode) return;

      // Find the stored marker reference
      const marker = markerRefs.current.get(ev.title);

      // If the marker is managed by a cluster, ask cluster to reveal it first
      const cluster = clusterRef.current;
      if (cluster && marker && typeof cluster.zoomToShowLayer === "function") {
        try {
          cluster.zoomToShowLayer(marker, () => {
            // marker should now be visible/unclustered
            try {
              // restore previous selected marker icon
              if (
                previousSelectedMarker.current &&
                previousSelectedMarker.current !== marker
              ) {
                try {
                  previousSelectedMarker.current.setIcon(new L.Icon.Default());
                } catch (e) {}
              }
              // set selected icon and open popup
              try {
                marker.setIcon(createIcon("#fe9a00"));
              } catch (e) {}
              setTimeout(() => {
                try {
                  marker.openPopup();
                } catch (e) {}
              }, 100);
              previousSelectedMarker.current = marker;
            } catch (e) {}
          });
        } catch (e) {
          // fallback
          map.setView(ev.geocode, 17, { animate: true });
          setTimeout(() => marker?.openPopup?.(), 300);
        }
        return;
      }

      // not clustered, just pan and open popup
      map.setView(ev.geocode, 17, { animate: true });
      if (marker && typeof marker.openPopup === "function") {
        // restore previous
        if (previousSelectedMarker.current && previousSelectedMarker.current !== marker) {
          try {
            previousSelectedMarker.current.setIcon(new L.Icon.Default());
          } catch (e) {}
        }
        try {
          marker.setIcon(createSelectedIcon());
        } catch (e) {}
        setTimeout(() => marker.openPopup(), 300);
        previousSelectedMarker.current = marker;
      }
    }, [selectedTitle, events, map]);

    return null;
  }

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

      <MarkerClusterGroup ref={clusterRef} chunkedLoading>
        {events.map((event, index) => {
          if (event.geocode === null) {
            return <></>;
          }
          return (
            <Marker
              key={index}
              title={event.title}
              position={event.geocode}
              icon={createIcon()}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current.set(event.title, ref);
                } else {
                  markerRefs.current.delete(event.title);
                }
              }}
            >
              <Popup>
                <PopupEventDetails event={event} />
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>

      <MapController
        events={events}
        selectedTitle={selectedTitle}
        markerRefs={markerRefs}
      />
    </MapContainer>
  );
}
