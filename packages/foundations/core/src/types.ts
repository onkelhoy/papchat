// shared papchat types: components `import type` these, core implements them

export type Status = "available" | "busy" | "away" | "dnd";
export type Presence = Status | "offline";

export type Profile = {
    v: 2;
    // a hash of `key`, see keys.ts
    uid: string;
    // the device's public key, base64url
    key: string;
    name: string;
    color: string;
    status: Status;
};

/** Mic noise reduction: off, RNNoise ("standard") or GTCRN ("strong"). */
export type NoiseReduction = "off" | "standard" | "strong";

export type Prefs = {
    v: 1;
    ringtone: string;
    // the caller's tone while it rings: a `dialtones.json` id, `SYNTH_DIAL` for the built-in beep, "" = the first file
    dialtone: string;
    noiseReduction: NoiseReduction;
    volume: number;
    language: string;
    autoDeclineBusy: boolean;
    notifications: boolean;
    // asked once whether to turn them on: a refresh doesn't ask again
    notificationsAsked: boolean;
    // when the name or colour last changed: your linked devices keep the newest
    profileAt: number;
    devices: { mic?: string; camera?: string; speaker?: string };
    sidebarOpen: boolean;
    // emoji picked in the composer, newest first (at most 24)
    recentEmoji: string[];
    // keep chats on this device (history.ts)
    saveChats: boolean;
};

/** A private network: its own lobby, found by name and locked with the password. `null` = the public papchat lobby. */
export type Network = {
    name: string;
    password: string;
    // creating it: ask everyone in it not to save chats
    nosave?: boolean;
};

/** One network on the signal server, for the network list. `name` is "" for the public one. */
export type NetworkEntry = {
    name: string;
    members: number;
    locked: boolean;
    // its creator asked everyone not to save chats
    nosave?: boolean;
};

/** Someone who can be rung with nobody online. `token` is their push token (push.ts). */
export type Contact = {
    uid: string;
    name: string;
    color: string;
    token: string;
    // last time they told us
    at: number;
};

/** Two devices that are one person: each signed `a`, `b` and `at`. `a` sorts before `b`. */
export type DeviceLink = {
    a: string;
    b: string;
    at: number;
    sa: string;
    sb: string;
};

/** A device taken out of an account, signed by `by`, a device of that account. */
export type DeviceRemoval = {
    key: string;
    by: string;
    at: number;
    sig: string;
};

export type AccountData = {
    links: DeviceLink[];
    removed: DeviceRemoval[];
};

/** One of your devices, for the list in settings. */
export type LinkedDevice = {
    uid: string;
    key: string;
    // what it said it was when it linked, "" when unknown
    label: string;
    self: boolean;
};

/** What a caller pushes to a closed app. `key` is the room's password; the rest proves who called. */
export type CallPush = {
    t: "call";
    id: string;
    key: string;
    kind: "call" | "video";
    direct: boolean;
    from: string;
    name: string;
    at: number;
    pub: string;
    sig: string;
};

/** A `CallPush` as a notification hands it to the page. */
export type Ring = Omit<CallPush, "t">;

/** The caller stopped: the notification becomes a missed call. */
export type CancelPush = {
    t: "cancel";
    id: string;
    from: string;
    name: string;
};

export type PushRecord = {
    token: string;
    endpoint: string;
};

export type Debug = {
    signal?: string;
    log?: boolean;
};

export type SessionRoom = {
    id: string;
    password?: string;
    kind: RoomKind;
};

export type Session = {
    rooms: SessionRoom[];
};

export type LobbyStatus = "idle" | "connecting" | "waking" | "connected" | "reconnecting" | "closed";

export type RoomKind = "chat" | "call" | "video" | "stage";
export type RoomStatus = "connecting" | "connected" | "reconnecting" | "closed";
export type InviteKind = RoomKind;
export type DeclineReason = "declined" | "busy" | "dnd" | "timeout";

export type Invite = {
    room: string;
    password?: string;
    kind: InviteKind;
    title: string;
    from: string;
    members: string[];
    // the room is the sender's 1:1 with you: you keep one 1:1 per person, so a second one gets merged
    direct?: boolean;
    // came as a push, not over the lobby: rings for longer, and the caller can't be told no
    offline?: boolean;
    // the caller's name when they aren't in the lobby
    name?: string;
};

export type IncomingCall = {
    id: string;
    from: Profile;
    kind: InviteKind;
    title: string;
    at: number;
};

/** Where one of your messages got to: `failed` shows as "not sent" and goes out again when someone's back. */
export type MessageState = "sending" | "sent" | "failed";

export type ChatMessage = {
    id: string;
    uid: string;
    at: number;
    variant: "text" | "system" | "file" | "gif";
    // a gif message carries its URL here too, so older clients still show a link
    text: string;
    fid?: string;
    gif?: Gif;
    // only on your own messages
    state?: MessageState;
};

/** Someone in a saved conversation, as they were last seen. */
export type ConversationMember = {
    uid: string;
    name: string;
    color: string;
};

/** A chat kept on this device (history.ts). It belongs to people, and outlives its rooms. */
export type Conversation = {
    id: string;
    // the other person of a 1:1, null for a group
    direct: string | null;
    title: string;
    members: ConversationMember[];
    // last message
    at: number;
};

/** A GIPHY GIF, shown straight from GIPHY's CDN. `title` is the alt text. */
export type Gif = {
    id: string;
    url: string;
    width: number;
    height: number;
    title: string;
};

export type FileInfo = {
    fid: string;
    name: string;
    size: number;
    type: string;
    uid: string;
    at: number;
};

export type TransferState = {
    state: "sending" | "receiving" | "done" | "cancelled" | "failed";
    progress: number;
    url?: string;
};

export type FileEntry = FileInfo & TransferState;

export type RoomSummary = {
    id: string;
    kind: RoomKind | "global";
    title: string;
    participants: Profile[];
    unread: number;
    incall: boolean;
    live: boolean;
    // something new, with no count: global chat
    dot?: boolean;
    // the saved conversation this room writes to
    conversation?: string;
    // a saved conversation with no room: `id` is the conversation's
    saved?: boolean;
};

export type StageSummary = {
    id: string;
    title: string;
    presenter: Profile;
    viewers: number;
    mine: boolean;
};

export type ToastKind = "info" | "success" | "warning" | "error";

export type Toast = {
    id: string;
    kind: ToastKind;
    text: string;
    action?: string;
    duration?: number;
    onAction?: () => void;
};
