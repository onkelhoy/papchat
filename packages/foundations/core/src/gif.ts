import type { Gif } from "./types";

/** GIPHY browser key: it ships in the page JS anyway (the user OK'd committing it). "" hides the GIFs tab. */
export const GIPHY_KEY = "c3UrFheIWGdoGysWX6NHR8DceD5pEc8W";

/** A gif from the wire, or null: only https images on GIPHY's CDN are ever shown. */
export function cleanGif(value: unknown): Gif | null {
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.url !== "string") return null;

    let url: URL;
    try
    {
        url = new URL(v.url);
    }
    catch
    {
        return null;
    }
    if (url.protocol !== "https:" || !(url.hostname === "giphy.com" || url.hostname.endsWith(".giphy.com"))) return null;

    const size = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 2000) : 200;
    return {
        id: typeof v.id === "string" ? v.id.slice(0, 64) : "",
        url: url.href,
        width: size(v.width),
        height: size(v.height),
        title: typeof v.title === "string" ? v.title.slice(0, 200) : "",
    };
}
