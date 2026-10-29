// Writes asset/emoji/emoji.json from unicode-emoji-json (MIT): the picker fetches it the first time it opens.
// Run with `npm run emoji` after bumping unicode-emoji-json. The output is committed.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const groups = require("unicode-emoji-json/data-by-group.json");

// newer emoji show as tofu on older phones and desktops
const MAX_VERSION = 15.1;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "asset", "emoji");
mkdirSync(out, { recursive: true });

// { v, groups: [{ id, emojis: [[emoji, name]] }] }, as small as it can be
const data = {
    v: 1,
    groups: groups.map(group => ({
        id: group.slug,
        emojis: group.emojis
            .filter(e => parseFloat(e.emoji_version) <= MAX_VERSION)
            .map(e => [e.emoji, e.name]),
    })),
};

writeFileSync(join(out, "emoji.json"), JSON.stringify(data));
copyFileSync(require.resolve("unicode-emoji-json/LICENSE"), join(out, "LICENSE"));

const count = data.groups.reduce((sum, group) => sum + group.emojis.length, 0);
console.log(`emoji.json: ${count} emoji in ${data.groups.length} groups`);
