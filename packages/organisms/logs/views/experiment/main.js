// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/logs';

window.onload = () => {
    console.log('[demo]: window loaded');
    const logs = document.querySelector('pc-logs');
    logs.enabled = true;
    logs.lines = [
        { id: 1, at: Date.now() - 2000, text: 'lobby: joining abc {"app":"papchat","kind":"lobby"}' },
        { id: 2, at: Date.now() - 1000, text: 'lobby: link: offering def' },
        { id: 3, at: Date.now(), text: 'lobby: join failed Error: timed out' },
    ];

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

