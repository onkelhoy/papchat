import "@papit/codeblock";
import '@papchat/composer';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
const lines = [];
function write(text)
{
    lines.unshift(text);
    log.textContent = lines.slice(0, 5).join("\n");
}

document.addEventListener("send", (e) => write(`send → ${JSON.stringify(e.detail.text)}`));
document.addEventListener("typing", () => write("typing"));
document.addEventListener("emoji", (e) => write(`emoji → ${e.detail.emoji}`));
document.addEventListener("files", (e) => write(`files → ${e.detail.files.map(f => f.name).join(", ")}`));

const created = document.createElement("pc-composer");
created.placeholder = "Created with createElement";
document.getElementById("created").append(created);

// the host keeps the recent list (the app stores it in prefs)
const recent = ["🎉", "👍"];
document.querySelectorAll("pc-composer").forEach(composer => { composer.recent = recent; });
document.addEventListener("emoji", (e) =>
{
    const next = [e.detail.emoji, ...recent.filter(other => other !== e.detail.emoji)].slice(0, 24);
    recent.splice(0, recent.length, ...next);
    document.querySelectorAll("pc-composer").forEach(composer => { composer.recent = [...recent]; });
});

// GIFs: the composer asks with gif-search, the host (the app's page, here the demo) asks GIPHY.
// Same browser key as @papchat/core's GIPHY_KEY.
const GIPHY_KEY = "c3UrFheIWGdoGysWX6NHR8DceD5pEc8W";
let gifRequest = 0;
document.querySelectorAll("pc-composer").forEach(composer => { composer.gifs = { items: [], loading: false }; });
document.addEventListener("gif-search", async (e) =>
{
    const composer = e.target;
    const query = e.detail.query;
    const request = ++gifRequest;
    composer.gifs = { items: composer.gifs?.items ?? [], loading: true };
    const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: "24", rating: "pg-13" });
    if (query) params.set("q", query);
    let items = [];
    try
    {
        const json = await (await fetch(`https://api.giphy.com/v1/gifs/${query ? "search" : "trending"}?${params}`)).json();
        items = (json.data ?? []).map(gif => ({ id: gif.id, url: gif.images.fixed_width.webp || gif.images.fixed_width.url, width: Number(gif.images.fixed_width.width), height: Number(gif.images.fixed_width.height), title: gif.title }));
    }
    catch (error)
    {
        write(`gif-search failed: ${error}`);
    }
    if (request === gifRequest) composer.gifs = { items, loading: false };
    write(`gif-search → ${JSON.stringify(query)} (${items.length})`);
});
document.addEventListener("gif", (e) => write(`gif → ${e.detail.gif.title}`));
