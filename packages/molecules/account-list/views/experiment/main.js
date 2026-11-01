// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/account-list';

window.onload = () => {
    console.log('[demo]: window loaded');
    document.querySelector('pc-account-list').accounts = [
        { slot: '', uid: 'a', name: 'Anna Berg', color: '#2563eb' },
        { slot: 'second', uid: 'b', name: 'Dad', color: '#16a34a' },
    ];
    document.querySelector('pc-account-list').current = 'a';

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

