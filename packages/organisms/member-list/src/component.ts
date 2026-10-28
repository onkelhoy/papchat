// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/accordion";
import "@papit/group";
import "@papit/input";
import "@papchat/member-item";
import type { MemberItem } from "@papchat/member-item";
import "@papchat/stage-card";
import type { Profile, StageSummary, Status } from "@papchat/core";

// local
import sheet from "./style.css" with { type: "css" };

const ORDER: Status[] = ["available", "busy", "away", "dnd"];

/**
 * Searchable list of the people online. `me` comes first (a `self` row), then the
 * others sorted available → busy → away → dnd, then by name. The search box filters
 * by name on the client. Rows are a `pap-group`, so Tab enters the list once and the
 * arrow keys move between rows.
 *
 * `pc-member-item` already dispatches `member-action` (bubbles, composed), so it
 * passes straight through this component.
 *
 * @element pc-member-list
 *
 * @property {Profile[]} members everyone else online; property only
 * @property {Profile} me        you; property only
 * @property {string[]} incall   uids currently in a call; property only
 * @property {StageSummary[]} stages live broadcasts, shown above the list in a "Live now" section (hidden when empty); property only
 * @property {boolean} canInvite adds "Invite to current room" to each row menu (attribute `caninvite`)
 *
 * @fires member-action `CustomEvent<{ uid, action }>` from a row (bubbles, composed)
 * @fires watch `CustomEvent<{ id }>` from a stage card (bubbles, composed)
 *
 * @slot live extra content in the "Live now" area, above the cards
 * @csspart live   the "Live now" `pap-accordion`
 * @csspart search the search input
 * @csspart list   the `pap-group` holding the rows
 * @csspart empty  the empty state text
 */
export class MemberList extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-member-list");

    @property({ type: Array, attribute: false }) members: Profile[] = [];
    @property({ type: Object, attribute: false }) me?: Profile;
    @property({ type: Array, attribute: false }) incall: string[] = [];
    @property({ type: Array, attribute: false }) stages: StageSummary[] = [];
    @property({ type: Boolean, attribute: "caninvite" }) canInvite: boolean = false;

    @property({ type: String, attribute: false }) private query: string = "";

    private get sorted(): Profile[] {
        return [...(this.members ?? [])]
            .filter(m => m.uid !== this.me?.uid)
            .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
    }

    private get filtered(): Profile[] {
        const q = this.query.trim().toLowerCase();
        const list = this.sorted;
        return q ? list.filter(m => m.name.toLowerCase().includes(q)) : list;
    }

    // event handlers

    @bind
    private handleSearch(e: Event) {
        this.query = String((e.currentTarget as HTMLInputElement).value ?? "");
    }

    // the rows in display order: you first (when shown), then the filtered others
    private get rows(): { profile: Profile; self: boolean }[] {
        const others = this.filtered.map(profile => ({ profile, self: false }));
        return this.me ? [{ profile: this.me, self: true }, ...others] : others;
    }

    // attribute bindings only carry strings, so `profile` goes in as a property on the keyed rows
    update() {
        super.update();

        const cards = this.shadowRoot?.querySelectorAll<HTMLElement & { stage?: StageSummary }>("pc-stage-card");
        cards?.forEach((card, i) => {
            const stage = (this.stages ?? [])[i];
            if (stage) card.stage = stage;
        });

        const items = this.shadowRoot?.querySelectorAll<MemberItem>("pc-member-item");
        const rows = this.rows;
        items?.forEach((item, i) => {
            const row = rows[i];
            if (!row) return;

            item.profile = row.profile;
            item.self = row.self;
            item.incall = (this.incall ?? []).includes(row.profile.uid);
            item.canInvite = this.canInvite;
        });

        return undefined;
    }

    render() {
        const rows = this.rows;
        const others = this.sorted.length;
        const stages = this.stages ?? [];

        return html`
            ${stages.length ? html`
                <pap-accordion part="live" class="live" mode="multiple">
                    <pap-accordion-header open aria-level="2">${this.t("live", { count: stages.length })}</pap-accordion-header>
                    <pap-accordion-panel>
                        <slot name="live"></slot>
                        <div class="cards">
                            ${stages.map(stage => html`<pc-stage-card key="${stage.id}"></pc-stage-card>`)}
                        </div>
                    </pap-accordion-panel>
                </pap-accordion>
            ` : html`<slot name="live"></slot>`}
            <h2 class="heading">${this.t("online", { count: others + (this.me ? 1 : 0) })}</h2>
            <pap-input
                part="search"
                type="search"
                name="search"
                autocomplete="off"
                clear
                aria-label="${this.t("search")}"
                placeholder="${this.t("search")}"
                value="${this.query}"
                @input="${this.handleSearch}"
                @change="${this.handleSearch}"
            ></pap-input>
            ${rows.length ? html`
                <pap-group part="list" role="list" aria-orientation="vertical" aria-label="${this.t("label")}">
                    ${rows.map(row => html`<pc-member-item key="${row.profile.uid}"></pc-member-item>`)}
                </pap-group>
            ` : ""}
            ${!others ? html`<p part="empty" class="empty">${this.t("empty")}</p>` : ""}
            ${others && !this.filtered.length ? html`<p part="empty" class="empty">${this.t("no-results")}</p>` : ""}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-member-list": MemberList;
    }
}
