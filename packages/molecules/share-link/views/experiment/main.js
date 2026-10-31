import "@papit/codeblock";
// core
import { translator } from '@papit/translator';

// component
import '@papchat/share-link';

window.onload = () => {
    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");

    const created = document.createElement("pc-share-link");
    created.link = "https://example.com/papchat/#join=team&key=demo";
    document.getElementById("created").append(created);
}

