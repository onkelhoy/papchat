/** Detail of `scan`: what the code says. */
export type ScanEvent = { text: string };

/** Detail of `camera-error`. */
export type CameraErrorEvent = { reason: "denied" | "missing" | "failed" };
