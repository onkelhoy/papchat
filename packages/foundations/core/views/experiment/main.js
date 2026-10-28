// core has no UI: open the console and use `papchat` (papchat.state.prefs(), papchat.setLogging(true), …)
import '@papchat/core';

const out = document.querySelector("pre");
out.textContent = JSON.stringify({
    signal: window.papchat.signalUrl(),
    prefs: window.papchat.state.prefs(),
    me: window.papchat.state.me(),
}, null, 4);
