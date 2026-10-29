// system
import { CustomElement, html, property } from "@papit/web-component";
import "@papchat/avatar";
import "@papchat/time";

// local
import sheet from "./style.css" with { type: "css" };
import type { ChatMessage, Profile } from "@papchat/core";
import { render as renderText } from "./format";
import type { MessageVariant } from "./types";

/**
 * One chat message: avatar, author, time and a bubble with the text.
 *
 * The text supports a small markdown subset (see `format.ts`): **bold**, *italic*,
 * __underline__, ~~strike~~, `code`, fenced code, > quotes, - and 1. lists,
 * [label](https://…) and bare http(s) links. It is parsed into a tree and built with
 * createElement and text nodes, so message text is never parsed as HTML. Plain text
 * renders as before, newlines kept.
 * `mine` aligns the bubble right in the primary colour; `grouped` (same author
 * within 2 minutes) hides the avatar and name; the `system` variant is a centred
 * muted line ("Anna joined").
 *
 * @element pc-message
 *
 * @property {ChatMessage} message the message (`text`, `at`, `uid`, `variant`)
 * @property {Profile} author the sender; falls back to `message.uid` for the avatar
 * @property {boolean} mine own message (reflected)
 * @property {boolean} grouped hide avatar and name (reflected)
 * @property {MessageVariant} variant text | system (reflected, default `message.variant`)
 *
 * @csspart bubble the message bubble
 */
export class Message extends CustomElement {
    static sheet = sheet;

    @property({ type: Object, rerender: true }) message?: ChatMessage;
    @property({ type: Object, rerender: true }) author?: Profile;
    @property({ type: Boolean, reflect: true, rerender: true }) mine?: boolean;
    @property({ type: Boolean, reflect: true, rerender: true }) grouped?: boolean;
    @property({ type: String, reflect: true, rerender: true }) variant?: MessageVariant;

    // message text goes in as DOM nodes (elements and text, never HTML), rebuilt only when it changed
    update() {
        super.update();
        const bubble = this.shadowRoot?.querySelector<HTMLElement>("[part='bubble']");
        const text = this.message?.text ?? "";
        if (bubble && bubble.dataset.text !== text)
        {
            bubble.replaceChildren(renderText(text));
            bubble.dataset.text = text;
        }
        return undefined;
    }

    render() {
        const message = this.message;
        if (!message) return html``;

        const variant = this.variant ?? (message.variant === "system" ? "system" : "text");

        // the bubble's content is built in update(), not through the template
        if (variant === "system")
        {
            return html`<div part="bubble" class="system"></div>`;
        }

        const name = this.author?.name || "";
        const showMeta = !this.grouped;

        return html`
            <div class="avatar">
                ${!this.mine && showMeta ? html`<pc-avatar size="s" name="${name}" color="${this.author?.color || ""}" uid="${this.author?.uid || message.uid}"></pc-avatar>` : ""}
            </div>
            <div class="body">
                ${showMeta ? html`<div class="meta">${this.mine ? "" : html`<span class="name">${name}</span>`}<pc-time at="${message.at}"></pc-time></div>` : ""}
                <div part="bubble" class="bubble"></div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-message": Message;
    }
}
