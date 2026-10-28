// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papchat/message";
import type { Message } from "@papchat/message";
import "@papchat/composer";

// local
import sheet from "./style.css" with { type: "css" };
import type { ChatMessage, Profile } from "@papchat/core";
import type { FilesEvent, SendEvent } from "./types";

const GROUP_WINDOW = 2 * 60 * 1000;
const BOTTOM_THRESHOLD = 24;

/**
 * A chat room's message list, typing line and composer.
 *
 * Messages are grouped here: a message is `grouped` (avatar and name hidden) when the previous
 * message has the same `uid` and is at most 2 minutes older, and neither is a system message.
 * The list sticks to the bottom as messages arrive; when the user has scrolled up, the list is left
 * alone and a "New messages" button appears (own messages always scroll into view).
 * `send`, `typing` and `files` from the composer are re-dispatched from this element.
 *
 * @element pc-conversation
 *
 * @property {ChatMessage[]} messages the messages, oldest first (property only)
 * @property {Record<string, Profile>} profiles uid to profile (property only)
 * @property {string} me own uid
 * @property {string[]} typing uids currently typing (own uid is ignored)
 * @property {string} heading optional header text (not `title`: that would add a native tooltip)
 *
 * @fires send `CustomEvent<{ text: string }>` re-dispatched from the composer
 * @fires typing `CustomEvent<void>` re-dispatched from the composer
 * @fires files `CustomEvent<{ files: File[] }>` re-dispatched from the composer
 *
 * @csspart header the heading
 * @csspart list the scrolling message list
 * @csspart composer the composer
 */
export class Conversation extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-conversation");

    @property({ type: Array, attribute: false }) messages: ChatMessage[] = [];
    @property({ type: Object, attribute: false }) profiles: Record<string, Profile> = {};
    @property({ type: String }) me: string = "";
    @property({ type: Array, attribute: false }) typing: string[] = [];
    @property({ type: String }) heading: string = "";

    // shown while there are messages below the viewport
    @property({ type: Boolean, attribute: false }) private unseen: boolean = false;

    @query(".list") private list!: HTMLElement;

    private stuck = true;
    private lastId?: string;
    private count = 0;

    // scroll to the bottom after the DOM has been patched
    update() {
        super.update();
        this.syncMessages();
        this.followBottom();
        return undefined;
    }

    // attribute bindings only carry strings, so objects go in as properties on the keyed rows
    private syncMessages() {
        const rows = this.shadowRoot?.querySelectorAll<Message>("pc-message");
        if (!rows) return;

        rows.forEach((row, i) => {
            const message = this.messages[i];
            if (!message) return;

            row.message = message;
            row.author = this.profiles[message.uid];
            row.mine = message.uid === this.me;
            row.grouped = this.isGrouped(i);
            row.variant = message.variant === "system" ? "system" : "text";
        });
    }

    private followBottom() {
        const list = this.list;
        if (!list) return;

        const last = this.messages[this.messages.length - 1];
        const changed = last?.id !== this.lastId || this.messages.length !== this.count;
        this.lastId = last?.id;
        this.count = this.messages.length;

        if (!changed) return;

        if (this.stuck || last?.uid === this.me)
        {
            this.scrollToBottom();
        }
        else if (!this.unseen)
        {
            this.unseen = true;
        }
    }

    private scrollToBottom() {
        const list = this.list;
        if (!list) return;

        this.stuck = true;
        list.scrollTop = list.scrollHeight;
        if (this.unseen) this.unseen = false;
    }

    @bind
    private handleScroll() {
        const list = this.list;
        this.stuck = list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_THRESHOLD;
        if (this.stuck && this.unseen) this.unseen = false;
    }

    @bind
    private handleNew() {
        this.scrollToBottom();
    }

    @bind
    private handleSend(e: CustomEvent<SendEvent>) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent<SendEvent>("send", { detail: { text: e.detail.text }, bubbles: true, composed: true }));
    }

    @bind
    private handleTyping(e: Event) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("typing", { bubbles: true, composed: true }));
    }

    @bind
    private handleFiles(e: CustomEvent<FilesEvent>) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent<FilesEvent>("files", { detail: { files: e.detail.files }, bubbles: true, composed: true }));
    }

    private isGrouped(index: number) {
        const message = this.messages[index];
        const previous = this.messages[index - 1];
        if (!previous || message.variant === "system" || previous.variant === "system") return false;

        return previous.uid === message.uid && message.at - previous.at <= GROUP_WINDOW;
    }

    private typingText() {
        const names = this.typing
            .filter((uid, i, all) => uid !== this.me && all.indexOf(uid) === i)
            .map(uid => this.profiles[uid]?.name || uid);

        if (names.length === 0) return "";
        if (names.length === 1) return this.t("typing-one", { name: names[0] });
        if (names.length === 2) return this.t("typing-two", { first: names[0], second: names[1] });
        return this.t("typing-many");
    }

    render() {
        const typing = this.typingText();

        return html`
            ${this.heading ? html`<div part="header" class="header">${this.heading}</div>` : ""}
            <div class="list-wrap">
                <div part="list" class="list" role="log" aria-label="${this.heading || this.t("label")}" aria-relevant="additions" tabindex="0" @scroll="${this.handleScroll}">
                    ${this.messages.length === 0 ? html`<div class="empty">${this.t("empty")}</div>` : ""}
                    ${this.messages.map(message => html`<pc-message key="${message.id}"></pc-message>`)}
                </div>
                ${this.unseen ? html`<pap-button class="new" size="s" color="primary" type="button" @click="${this.handleNew}">${this.t("new-messages")} ↓</pap-button>` : ""}
            </div>
            <div class="typing" role="status" aria-live="polite">${typing}</div>
            <!-- T4.4 drop zone -->
            <pc-composer
                part="composer"
                @send="${this.handleSend}"
                @typing="${this.handleTyping}"
                @files="${this.handleFiles}"
            ></pc-composer>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-conversation": Conversation;
    }
}
