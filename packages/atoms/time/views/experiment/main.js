import { translator } from '@papit/translator';
import '@papchat/time';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

translator.add({ id: "en", url: "/en.json" });
translator.change("en");

const offsets = [10 * SECOND, 2 * MINUTE, 45 * MINUTE, 3 * HOUR, DAY, 5 * DAY, 40 * DAY, 400 * DAY];

function fill(id, offsetList) {
    const container = document.getElementById(id);
    for (const offset of offsetList)
    {
        const el = document.createElement("pc-time");
        el.at = Date.now() - offset;
        container.append(el);
    }
}

fill("past", offsets);
fill("created", [3 * MINUTE, 2 * HOUR]);
fill("dark", [5 * MINUTE, DAY]);

document.getElementById("future").at = Date.now() + 2 * HOUR;
document.getElementById("live").at = Date.now();
