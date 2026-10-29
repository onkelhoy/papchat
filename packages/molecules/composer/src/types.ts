import type { Gif } from "@papchat/core";

export type SendEvent = { text: string };
export type FilesEvent = { files: File[] };
export type EmojiEvent = { emoji: string };
export type GifState = { items: Gif[]; loading: boolean };
export type GifSearchEvent = { query: string };
export type GifEvent = { gif: Gif };
