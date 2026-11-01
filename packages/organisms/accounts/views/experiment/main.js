// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/accounts';

window.onload = () => {
    console.log('[demo]: window loaded');
    const dialog = document.querySelector('pc-accounts');
    dialog.accounts = [
        { slot: '', uid: 'a', name: 'Anna Berg', color: '#2563eb' },
        { slot: 'second', uid: 'b', name: 'Dad', color: '#16a34a' },
    ];
    dialog.current = 'a';
    dialog.open = true;

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

