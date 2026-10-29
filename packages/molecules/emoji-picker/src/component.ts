// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/icon";

// local
import sheet from "./style.css" with { type: "css" };
import { EMOJI_SRC, loadEmoji, searchEmoji } from "./data";
import type { EmojiData, EmojiEntry } from "./data";
import type { EmojiPickEvent } from "./types";

// the category bar: a line icon per group (spritesheet ids)
const GROUP_ICONS: Record<string, string> = {
    recent: "emoji-recent",
    smileys_emotion: "smile",
    people_body: "emoji-people",
    animals_nature: "emoji-animals",
    food_drink: "emoji-food",
    travel_places: "emoji-travel",
    activities: "emoji-activities",
    objects: "emoji-objects",
    symbols: "emoji-symbols",
    flags: "emoji-flags",
};

type Section = { id: string; label: string; emojis: EmojiEntry[] };

/**
 * Native Unicode emoji, grouped by category, with search by name and a recently used group.
 *
 * The data (`asset/emoji/emoji.json`, ~50 kB) is fetched the first time a picker connects and
 * shared by every picker and `loadEmoji()` caller on the page. The grid is built as DOM nodes in
 * `update()`, so ~1900 buttons don't go through the template diff.
 *
 * Arrow keys move between emoji (one tab stop for the whole grid), Home/End jump to the ends,
 * Enter/Space picks. The component only reports the pick; inserting it and keeping the recent
 * list is the host's job.
 *
 * @element pc-emoji-picker
 *
 * @property {string} query filter by name ("smi", "thumbs up"); empty shows the categories
 * @property {string[]} recent recently used emoji, newest first (shown as their own group)
 * @property {number} limit 0 = everything with the category bar; > 0 = one flat row of that many (recent first)
 * @property {string} src where the data lives (default `/emoji/emoji.json`)
 *
 * @fires emoji-pick `CustomEvent<{ emoji: string, name: string }>` an emoji was chosen (bubbles, composed)
 *
 * @csspart nav the category bar
 * @csspart body the scrolling grid
 */
export class EmojiPicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-emoji-picker");

    @property({ type: String, rerender: true }) query: string = "";
    @property({ type: Array, rerender: true }) recent: string[] = [];
    @property({ type: Number, rerender: true }) limit: number = 0;
    @property({ type: String }) src: string = EMOJI_SRC;

    @property({ type: String, attribute: false, rerender: true }) private state: "loading" | "ready" | "error" = "loading";
    // the group at the top of the scrolled list, highlighted in the bar
    @property({ type: String, attribute: false, rerender: true }) private current: string = "";

    private data?: EmojiData;
    // what the grid was last built from, so it's only rebuilt when that changes
    private built = "";

    connectedCallback() {
        super.connectedCallback();
        if (!this.data) this.load();
    }

    private async load() {
        this.state = "loading";
        try
        {
            this.data = await loadEmoji(this.src);
            this.state = "ready";
        }
        catch
        {
            this.state = "error";
        }
    }

    update() {
        super.update();
        this.syncGrid();
        return undefined;
    }

    // ---------------------------------------------------------------- grid

    private sections(): Section[] {
        const data = this.data;
        if (!data) return [];

        const query = this.query.trim();
        if (query) return [{ id: "results", label: this.t("results"), emojis: searchEmoji(data, query, this.limit || Infinity) }];

        const recent = this.recent
            .map(emoji => data.byEmoji[emoji] ?? { emoji, name: emoji, slug: emoji, group: "recent" })
            .filter((entry, i, list) => list.findIndex(e => e.emoji === entry.emoji) === i);

        if (this.limit > 0)
        {
            // one row: what you use, topped up with the first smileys
            const seen = new Set(recent.map(entry => entry.emoji));
            const fill = data.groups[0]?.emojis.filter(entry => !seen.has(entry.emoji)) ?? [];
            return [{ id: "row", label: this.t("label"), emojis: [...recent, ...fill].slice(0, this.limit) }];
        }

        const groups = data.groups.map(group => ({ id: group.id, label: this.t(group.id), emojis: group.emojis }));
        return recent.length ? [{ id: "recent", label: this.t("recent"), emojis: recent }, ...groups] : groups;
    }

    private syncGrid() {
        const body = this.shadowRoot?.querySelector<HTMLElement>("[part='body']");
        if (!body) return;

        const sections = this.sections();
        const key = [this.state, this.query, this.limit, this.recent.join(""), sections.map(s => s.label).join()].join("|");
        if (key === this.built) return;
        this.built = key;

        if (this.state !== "ready")
        {
            body.replaceChildren();
            return;
        }

        const found = sections.some(section => section.emojis.length > 0);
        if (!found)
        {
            const empty = document.createElement("p");
            empty.className = "status";
            empty.textContent = this.t("none");
            body.replaceChildren(empty);
            return;
        }

        const flat = this.limit > 0 || this.query.trim() !== "";
        const fragment = document.createDocumentFragment();
        for (const section of sections)
        {
            if (section.emojis.length === 0) continue;

            const wrap = document.createElement("section");
            wrap.dataset.group = section.id;

            const grid = document.createElement("div");
            grid.className = "grid";
            grid.setAttribute("role", "group");
            grid.setAttribute("aria-label", section.label);

            if (!flat)
            {
                const heading = document.createElement("h3");
                heading.textContent = section.label;
                wrap.append(heading);
            }

            for (const entry of section.emojis)
            {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "emoji";
                button.tabIndex = -1;
                button.dataset.emoji = entry.emoji;
                button.dataset.name = entry.name;
                button.title = entry.name;
                button.setAttribute("aria-label", entry.name);
                button.textContent = entry.emoji;
                grid.append(button);
            }

            wrap.append(grid);
            fragment.append(wrap);
        }

        // one tab stop: the first emoji
        const first = fragment.querySelector<HTMLButtonElement>("button.emoji");
        if (first) first.tabIndex = 0;

        body.replaceChildren(fragment);
        body.scrollTop = 0;
    }

    private buttons(): HTMLButtonElement[] {
        return [...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>("button.emoji") ?? [])];
    }

    private move(from: HTMLButtonElement, to?: HTMLButtonElement) {
        if (!to || to === from) return;
        from.tabIndex = -1;
        to.tabIndex = 0;
        to.focus();
    }

    // the nearest emoji in the row above or below (rows can differ between groups)
    private vertical(from: HTMLButtonElement, down: boolean): HTMLButtonElement | undefined {
        const rect = from.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        let best: HTMLButtonElement | undefined;
        let bestRow = Infinity;
        let bestX = Infinity;

        for (const button of this.buttons())
        {
            const r = button.getBoundingClientRect();
            const row = down ? r.top - rect.top : rect.top - r.top;
            if (row < rect.height / 2) continue;

            const dx = Math.abs(r.left + r.width / 2 - x);
            if (row < bestRow - 1 || (Math.abs(row - bestRow) <= 1 && dx < bestX))
            {
                best = button;
                bestRow = row;
                bestX = dx;
            }
        }
        return best;
    }

    // ---------------------------------------------------------------- handlers

    @bind
    private handleClick(e: Event) {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button.emoji");
        if (!button?.dataset.emoji) return;

        this.dispatchEvent(new CustomEvent<EmojiPickEvent>("emoji-pick", {
            detail: { emoji: button.dataset.emoji, name: button.dataset.name ?? "" },
            bubbles: true,
            composed: true,
        }));
    }

    @bind
    private handleKeydown(e: KeyboardEvent) {
        const from = (e.target as HTMLElement).closest<HTMLButtonElement>("button.emoji");
        if (!from) return;

        const buttons = this.buttons();
        const at = buttons.indexOf(from);
        const rtl = getComputedStyle(this).direction === "rtl";
        let to: HTMLButtonElement | undefined;

        switch (e.key)
        {
            case "ArrowRight": to = buttons[at + (rtl ? -1 : 1)]; break;
            case "ArrowLeft": to = buttons[at + (rtl ? 1 : -1)]; break;
            case "ArrowDown": to = this.vertical(from, true); break;
            case "ArrowUp": to = this.vertical(from, false); break;
            case "Home": to = buttons[0]; break;
            case "End": to = buttons[buttons.length - 1]; break;
            default: return;
        }
        e.preventDefault();
        this.move(from, to);
    }

    @bind
    private handleNav(e: Event) {
        const id = (e.currentTarget as HTMLElement).dataset.group;
        const body = this.shadowRoot?.querySelector<HTMLElement>("[part='body']");
        const section = body?.querySelector<HTMLElement>(`section[data-group="${id}"]`);
        if (!body || !section || !id) return;

        // scroll only the list (scrollIntoView would scroll every scrolling ancestor, the page too)
        body.scrollTop = section.offsetTop;
        this.current = id;
    }

    @bind
    private handleScroll(e: Event) {
        const body = e.currentTarget as HTMLElement;
        let current = "";
        for (const section of body.querySelectorAll<HTMLElement>("section[data-group]"))
        {
            if (section.offsetTop > body.scrollTop + 8) break;
            current = section.dataset.group ?? "";
        }
        if (current !== this.current) this.current = current;
    }

    @bind
    private handleRetry() {
        this.load();
    }

    // ---------------------------------------------------------------- render

    private renderNav() {
        const ids = [...(this.recent.length ? ["recent"] : []), ...(this.data?.groups.map(group => group.id) ?? [])];

        return html`<nav part="nav" class="nav" aria-label="${this.t("categories")}">
            ${ids.map(id => html`
                <button type="button" data-group="${id}" aria-label="${this.t(id)}" title="${this.t(id)}" aria-current="${(this.current || ids[0]) === id ? "true" : ""}" @click="${this.handleNav}">
                    <pap-icon name="${`/icons/spritesheet.svg#${GROUP_ICONS[id] ?? "smile"}`}" aria-hidden="true"></pap-icon>
                </button>
            `)}
        </nav>`;
    }

    render() {
        const flat = this.limit > 0 || this.query.trim() !== "";
        const ready = this.state === "ready";

        return html`
            <p class="status" role="status" hidden="${this.state === "loading" ? "" : "hidden"}">${this.t("loading")}</p>
            ${this.state === "error" ? html`<p class="status">${this.t("error")} <button type="button" class="retry" @click="${this.handleRetry}">${this.t("retry")}</button></p>` : ""}
            <div part="body" class="${flat ? "body flat" : "body"}" @click="${this.handleClick}" @keydown="${this.handleKeydown}" @scroll="${this.handleScroll}"></div>
            ${ready && !flat ? this.renderNav() : ""}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-emoji-picker": EmojiPicker;
    }
}
