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
import MapLocationControl from "./MapLocationControl";
import type { MapViewportRequest } from "@/lib/location";

type EventMapProps = {
  position: Geocode;
  zoom: number;
  events: CultureNightEvent[];
  selectedUrl?: string;
  onSelect: (url: string) => void;
  onClose: (url: string) => void;
  shortlist?: ShortlistControls;
  getEventLink?: (event: CultureNightEvent) => string;
  offline?: boolean;
  onShowList?: () => void;
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

function VisibleMapTiles({ offline, onFailure }: { offline: boolean; onFailure: (failed: boolean) => void }) {
  const map = useMap();
  const [visible, setVisible] = useState(false);
  const failed = useRef(false);
  useEffect(() => {
    const container = map.getContainer();
    const update = () => setVisible(container.clientWidth > 0 && container.clientHeight > 0);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    return () => observer.disconnect();
  }, [map]);

  return visible && !offline ? (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      className="night-tiles"
      updateWhenIdle
      updateWhenZooming={false}
      eventHandlers={{
        tileerror: () => {
          if (!failed.current) console.warn("Some map tiles could not load. Event details remain available in the list.");
          failed.current = true;
          onFailure(true);
        },
        load: (event) => {
          const layer: L.TileLayer = event.target;
          const images = layer.getContainer()?.querySelectorAll("img");
          const missing = Boolean(images && Array.from(images).some((image) => image.complete && image.naturalWidth === 0));
          failed.current = missing;
          onFailure(missing);
        },
      }}
    />
  ) : null;
}

function FitResults({ events, selectedUrl, viewportRequest }: Pick<EventMapProps, "events" | "selectedUrl"> & {
  viewportRequest?: MapViewportRequest;
}) {
  const map = useMap();
  const fittedEvents = useRef<CultureNightEvent[] | null>(null);
  const handledRequest = useRef<MapViewportRequest | undefined>(undefined);
  useEffect(() => {
    const requested = viewportRequest !== undefined && viewportRequest !== handledRequest.current;
    if (!requested && (selectedUrl || fittedEvents.current === events)) return;
    if (requested) handledRequest.current = viewportRequest;
    const container = map.getContainer();
    const points = events.flatMap((event) => event.geocode ? [L.latLng(event.geocode)] : []);
    const debounce = !requested && fittedEvents.current !== null;
    let ready = !debounce;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fitted = false;
    let cancelled = false;
    const fit = () => {
      if (!ready || cancelled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!container.clientWidth || !container.clientHeight || fitted || cancelled) return;
        fitted = true;
        map.invalidateSize({ pan: false });
        if (requested && viewportRequest.location) {
          const location = viewportRequest.location;
          map.fitBounds(L.latLng(location).toBounds(Math.max(1_000, location.accuracy * 2)), {
            padding: [44, 56], maxZoom: 14, animate: false,
          });
        } else if (points.length) {
          map.fitBounds(L.latLngBounds(points), { padding: [44, 56], maxZoom: 14, animate: false });
        }
        fittedEvents.current = events;
      });
    };
    const cancelPendingFit = () => {
      if (fitted) return;
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    if (debounce) {
      map.on("movestart", cancelPendingFit);
      timer = setTimeout(() => { ready = true; fit(); }, 300);
    } else {
      fit();
    }
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off("movestart", cancelPendingFit);
    };
  }, [events, selectedUrl, map, viewportRequest]);
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
    const container = map.getContainer();
    let started = false;
    const reveal = () => {
      if (started || !container.clientWidth || !container.clientHeight) return;
      started = true;
      try {
        // A restored List view may keep the selected event's phone map hidden.
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
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    reveal();
    return () => { cancelled = true; observer.disconnect(); };
  }, [selectedEvent, markerRefs, clusterRef, map, onError, onReveal]);
  return null;
}

export default function EventMap({
  position, zoom, events, selectedUrl, onSelect, onClose, shortlist, getEventLink, offline = false, onShowList,
}: EventMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const clusterRef = useRef<L.MarkerClusterGroup>(null);
  const [mapError, setMapError] = useState<string>();
  const [revealedUrl, setRevealedUrl] = useState<string>();
  const [viewportRequest, setViewportRequest] = useState<MapViewportRequest>();
  const [tilesFailed, setTilesFailed] = useState(false);
  const selectedEvent = events.find((event) => event.url === selectedUrl);

  return (
    <>
      {mapError && <p role="alert" className="map-error">{mapError}</p>}
      {(offline || tilesFailed) && <div className="map-connectivity">
        <p role="status">{offline ? "Map tiles need internet." : "Map tiles could not load."} Event details still work.</p>
        {onShowList && <button type="button" className="text-button" onClick={onShowList}>Read event details in List</button>}
      </div>}
      <MapContainer
        center={position}
        zoom={zoom}
        // Clustering needs the existing tile zoom limit even while tiles are hidden.
        maxZoom={18}
        zoomSnap={0.25}
        scrollWheelZoom
        className="event-map"
      >
        <VisibleMapTiles offline={offline} onFailure={setTilesFailed} />
        {/* Delayed cluster animations or marker batches can remove freshly filtered pins. */}
        <MarkerClusterGroup ref={clusterRef} animate={false} chunkedLoading={false} iconCreateFunction={clusterIcon}>
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
              getEventLink={getEventLink}
              offline={offline}
              focusOnOpen={!offline}
            />
          </Popup>
        )}
        <ResponsivePopups />
        <FitResults events={events} selectedUrl={selectedUrl} viewportRequest={viewportRequest} />
        <MapLocationControl location={viewportRequest?.location} selectedUrl={selectedUrl}
          onViewportRequest={(request) => {
            if (selectedUrl) onClose(selectedUrl);
            setViewportRequest(request);
          }} />
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
