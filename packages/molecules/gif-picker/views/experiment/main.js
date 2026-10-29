import '@papchat/gif-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

// the component never fetches: these stand in for GIPHY results
const gifs = [
    { id: "1", url: "https://media.giphy.com/media/ICOgUNjpvO0PC/200w.webp", width: 200, height: 150, title: "Happy dance" },
    { id: "2", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.webp", width: 200, height: 200, title: "Thumbs up" },
    { id: "3", url: "https://media.giphy.com/media/26u4cqiYI30juCOGY/200w.webp", width: 200, height: 112, title: "Wow" },
];
document.querySelectorAll(".sample").forEach(picker => { picker.gifs = gifs; });

const created = document.createElement("pc-gif-picker");
created.gifs = gifs.slice(0, 2);
document.getElementById("created").append(created);

document.addEventListener("gif-pick", (e) =>
{
    document.getElementById("log").textContent = `gif-pick → ${e.detail.gif.title}`;
});
