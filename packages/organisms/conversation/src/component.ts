// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papchat/message";
import type { Message } from "@papchat/message";
import "@papchat/composer";
import "@papchat/file-card";
import type { FileCard } from "@papchat/file-card";

// local
import sheet from "./style.css" with { type: "css" };
import type { ChatMessage, FileEntry, Profile } from "@papchat/core";
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
 * `file` messages are drawn as a `pc-file-card` (looked up by `fid` in `files`; a file message with no
 * entry is left out). Dragging files over the element shows a "Drop to share" overlay; dropping fires `files`.
 *
 * @element pc-conversation
 *
 * @property {ChatMessage[]} messages the messages, oldest first (property only)
 * @property {Record<string, Profile>} profiles uid to profile (property only)
 * @property {FileEntry[]} files the room's files, matched to `file` messages by `fid` (property only)
 * @property {string} me own uid
 * @property {string[]} typing uids currently typing (own uid is ignored)
 * @property {string} heading optional header text (not `title`: that would add a native tooltip)
 *
 * @fires send `CustomEvent<{ text: string }>` re-dispatched from the composer
 * @fires typing `CustomEvent<void>` re-dispatched from the composer
 * @fires files `CustomEvent<{ files: File[] }>` re-dispatched from the composer, or dropped on the element
 * @fires cancel `CustomEvent<{ fid }>` from a file card (bubbles, composed)
 *
 * @csspart header the heading
 * @csspart list the scrolling message list
 * @csspart composer the composer
 * @csspart drop the drop overlay
 */
export class Conversation extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-conversation");

    @property({ type: Array, attribute: false, rerender: true }) messages: ChatMessage[] = [];
    @property({ type: Object, attribute: false }) profiles: Record<string, Profile> = {};
    @property({ type: Array, attribute: false }) files: FileEntry[] = [];
    @property({ type: String }) me: string = "";
    @property({ type: Array, attribute: false }) typing: string[] = [];
    @property({ type: String, rerender: true }) heading: string = "";

    // shown while there are messages below the viewport
    @property({ type: Boolean, attribute: false, rerender: true }) private unseen: boolean = false;
    // true while files are dragged over the element
    @property({ type: Boolean, attribute: false, rerender: true }) private dropping: boolean = false;

    @query(".list") private list!: HTMLElement;

    private stuck = true;
    private lastId?: string;
    private count = 0;
    private depth = 0;

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("dragenter", this.handleDragenter);
        this.addEventListener("dragover", this.handleDragover);
        this.addEventListener("dragleave", this.handleDragleave);
        this.addEventListener("drop", this.handleDrop);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("dragenter", this.handleDragenter);
        this.removeEventListener("dragover", this.handleDragover);
        this.removeEventListener("dragleave", this.handleDragleave);
        this.removeEventListener("drop", this.handleDrop);
    }

    // scroll to the bottom after the DOM has been patched
    update() {
        super.update();
        this.syncMessages();
        this.followBottom();
        return undefined;
    }

    // attribute bindings only carry strings, so objects go in as properties on the keyed rows
    private syncMessages() {
        const rows = this.shadowRoot?.querySelectorAll<Message | FileCard>("pc-message, pc-file-card");
        if (!rows) return;

        const shown = this.shown();
        rows.forEach((row, i) => {
            const message = shown[i];
            if (!message) return;

            const mine = message.uid === this.me;
            if (row instanceof HTMLElement && row.localName === "pc-file-card")
            {
                const card = row as FileCard;
                card.file = this.files.find(file => file.fid === message.fid);
                card.mine = mine;
                return;
            }

            const item = row as Message;
            item.message = message;
            item.author = this.profiles[message.uid];
            item.mine = mine;
            item.grouped = this.isGrouped(shown, i);
            item.variant = message.variant === "system" ? "system" : "text";
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

    // the messages that get a row: a file message needs its entry
    private shown() {
        return this.messages.filter(message => message.variant !== "file" || this.files.some(file => file.fid === message.fid));
    }

    private isGrouped(list: ChatMessage[], index: number) {
        const message = list[index];
        const previous = list[index - 1];
        if (!previous || message.variant !== "text" || previous.variant !== "text") return false;

        return previous.uid === message.uid && message.at - previous.at <= GROUP_WINDOW;
    }

    private hasFiles(e: DragEvent) {
        return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    }

    @bind
    private handleDragenter(e: DragEvent) {
        if (!this.hasFiles(e)) return;

        e.preventDefault();
        this.depth++;
        this.dropping = true;
    }

    @bind
    private handleDragover(e: DragEvent) {
        if (!this.hasFiles(e)) return;

        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    // enter/leave fire for every child crossed, so count them to know when the drag really left
    @bind
    private handleDragleave(e: DragEvent) {
        if (!this.hasFiles(e)) return;

        this.depth = Math.max(0, this.depth - 1);
        if (this.depth === 0) this.dropping = false;
    }

    @bind
    private handleDrop(e: DragEvent) {
        if (!this.hasFiles(e)) return;

        e.preventDefault();
        this.depth = 0;
        this.dropping = false;

        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length === 0) return;

        this.dispatchEvent(new CustomEvent<FilesEvent>("files", { detail: { files }, bubbles: true, composed: true }));
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
                    ${this.shown().map(message => message.variant === "file"
                        ? html`<pc-file-card key="${message.id}"></pc-file-card>`
                        : html`<pc-message key="${message.id}"></pc-message>`)}
                </div>
                ${this.unseen ? html`<pap-button class="new" size="small" color="primary" type="button" @click="${this.handleNew}">${this.t("new-messages")} ↓</pap-button>` : ""}
            </div>
            <div class="typing" role="status" aria-live="polite">${typing}</div>
            <pc-composer
                part="composer"
                @send="${this.handleSend}"
                @typing="${this.handleTyping}"
                @files="${this.handleFiles}"
            ></pc-composer>
            ${this.dropping ? html`<div part="drop" class="drop" aria-hidden="true">${this.t("drop")}</div>` : ""}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-conversation": Conversation;
    }
}
