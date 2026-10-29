// Writes asset/emoji/emoji.json from unicode-emoji-json (names, groups) and emojilib (search keywords),
// both MIT: the picker fetches it the first time it opens.
// Run with `npm run emoji` after bumping unicode-emoji-json. The output is committed.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const groups = require("unicode-emoji-json/data-by-group.json");
// { "😀": ["grinning_face", "face", "smile", "happy", …] }
const keywords = require("emojilib");

// newer emoji show as tofu on older phones and desktops
const MAX_VERSION = 15.1;

function extra(entry) {
    const words = new Set(entry.name.toLowerCase().split(/\s+/));
    const list = (keywords[entry.emoji] ?? keywords[entry.emoji.replace(/\uFE0F/g, "")] ?? [])
        .map(word => word.replace(/_/g, " ").toLowerCase())
        .filter(word => !words.has(word) && word !== entry.name.toLowerCase());
    return [...new Set(list)].join(" ");
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "asset", "emoji");
mkdirSync(out, { recursive: true });

// { v, groups: [{ id, emojis: [[emoji, name, keywords]] }] }, as small as it can be;
// keywords are space separated, without the ones the name already has
const data = {
    v: 1,
    groups: groups.map(group => ({
        id: group.slug,
        emojis: group.emojis
            .filter(e => parseFloat(e.emoji_version) <= MAX_VERSION)
            .map(e => [e.emoji, e.name, extra(e)]),
    })),
};

writeFileSync(join(out, "emoji.json"), JSON.stringify(data));
copyFileSync(require.resolve("unicode-emoji-json/LICENSE"), join(out, "LICENSE"));
copyFileSync(join(dirname(require.resolve("emojilib")), "..", "LICENSE"), join(out, "LICENSE-emojilib"));

const count = data.groups.reduce((sum, group) => sum + group.emojis.length, 0);
console.log(`emoji.json: ${count} emoji in ${data.groups.length} groups`);
