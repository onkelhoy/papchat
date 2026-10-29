// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import type { RoomSummary } from "@papchat/core";
import "@papit/group";
import "@papit/menu";
import "@papit/icon";
import "@papchat/avatar";
import "@papchat/badge";

// local
import sheet from "./style.css" with { type: "css" };
import type { LeaveEvent, SelectEvent } from "./types";

const MAX_AVATARS = 3;

/**
 * List of the open rooms and stages. Each row shows up to three stacked
 * avatars, the title (fallback: the participants' names), an unread badge, a
 * phone icon while in a call and a `Live` badge for stages. The rows are a
 * `pap-group` (arrow keys, Home, End); a row menu offers `Leave`.
 *
 * @element pc-room-list
 *
 * @property {RoomSummary[]} rooms the rooms to list, in the order given
 * @property {string} active id of the open room, gets `aria-current`
 * @property {boolean} compact one avatar per row (collapsed sidebar): title in a tooltip, unread as a dot (reflected)
 *
 * @fires select `CustomEvent<{ id: string }>` when a row is chosen
 * @fires leave `CustomEvent<{ id: string }>` when "Leave" is chosen in a row menu
 * @csspart list the `pap-group` holding the rows
 * @csspart row one room row
 */
export class RoomList extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-room-list");

    @property({ type: Array, attribute: false, rerender: true }) rooms: RoomSummary[] = [];
    @property({ type: String }) active?: string;
    @property({ type: Boolean, reflect: true, rerender: true }) compact: boolean = false;

    private labelOf(room: RoomSummary): string {
        const title = room.title?.trim();
        if (title) return title;
        return room.participants.map(p => p.name).join(", ") || this.t("untitled");
    }

    private handleSelect(room: RoomSummary) {
        this.dispatchEvent(new CustomEvent<SelectEvent>("select", {
            detail: { id: room.id },
            bubbles: true,
            composed: true,
        }));
    }

    private handleLeave(room: RoomSummary, e: Event) {
        // a menu stays open after a choice, close it so focus returns to its trigger
        (e.currentTarget as HTMLElement).closest<HTMLElement>("pap-menu")?.hidePopover();

        this.dispatchEvent(new CustomEvent<LeaveEvent>("leave", {
            detail: { id: room.id },
            bubbles: true,
            composed: true,
        }));
    }

    private renderRow(room: RoomSummary, index: number) {
        const title = this.labelOf(room);
        const current = room.id === this.active;

        return html`
            <div part="row" class="row" role="listitem" data-current="${String(current)}">
                <button type="button" class="select" aria-current="${current ? "true" : "false"}" title="${this.compact ? title : ""}" @click="${() => this.handleSelect(room)}">
                    <span class="avatars" aria-hidden="true">
                        ${room.participants.slice(0, MAX_AVATARS).map(p => html`<pc-avatar size="s" name="${p.name}" color="${p.color}" uid="${p.uid}"></pc-avatar>`)}
                        ${room.participants.length ? "" : html`<pc-avatar size="s" name="${title}"></pc-avatar>`}
                    </span>
                    <span class="title">${title}</span>
                    ${room.incall ? html`<pap-icon class="call" name="/icons/spritesheet.svg#phone" role="img" aria-label="${this.t("incall")}"></pap-icon>` : ""}
                    ${room.live ? html`<pc-badge variant="live">${this.t("live")}</pc-badge>` : ""}
                    ${room.unread > 0 ? html`<pc-badge variant="primary" count="${room.unread}" role="img" aria-label="${this.t("unread", { count: room.unread })}"></pc-badge>` : ""}
                </button>
                <button type="button" class="more" popovertarget="${`menu-${index}`}" aria-haspopup="menu" aria-label="${this.t("options", { title })}">
                    <span aria-hidden="true">⋯</span>
                </button>
                <pap-menu id="${`menu-${index}`}" placement="bottom-right">
                    <pap-menuitem @click="${(e: Event) => this.handleLeave(room, e)}">${this.t("leave")}</pap-menuitem>
                </pap-menu>
            </div>
        `;
    }

    render() {
        if (!this.rooms?.length) return html`<p part="empty" class="empty">${this.t("empty")}</p>`;

        return html`
            <pap-group part="list" role="list" aria-orientation="vertical" aria-label="${this.t("label")}">
                ${this.rooms.map((room, i) => this.renderRow(room, i))}
            </pap-group>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-room-list": RoomList;
    }
}
