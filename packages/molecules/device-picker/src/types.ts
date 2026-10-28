export type DeviceKind = "audioinput" | "videoinput" | "audiooutput";

export type Device = {
    deviceId: string;
    /** may be empty before media permission was granted */
    label: string;
};

/** `value` is the chosen deviceId, "" = the system default */
export type DeviceChangeEvent = { value: string };
