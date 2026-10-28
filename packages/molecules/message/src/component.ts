// system
import { CustomElement, html, property } from "@papit/web-component";
import "@papchat/avatar";
import "@papchat/time";

// local
import sheet from "./style.css" with { type: "css" };
import type { ChatMessage, Profile } from "@papchat/core";
import type { MessagePart, MessageVariant } from "./types";

/**
 * One chat message: avatar, author, time and a bubble with the text.
 *
 * The text is rendered as plain text with `http(s)` URLs turned into links. It is
 * split into text and `<a>` parts and rendered through `html` template parts, so
 * message text is never parsed as HTML. Newlines are preserved.
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

    @property({ type: Object }) message?: ChatMessage;
    @property({ type: Object }) author?: Profile;
    @property({ type: Boolean, reflect: true }) mine?: boolean;
    @property({ type: Boolean, reflect: true }) grouped?: boolean;
    @property({ type: String, reflect: true }) variant?: MessageVariant;

    render() {
        const message = this.message;
        if (!message) return html``;

        const variant = this.variant ?? (message.variant === "system" ? "system" : "text");
        const parts = linkify(message.text ?? "").map(part => part.href
            ? html`<a href="${part.href}" target="_blank" rel="noopener noreferrer">${part.text}</a>`
            : part.text
        );

        if (variant === "system")
        {
            return html`<div part="bubble" class="system">${parts}</div>`;
        }

        const name = this.author?.name || "";
        const showMeta = !this.grouped;

        return html`
            <div class="avatar">
                ${!this.mine && showMeta ? html`<pc-avatar size="s" name="${name}" color="${this.author?.color || ""}" uid="${this.author?.uid || message.uid}"></pc-avatar>` : ""}
            </div>
            <div class="body">
                ${showMeta ? html`<div class="meta">${this.mine ? "" : html`<span class="name">${name}</span>`}<pc-time at="${message.at}"></pc-time></div>` : ""}
                <div part="bubble" class="bubble">${parts}</div>
            </div>
        `;
    }
}

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

// split text into plain and link parts; trailing punctuation stays outside the link
export function linkify(text: string): MessagePart[] {
    const parts: MessagePart[] = [];
    let last = 0;

    for (const match of text.matchAll(URL_PATTERN))
    {
        const start = match.index ?? 0;
        let url = match[0];
        const trailing = url.match(TRAILING)?.[0] ?? "";
        if (trailing) url = url.slice(0, url.length - trailing.length);

        // "http://" alone is not a link
        if (!/^https?:\/\/.+/i.test(url)) continue;

        if (start > last) parts.push({ text: text.slice(last, start) });
        parts.push({ text: url, href: url });
        last = start + url.length;
    }

    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-message": Message;
    }
}
