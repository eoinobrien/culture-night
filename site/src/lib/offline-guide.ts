export type OfflineStatus = {
  type: "OFFLINE_STATUS";
  version: string;
  ready: boolean;
  completed: number;
  total: number;
  year: number;
  fetchedAt: string;
};

export type OfflineMessage = OfflineStatus | {
  type: "OFFLINE_PROGRESS";
  version: string;
  completed: number;
  total: number;
} | {
  type: "OFFLINE_ERROR";
  version: string;
  message: string;
};

export function isOfflineMessage(value: unknown): value is OfflineMessage {
  if (!value || typeof value !== "object" || !("type" in value) ||
      !("version" in value) || typeof value.version !== "string") return false;
  if (value.type === "OFFLINE_ERROR") {
    return "message" in value && typeof value.message === "string";
  }
  if (value.type !== "OFFLINE_STATUS" && value.type !== "OFFLINE_PROGRESS") return false;
  if (!("completed" in value) || typeof value.completed !== "number" || !Number.isInteger(value.completed) ||
      !("total" in value) || typeof value.total !== "number" || !Number.isInteger(value.total) ||
      value.completed < 0 || value.total < 1 || value.completed > value.total) return false;
  if (value.type === "OFFLINE_PROGRESS") return true;
  return "ready" in value && typeof value.ready === "boolean" &&
    (!value.ready || value.completed === value.total) &&
    "year" in value && typeof value.year === "number" && Number.isInteger(value.year) &&
    "fetchedAt" in value && typeof value.fetchedAt === "string" && Number.isFinite(Date.parse(value.fetchedAt));
}

export function requestOfflineStatus(
  worker: ServiceWorker,
  type: "OFFLINE_STATUS" | "OFFLINE_REPAIR" = "OFFLINE_STATUS",
): Promise<OfflineStatus> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("Offline saving did not respond. Reconnect and try again."));
    }, type === "OFFLINE_REPAIR" ? 180_000 : 10_000);
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      finish();
      if (!isOfflineMessage(data) || data.type === "OFFLINE_PROGRESS") {
        reject(new Error("The offline guide returned an invalid status. Please try again."));
      } else if (data.type === "OFFLINE_ERROR") {
        reject(new Error(data.message));
      } else {
        resolve(data);
      }
    };
    channel.port1.onmessageerror = () => {
      finish();
      reject(new Error("The offline guide status could not be read. Please try again."));
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
