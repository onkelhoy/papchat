// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/link-device';

window.onload = () => {
    console.log('[demo]: window loaded');
    const dialog = document.querySelector('pc-link-device');
    const base = { url: 'https://example.com/#link=x&key=y&exp=1', code: '123 456', other: 'Safari on iPhone', done: 12, total: 40 };
    for (const phase of ['starting', 'showing', 'joining', 'confirm', 'waiting', 'syncing', 'done', 'failed'])
    {
        const button = document.createElement('button');
        button.textContent = phase;
        button.addEventListener('click', () => {
            dialog.state = { ...base, phase, reason: 'gone' };
            dialog.open = true;
        });
        document.querySelector('#buttons').append(button);
    }
    dialog.addEventListener('close', () => { dialog.open = false; });
    document.body.append(document.createElement('pc-link-device'));

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

