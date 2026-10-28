export type MessageVariant = "text" | "system";

// a piece of message text: plain string or a link
export type MessagePart = { text: string; href?: string };
