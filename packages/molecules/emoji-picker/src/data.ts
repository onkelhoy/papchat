/** Where the picker fetches its data by default (the package's `asset/emoji/emoji.json`). */
export const EMOJI_SRC = "/emoji/emoji.json";

export type EmojiEntry = {
    emoji: string;
    // the Unicode CLDR name, e.g. "grinning face"
    name: string;
    // the name with underscores, for `:grinning_face` autocomplete
    slug: string;
    // extra search words from emojilib ("smile happy joy"), space separated
    keywords: string;
    group: string;
};

export type EmojiGroup = { id: string; emojis: EmojiEntry[] };

export type EmojiData = {
    groups: EmojiGroup[];
    all: EmojiEntry[];
    // a plain record: api-extractor (the .d.ts bundler) can't follow `Map`
    byEmoji: Record<string, EmojiEntry>;
};

// the file written by `npm run emoji`
type RawData = { v: 1; groups: { id: string; emojis: [string, string, string?][] }[] };

// one fetch per src for the whole page, whoever asks first
const cache = new Map<string, Promise<EmojiData>>();

/** Fetches and indexes the emoji data once; a failed fetch can be retried. */
export function loadEmoji(src: string = EMOJI_SRC): Promise<EmojiData> {
    let pending = cache.get(src);
    if (!pending)
    {
        pending = fetch(src)
            .then(res => {
                if (!res.ok) throw new Error(`emoji data: ${res.status}`);
                return res.json() as Promise<RawData>;
            })
            .then(index);
        pending.catch(() => cache.delete(src));
        cache.set(src, pending);
    }
    return pending;
}

function index(raw: RawData): EmojiData {
    const groups = raw.groups.map(group => ({
        id: group.id,
        emojis: group.emojis.map(([emoji, name, keywords = ""]) => ({ emoji, name, slug: name.replace(/\s+/g, "_"), keywords, group: group.id })),
    }));
    const all = groups.flatMap(group => group.emojis);
    return { groups, all, byEmoji: Object.fromEntries(all.map(entry => [entry.emoji, entry])) };
}

/**
 * Emoji whose name or keywords match `query` ("smile", "thumbs up", "thumbs_up"), best first: names
 * that start with it, then a name word, then a keyword that starts with it, then any substring.
 * Ties keep Unicode's order.
 */
export function searchEmoji(data: EmojiData, query: string, limit: number = Infinity): EmojiEntry[] {
    const q = query.trim().toLowerCase().replace(/_/g, " ");
    if (!q) return [];

    const ranked: EmojiEntry[][] = [[], [], [], []];
    for (const entry of data.all)
    {
        const name = entry.name.toLowerCase();
        const at = name.indexOf(q);
        const keyword = (" " + entry.keywords).indexOf(" " + q);
        if (at === 0) ranked[0].push(entry);
        else if (at > 0 && name[at - 1] === " ") ranked[1].push(entry);
        else if (keyword >= 0) ranked[2].push(entry);
        else if (at > 0 || entry.keywords.includes(q)) ranked[3].push(entry);
    }
    return ranked.flat().slice(0, limit);
}
