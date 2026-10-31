// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/qr-code';

window.onload = () => {
    console.log('[demo]: window loaded');

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");

    document.querySelector("#long").value = `https://onkelhoy.github.io/papchat/#contact=abc&token=${"x".repeat(600)}`;
    document.querySelector("#toolong").value = "x".repeat(3000);

    const code = document.createElement("pc-qr-code");
    code.value = "https://example.com";
    document.querySelector("#created").append(code);
}

