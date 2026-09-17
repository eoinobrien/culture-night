import { SignalSlashIcon } from "@heroicons/react/24/outline";

export default function OfflineIndicator({ offline, ready }: { offline: boolean; ready: boolean }) {
  if (!offline) return null;
  const description = ready
    ? "Offline. Using saved event data. Maps and external links need internet."
    : "Offline. Keep this page open; the event data has not been saved completely.";
  return (
    <span className="offline-indicator" role="status" aria-label={description} title={description}>
      <SignalSlashIcon aria-hidden="true" />
      Offline
    </span>
  );
}
