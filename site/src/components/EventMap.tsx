"use client";

import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import { Geocode } from "@/interfaces/geocode";
import { CultureNightEvent } from "@/interfaces/culture-night-event";
import PopupEventDetails from "./PopupEventDetails";
import { useEffect, useRef, useState, type RefObject } from "react";
import L from "leaflet";

type EventMapProps = {
  position: Geocode;
  zoom: number;
  events: CultureNightEvent[];
  selectedUrl?: string;
  onSelect: (url: string) => void;
  onClose: (url: string) => void;
};

function createIcon(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='25' height='41' viewBox='0 0 25 41'>
    <path d='M12.5 0C7 0 2.5 4.5 2.5 10c0 8.3 10 21 10 21s10-12.7 10-21C22.5 4.5 18 0 12.5 0z' fill='${color}' stroke='#ffffff' stroke-width='1'/>
  </svg>`;
  return new L.Icon({
    iconUrl: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}
const normalIcon = createIcon("#2880c9");
const selectedIcon = createIcon("#fe9a00");

function ResponsivePopups() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let resizeFrame = 0;
    let popupFrame = 0;
    let popupObserver: ResizeObserver | undefined;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        const viewport = window.visualViewport;
        const width = Math.min(360, container.clientWidth - 24, (viewport?.width ?? innerWidth) - 24);
        // Reserve room for the zoom controls, popup tip and map attribution.
        const height = Math.min(560, Math.min(container.clientHeight, viewport?.height ?? innerHeight) - 132);
        container.style.setProperty("--event-popup-width", `${Math.max(0, width)}px`);
        container.style.setProperty("--event-popup-height", `${Math.max(0, height)}px`);
        map.invalidateSize({ pan: false });
        map.eachLayer((layer) => {
          if (layer instanceof L.Popup && layer.isOpen()) layer.update();
        });
      });
    };
    const stopObservingPopup = () => {
      popupObserver?.disconnect();
      cancelAnimationFrame(popupFrame);
    };
    const observePopup = ({ popup }: L.PopupEvent) => {
      stopObservingPopup();
      const element = popup.getElement();
      if (!element) return;
      popupObserver = new ResizeObserver(() => {
        cancelAnimationFrame(popupFrame);
        popupFrame = requestAnimationFrame(() => {
          if (popup.isOpen()) popup.update();
        });
      });
      popupObserver.observe(element);
    };
    const mapObserver = new ResizeObserver(resize);
    mapObserver.observe(container);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    map.on("popupopen", observePopup);
    map.on("popupclose", stopObservingPopup);
    resize();
    return () => {
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(popupFrame);
      mapObserver.disconnect();
      stopObservingPopup();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      map.off("popupopen", observePopup);
      map.off("popupclose", stopObservingPopup);
    };
  }, [map]);
  return null;
}

function MapController({
  selectedEvent, markerRefs, clusterRef, onError, onReveal,
}: {
  selectedEvent?: CultureNightEvent;
  markerRefs: RefObject<Map<string, L.Marker>>;
  clusterRef: RefObject<L.MarkerClusterGroup | null>;
  onError: (message: string | undefined) => void;
  onReveal: (url: string | undefined) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onError(undefined);
    onReveal(undefined);
    if (!selectedEvent?.geocode) {
      map.closePopup();
      return;
    }
    const selectedUrl = selectedEvent.url;
    const marker = markerRefs.current.get(selectedUrl);
    if (!marker) {
      map.closePopup();
      onError("Could not find this event on the map. Use its official listing beside search.");
      return;
    }
    let cancelled = false;
    const open = () => {
      if (!cancelled && markerRefs.current.get(selectedUrl) === marker) {
        onReveal(selectedUrl);
      }
    };
    try {
      const cluster = clusterRef.current;
      if (cluster) cluster.zoomToShowLayer(marker, open);
      else {
        map.setView(marker.getLatLng(), 17);
        open();
      }
    } catch (error) {
      console.error("Could not open the selected event on the map.", error);
      onError("Could not open this event on the map. Use its official listing beside search.");
    }
    return () => { cancelled = true; };
  }, [selectedEvent, markerRefs, clusterRef, map, onError, onReveal]);
  return null;
}

export default function EventMap({
  position, zoom, events, selectedUrl, onSelect, onClose,
}: EventMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const clusterRef = useRef<L.MarkerClusterGroup>(null);
  const [mapError, setMapError] = useState<string>();
  const [revealedUrl, setRevealedUrl] = useState<string>();
  const selectedEvent = events.find((event) => event.url === selectedUrl);

  return (
    <>
      {mapError && <p role="alert" className="p-3 text-red-300">{mapError}</p>}
      <MapContainer
        center={position}
        zoom={zoom}
        scrollWheelZoom
        className="w-full lg:h-dvh h-[80dvh]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterGroup ref={clusterRef} chunkedLoading>
          {events.map((event) => event.geocode === null ? null : (
            <Marker
              key={event.url}
              title={event.title}
              alt={event.title}
              position={event.geocode}
              icon={event.url === selectedUrl ? selectedIcon : normalIcon}
              ref={(marker) => {
                if (marker) markerRefs.current.set(event.url, marker);
                else markerRefs.current.delete(event.url);
              }}
              eventHandlers={{
                click: () => onSelect(event.url),
              }}
            />
          ))}
        </MarkerClusterGroup>
        {/* Marker reparenting during clustering must not dismiss the selected popup. */}
        {selectedEvent?.geocode && revealedUrl === selectedEvent.url && (
          <Popup
            key={selectedEvent.url}
            position={selectedEvent.geocode}
            className="event-popup"
            minWidth={1}
            maxWidth={360}
            autoPanPadding={[12, 12]}
            autoPanPaddingTopLeft={[12, 80]}
            autoPanPaddingBottomRight={[12, 36]}
            eventHandlers={{ remove: () => onClose(selectedEvent.url) }}
          >
            <PopupEventDetails
              event={selectedEvent}
              onDismiss={() => onClose(selectedEvent.url)}
            />
          </Popup>
        )}
        <ResponsivePopups />
        <MapController
          selectedEvent={selectedEvent}
          markerRefs={markerRefs}
          clusterRef={clusterRef}
          onError={setMapError}
          onReveal={setRevealedUrl}
        />
      </MapContainer>
    </>
  );
}
