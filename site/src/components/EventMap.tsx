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
import type { ShortlistControls } from "./SaveEventButton";

type EventMapProps = {
  position: Geocode;
  zoom: number;
  events: CultureNightEvent[];
  selectedUrl?: string;
  onSelect: (url: string) => void;
  onClose: (url: string) => void;
  shortlist?: ShortlistControls;
};

function createIcon(selected: boolean) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'>
    <circle cx='22' cy='22' r='19' fill='${selected ? "#ffffff" : "#c6f1a1"}' stroke='${selected ? "#c6f1a1" : "#141414"}' stroke-width='3'/>
    <path d='M22 12a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7z' fill='none' stroke='#172113' stroke-width='1.8'/>
    <circle cx='22' cy='19' r='2' fill='#172113'/>
  </svg>`;
  return new L.Icon({
    iconUrl: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -18],
  });
}
const normalIcon = createIcon(false);
const selectedIcon = createIcon(true);
const clusterIcon = (cluster: L.MarkerCluster) => L.divIcon({
  html: `<span aria-label="${cluster.getChildCount()} events. Zoom in.">${cluster.getChildCount()}</span>`,
  className: "event-cluster",
  iconSize: [44, 44],
});

function FitResults({ events, selectedUrl }: Pick<EventMapProps, "events" | "selectedUrl">) {
  const map = useMap();
  const fittedEvents = useRef<CultureNightEvent[] | null>(null);
  useEffect(() => {
    if (selectedUrl || fittedEvents.current === events) return;
    const container = map.getContainer();
    const points = events.flatMap((event) => event.geocode ? [L.latLng(event.geocode)] : []);
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!container.clientWidth || !container.clientHeight || fittedEvents.current === events) return;
        map.invalidateSize({ pan: false });
        if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [44, 56], maxZoom: 14, animate: false });
        fittedEvents.current = events;
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [events, selectedUrl, map]);
  return null;
}

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
        const width = Math.min(340, container.clientWidth - 24, (viewport?.width ?? innerWidth) - 24);
        // Reserve room for the zoom controls, popup tip and map attribution.
        const height = Math.min(440, Math.min(container.clientHeight, viewport?.height ?? innerHeight) - 160);
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
      onError("Could not find this event on the map. Switch to List for its official listing.");
      return;
    }
    let cancelled = false;
    const open = () => {
      if (!cancelled && markerRefs.current.get(selectedUrl) === marker) {
        onReveal(selectedUrl);
      }
    };
    try {
      // List selection makes a previously hidden phone map visible in this render.
      map.invalidateSize({ pan: false });
      const cluster = clusterRef.current;
      if (cluster) cluster.zoomToShowLayer(marker, open);
      else {
        map.setView(marker.getLatLng(), 17);
        open();
      }
    } catch (error) {
      console.error("Could not open the selected event on the map.", error);
      onError("Could not open this event on the map. Switch to List for its official listing.");
    }
    return () => { cancelled = true; };
  }, [selectedEvent, markerRefs, clusterRef, map, onError, onReveal]);
  return null;
}

export default function EventMap({
  position, zoom, events, selectedUrl, onSelect, onClose, shortlist,
}: EventMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const clusterRef = useRef<L.MarkerClusterGroup>(null);
  const [mapError, setMapError] = useState<string>();
  const [revealedUrl, setRevealedUrl] = useState<string>();
  const selectedEvent = events.find((event) => event.url === selectedUrl);

  return (
    <>
      {mapError && <p role="alert" className="map-error">{mapError}</p>}
      <MapContainer
        center={position}
        zoom={zoom}
        zoomSnap={0.25}
        scrollWheelZoom
        className="event-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="night-tiles"
        />
        <MarkerClusterGroup ref={clusterRef} chunkedLoading iconCreateFunction={clusterIcon}>
          {events.map((event) => event.geocode === null ? null : (
            <Marker
              key={event.url}
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
            maxWidth={340}
            autoPanPadding={[12, 12]}
            autoPanPaddingTopLeft={[12, 108]}
            autoPanPaddingBottomRight={[12, 36]}
            eventHandlers={{ remove: () => onClose(selectedEvent.url) }}
          >
            <PopupEventDetails
              event={selectedEvent}
              onDismiss={() => onClose(selectedEvent.url)}
              shortlist={shortlist}
            />
          </Popup>
        )}
        <ResponsivePopups />
        <FitResults events={events} selectedUrl={selectedUrl} />
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
