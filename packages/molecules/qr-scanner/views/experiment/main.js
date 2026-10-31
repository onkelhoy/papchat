// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/qr-scanner';

window.onload = () => {
    console.log('[demo]: window loaded');
    const scanner = document.querySelector('pc-qr-scanner');
    const result = document.querySelector('#result');
    document.querySelector('#toggle').addEventListener('click', () => { scanner.active = !scanner.active; });
    scanner.addEventListener('scan', e => { result.textContent = e.detail.text; scanner.active = false; });
    scanner.addEventListener('camera-error', e => { result.textContent = e.detail.reason; });
    document.querySelector('#made').append(document.createElement('pc-qr-scanner'));

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

