// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";

// local
import sheet from "./style.css" with { type: "css" };
import type { LogRow } from "./types";

// this close to the end counts as reading the newest lines
const FOLLOW_PX = 40;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

function clock(at: number): string {
    const time = new Date(at);
    return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`;
}

/**
 * The logs page: asks to turn logging on, then lists what's logged and follows the newest line unless
 * you've scrolled up. It holds no logic of its own, the page passes `lines` in.
 *
 * @element pc-logs
 *
 * @property {boolean} enabled logging is on
 * @property {LogRow[]} lines what's been logged, oldest first (property only)
 *
 * @fires logs-enable "Turn on logs" was pressed (bubbles, composed)
 * @fires logs-disable "Turn off" was pressed (bubbles, composed)
 * @fires logs-copy "Copy" was pressed (bubbles, composed)
 * @fires logs-close "Close" was pressed (bubbles, composed)
 */
export class Logs extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-logs");

    @property({ type: Boolean, reflect: true, rerender: true }) enabled: boolean = false;
    @property({
        type: Array,
        attribute: false,
        rerender: true,
        after(this: Logs) {
            if (this.following) requestAnimationFrame(() => this.toEnd());
        },
    }) lines: LogRow[] = [];

    @query("ol") private list?: HTMLElement;

    private following = true;

    private toEnd() {
        if (this.list) this.list.scrollTop = this.list.scrollHeight;
    }

    @bind
    private handleScroll() {
        const list = this.list;
        if (list) this.following = list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_PX;
    }

    private emit(name: string) {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <section>
                <header>
                    <h2>${this.t("title")}</h2>
                    <div class="actions">
                        ${this.enabled ? html`
                            <span class="tools">
                                <pap-button size="small" variant="clear" @click="${() => this.emit("logs-copy")}">${this.t("copy")}</pap-button>
                                <pap-button size="small" variant="clear" @click="${() => this.emit("logs-disable")}">${this.t("off")}</pap-button>
                            </span>
                        ` : ""}
                        <pap-button size="small" variant="clear" @click="${() => this.emit("logs-close")}">${this.t("close")}</pap-button>
                    </div>
                </header>

                ${this.enabled ? html`<p class="hint">${this.t("hint")}</p>` : ""}
                ${this.enabled ? "" : html`
                    <div class="intro">
                        <p>${this.t("intro")}</p>
                        <pap-button @click="${() => this.emit("logs-enable")}">${this.t("on")}</pap-button>
                    </div>
                `}

                <ol tabindex="0" aria-label="${this.t("title")}" @scroll="${this.handleScroll}">
                    ${this.lines.map(line => html`
                        <li key="${line.id}"><time>${clock(line.at)}</time><span>${line.text}</span></li>
                    `)}
                </ol>
            </section>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-logs": Logs;
    }
}
