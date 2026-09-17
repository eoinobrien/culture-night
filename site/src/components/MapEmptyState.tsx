import { MapIcon } from "@heroicons/react/24/outline";

export default function MapEmptyState({
  myNight, hasUnmappedEvents, timeError, onClear, onReset, onBrowse, onShowList, shared = false,
}: {
  myNight: boolean;
  shared?: boolean;
  hasUnmappedEvents: boolean;
  timeError?: string;
  onClear: () => void;
  onReset: () => void;
  onBrowse: () => void;
  onShowList: () => void;
}) {
  return (
    <section className="map-empty" aria-label="No map results">
      <div className="map-empty-content">
        <MapIcon aria-hidden="true" />
        <h2>
          {hasUnmappedEvents ? "No map locations available" : shared ? "No shared events available" : myNight ? "No saved events yet" : timeError ? "Check your availability" : "No matching events"}
        </h2>
        <p>
          {hasUnmappedEvents ? "Use the list to see your events and their available details."
            : shared ? "This link has no available events in the current programme. Your My Night has not been changed."
            : myNight ? "Save events from the list or map to build My Night."
              : timeError || "Try another event, place or venue, or change your filters."}
        </p>
        <div className="map-empty-actions">
          {hasUnmappedEvents ? (
            <button type="button" className="primary-button" onClick={onShowList}>View list</button>
          ) : myNight || shared ? (
            <button type="button" className="primary-button" onClick={onBrowse}>Browse events</button>
          ) : (
            <>
              <button type="button" className="primary-button" onClick={onClear}>Clear search</button>
              <button type="button" className="text-button" onClick={onReset}>Reset filters</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
