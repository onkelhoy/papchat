import type { ChatMessage, Profile } from "@papchat/core";

export type { ChatMessage, Profile };

export type SendEvent = { text: string };
export type FilesEvent = { files: File[] };
