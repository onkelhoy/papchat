import type { Prefs, Profile, Status } from "@papchat/core";

export type { Prefs, Profile, Status };

export type Tone = { id: string; label: string };
export type Device = { deviceId: string; label: string };

/** device lists, already split by kind */
export type DeviceLists = {
    audioinput: Device[];
    videoinput: Device[];
    audiooutput: Device[];
};

export type ProfileChangeEvent = { partial: Partial<Pick<Profile, "name" | "color" | "status">> };
export type PrefsChangeEvent = { partial: Partial<Prefs> };
export type LanguageChangeEvent = { value: string };
export type PreviewDeviceEvent = { kind: "camera" | "mic" };
