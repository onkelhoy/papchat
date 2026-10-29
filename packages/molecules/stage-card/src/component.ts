// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papchat/avatar";
import "@papchat/badge";
import type { StageSummary } from "@papchat/core";

// local
import sheet from "./style.css" with { type: "css" };
import type { WatchEvent } from "./types";

/**
 * One live broadcast in the "Live now" list: Live badge, title, presenter avatar and
 * name, viewer count and a Watch button (or "You're live" when it is your own stage).
 *
 * @element pc-stage-card
 *
 * @property {StageSummary} stage id, title, presenter (Profile), viewers, mine (property or JSON attribute)
 *
 * @fires watch `{ id }` Watch pressed (bubbles, composed; never when `stage.mine`)
 *
 * @csspart avatar the presenter's `pc-avatar`
 * @csspart title  the title text
 * @csspart watch  the Watch button
 */
export class StageCard extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-stage-card");

    @property({ type: Object, rerender: true }) stage?: StageSummary;

    @bind private handleWatch() {
        const stage = this.stage;
        if (!stage || stage.mine) return;

        this.dispatchEvent(new CustomEvent<WatchEvent>("watch", {
            detail: { id: stage.id },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const stage = this.stage;
        if (!stage) return html``;

        const name = stage.presenter?.name?.trim() || "?";
        const viewers = Number.isFinite(stage.viewers) ? Math.max(0, stage.viewers) : 0;
        const meta = `${name} · ${this.t("viewers", { count: String(viewers) })}`;

        return html`
            <pc-avatar part="avatar" aria-hidden="true" name="${name}" uid="${stage.presenter?.uid ?? ""}" color="${stage.presenter?.color ?? ""}"></pc-avatar>
            <span class="text">
                <span class="line">
                    <pc-badge variant="live">${this.t("live")}</pc-badge>
                    <span part="title" class="title">${stage.title}</span>
                </span>
                <span class="meta">${meta}</span>
            </span>
            ${stage.mine ? html`<span class="mine">${this.t("mine")}</span>` : ""}
            ${stage.mine ? "" : html`<pap-button class="action" part="watch" size="small" variant="clear" aria-label="${this.t("label", { title: stage.title, name, count: String(viewers) })}" @click="${this.handleWatch}">${this.t("watch")}</pap-button>`}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-stage-card": StageCard;
    }
}
