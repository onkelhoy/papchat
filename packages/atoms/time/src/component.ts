// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, translator, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };
import type { TimeUnit } from "./types";

// one interval shared by every connected pc-time, started by the first and stopped with the last
const TICK_MS = 30_000;
const instances = new Set<Time>();
let timer: ReturnType<typeof setInterval> | undefined;

function register(el: Time) {
    instances.add(el);
    if (timer === undefined)
    {
        timer = setInterval(() => instances.forEach(instance => instance.requestUpdate()), TICK_MS);
    }
}

function unregister(el: Time) {
    instances.delete(el);
    if (instances.size === 0 && timer !== undefined)
    {
        clearInterval(timer);
        timer = undefined;
    }
}

/**
 * Relative time ("5 minutes ago") that keeps itself up to date.
 *
 * Renders a `<time datetime>` formatted with `Intl.RelativeTimeFormat` in the
 * translator's current language, and re-renders when the language changes and
 * every 30 s while connected. Under 45 s it says "just now". Hovering shows the
 * full local date and time.
 *
 * @element pc-time
 *
 * @property {number} at epoch milliseconds
 *
 * @csspart time the inner `<time>` element
 */
export class Time extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-time");

    @property({ type: Number, rerender: true }) at?: number;

    connectedCallback(): void {
        super.connectedCallback();
        register(this);
    }

    disconnectedCallback(): void {
        unregister(this);
        super.disconnectedCallback();
    }

    render() {
        const at = Number(this.at);
        if (this.at === undefined || this.at === null || !Number.isFinite(at) || Number.isNaN(new Date(at).getTime())) return html``;

        const date = new Date(at);
        const locale = translator.locale() ?? undefined;

        return html`<time part="time" datetime="${date.toISOString()}" title="${fullDate(date, locale)}">${relative(at - Date.now(), locale, this.t("now"))}</time>`;
    }
}

// pick the largest unit that fits and round to it; |diff| under 45 s is "just now"
export function relative(diff: number, locale: string | undefined, now: string): string {
    const abs = Math.abs(diff);
    if (abs < 45_000) return now;

    const steps: [TimeUnit, number][] = [
        ["minute", 60_000],
        ["hour", 3_600_000],
        ["day", 86_400_000],
        ["month", 2_592_000_000],
        ["year", 31_536_000_000],
    ];

    let unit: TimeUnit = "minute";
    let size = 60_000;
    for (const [u, s] of steps)
    {
        if (abs >= s) { unit = u; size = s; }
    }

    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diff / size), unit);
}

function fullDate(date: Date, locale: string | undefined): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "medium" }).format(date);
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-time": Time;
    }
}
