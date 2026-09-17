"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, CircleMarker } from "react-leaflet";
import { ArrowPathIcon, ViewfinderCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import L from "leaflet";
import { LocationDataError, locationErrorMessage, readLocation, type MapViewportRequest, type UserLocation } from "@/lib/location";

export default function MapLocationControl({ location, selectedUrl, onViewportRequest }: {
  location?: UserLocation;
  selectedUrl?: string;
  onViewportRequest: (request: MapViewportRequest) => void;
}) {
  const controls = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const locating = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const cancel = useCallback(() => {
    requestId.current++;
    locating.current = false;
    setPending(false);
    setNotice(undefined);
  }, []);

  useEffect(() => {
    const element = controls.current;
    const requests = requestId;
    if (element) {
      L.DomEvent.disableClickPropagation(element);
      L.DomEvent.disableScrollPropagation(element);
    }
    return () => {
      requests.current++;
      if (element) L.DomEvent.off(element);
    };
  }, []);
  useEffect(() => {
    if (locating.current) cancel();
    else if (selectedUrl) setNotice(undefined);
  }, [selectedUrl, cancel]);

  const locate = () => {
    const id = ++requestId.current;
    setNotice(undefined);
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
      setNotice({ error: true, text: "Location is unavailable in this browser. Search by town or venue instead." });
      return;
    }
    locating.current = true;
    setPending(true);
    try {
      navigator.geolocation.getCurrentPosition((position) => {
        if (id !== requestId.current) return;
        locating.current = false;
        setPending(false);
        let next: UserLocation;
        try {
          next = readLocation(position.coords);
        } catch (error) {
          if (!(error instanceof LocationDataError)) throw error;
          console.error(error.message);
          setNotice({ error: true, text: "Your location could not be used. Try again or search by town instead." });
          return;
        }
        onViewportRequest({ location: next });
        setNotice({ error: false, text: `Map centred near your location. Accuracy about ${Math.max(1, Math.round(next.accuracy)).toLocaleString("en-IE")} m. Filters still apply.` });
      }, (error) => {
        if (id !== requestId.current) return;
        locating.current = false;
        console.warn("Could not find the user's location.", { code: error.code });
        setPending(false);
        setNotice({ error: true, text: locationErrorMessage(error.code) });
      }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      console.warn("Browser location access failed.", { name: error.name });
      locating.current = false;
      setPending(false);
      setNotice({ error: true, text: error.name === "SecurityError" ? locationErrorMessage(1) : locationErrorMessage(2) });
    }
  };

  return (
    <>
      <div ref={controls} className="map-location-controls">
        <div className="map-location-actions">
          <button type="button" className="near-me-button" aria-label="Near me"
            title="Use your location once to centre this map" aria-busy={pending} disabled={pending}
            onClick={(event) => { event.stopPropagation(); locate(); }}>
            {pending ? <ArrowPathIcon aria-hidden="true" className="motion-safe:animate-spin" /> : <ViewfinderCircleIcon aria-hidden="true" />}
            {pending ? "Finding..." : "Near me"}
          </button>
          {(pending || location) && <button type="button" className="icon-button location-reset"
            aria-label={pending ? "Cancel location lookup" : "Clear location and show all results"}
            title={pending ? "Cancel location lookup" : "Clear location and show all results"}
            onClick={(event) => { event.stopPropagation(); cancel(); if (location) onViewportRequest({}); }}><XMarkIcon aria-hidden="true" /></button>}
        </div>
        {notice && <div className="map-location-message">
          <p role={notice.error ? "alert" : "status"}>{notice.text}</p>
          <button type="button" className="icon-button" aria-label="Dismiss location message"
            onClick={(event) => { event.stopPropagation(); setNotice(undefined); }}><XMarkIcon aria-hidden="true" /></button>
        </div>}
      </div>
      {location && <>
        <Circle center={location} radius={location.accuracy} interactive={false} className="location-accuracy"
          pathOptions={{ color: "#85c4ff", weight: 1, fillOpacity: 0.08 }} />
        <CircleMarker center={location} radius={7} interactive={false} className="user-location"
          pathOptions={{ color: "#ffffff", fillColor: "#65b9ff", fillOpacity: 1, weight: 2 }} />
      </>}
    </>
  );
}
