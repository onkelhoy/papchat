// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/icon";
import "@papit/splitter";
import "@papit/tabs";
import "@papchat/conversation";
import "@papchat/call-stage";
import "@papchat/call-controls";
import "@papchat/member-item";

// local
import sheet from "./style.css" with { type: "css" };
import type { CallRequestEvent, CallTile, ChatMessage, Profile } from "./types";

const NARROW = "(max-width: 40rem)";

/**
 * A room: the chat on its own, or, while in a call, the call stage and controls next to
 * Chat / Files / People tabs (stacked on narrow screens).
 *
 * Child events (`send`, `typing`, `files`, `pin`, `toggle`, `invite`, `devices`, `hangup`,
 * `member-action`) bubble and are composed, so they reach this element's listeners unchanged.
 * Only `call` is its own. The Files tab renders `<slot name="files">` until T4.4 fills it.
 *
 * @element pc-room
 *
 * @property {boolean} incall in a call: show stage, controls and tabs
 * @property {boolean} viewer watching a stage: controls show only Leave and the chat toggle, chat is hidden until toggled
 * @property {string} heading room name in the header
 * @property {string} me own uid
 * @property {ChatMessage[]} messages (property only)
 * @property {Record<string, Profile>} profiles uid to profile (property only)
 * @property {string[]} typing uids currently typing (property only)
 * @property {Profile[]} participants who is in the room, People tab (property only)
 * @property {CallTile[]} tiles the call stage tiles (property only)
 * @property {boolean} mic microphone is on
 * @property {boolean} camera camera is on
 * @property {boolean} screen you are sharing your screen
 * @property {boolean} canscreen the browser can share a screen (default true)
 * @property {string} sinkid output device id for remote audio
 *
 * @fires call `CustomEvent<{ kind: "call" | "video" }>` header buttons, not in a call
 *
 * @slot files content of the Files tab
 *
 * @csspart header the header (not in a call)
 */
export class Room extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-room");

    @property({ type: Boolean, reflect: true }) incall: boolean = false;
    @property({ type: Boolean, reflect: true }) viewer: boolean = false;
    @property({ type: String }) heading: string = "";
    @property({ type: String }) me: string = "";
    @property({ type: Array, attribute: false }) messages: ChatMessage[] = [];
    @property({ type: Object, attribute: false }) profiles: Record<string, Profile> = {};
    @property({ type: Array, attribute: false }) typing: string[] = [];
    @property({ type: Array, attribute: false }) participants: Profile[] = [];
    @property({ type: Array, attribute: false }) tiles: CallTile[] = [];
    @property({ type: Boolean }) mic: boolean = false;
    @property({ type: Boolean }) camera: boolean = false;
    @property({ type: Boolean }) screen: boolean = false;
    @property({ type: Boolean }) canscreen: boolean = true;
    @property({ type: String }) sinkid: string = "";

    @property({ type: Boolean, attribute: false }) private narrow: boolean = false;
    // viewers only: chat panel toggled from the controls
    @property({ type: Boolean, attribute: false }) private showChat: boolean = false;

    @query("pc-conversation") private conversation?: HTMLElement & { messages: ChatMessage[]; profiles: Record<string, Profile>; me: string; typing: string[] };
    @query("pc-call-stage") private stage?: HTMLElement & { tiles: CallTile[]; sinkid: string };

    @query("pc-call-controls") private controls?: HTMLElement & { mic: boolean; camera: boolean; screen: boolean; chat: boolean; viewer: boolean; canscreen: boolean };

    private media?: MediaQueryList;

    connectedCallback() {
        super.connectedCallback();
        this.media = window.matchMedia(NARROW);
        this.narrow = this.media.matches;
        this.media.addEventListener("change", this.handleMedia);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.media?.removeEventListener("change", this.handleMedia);
        this.media = undefined;
    }

    // attribute bindings only carry strings, so objects go in as properties after the DOM is patched
    update() {
        super.update();
        this.syncChildren();
        return undefined;
    }

    private syncChildren() {
        const conversation = this.conversation;
        if (conversation)
        {
            conversation.messages = this.messages;
            conversation.profiles = this.profiles;
            conversation.me = this.me;
            conversation.typing = this.typing;
        }

        const stage = this.stage;
        if (stage)
        {
            stage.tiles = this.tiles;
            stage.sinkid = this.sinkid;
        }

        const controls = this.controls;
        if (controls)
        {
            controls.mic = this.mic;
            controls.camera = this.camera;
            controls.screen = this.screen;
            controls.chat = this.showChat;
            controls.viewer = this.viewer;
            controls.canscreen = this.canscreen;
        }

        const rows = this.shadowRoot?.querySelectorAll<HTMLElement & { profile?: Profile; self: boolean; incall: boolean }>("pc-member-item");
        rows?.forEach((row, i) => {
            const profile = this.participants[i];
            if (!profile) return;

            row.profile = profile;
            row.self = profile.uid === this.me;
            row.incall = true;
        });
    }

    @bind
    private handleMedia(e: MediaQueryListEvent) {
        this.narrow = e.matches;
    }

    @bind
    private handleCall(e: Event) {
        const kind = (e.currentTarget as HTMLElement).dataset.kind as CallRequestEvent["kind"];
        this.dispatchEvent(new CustomEvent<CallRequestEvent>("call", { detail: { kind }, bubbles: true, composed: true }));
    }

    // the controls don't flip their own state; the chat toggle is ours, the rest is left to the page
    @bind
    private handleToggle(e: CustomEvent<{ control: string }>) {
        if (e.detail.control === "chat") this.showChat = !this.showChat;
    }

    private renderConversation() {
        return html`<pc-conversation part="conversation"></pc-conversation>`;
    }

    private renderStage() {
        return html`
            <div class="stage" slot="primary">
                <pc-call-stage aria-label="${this.t("stage")}"></pc-call-stage>
                <pc-call-controls
                    @toggle="${this.handleToggle}"
                ></pc-call-controls>
            </div>
        `;
    }

    private renderTabs() {
        return html`
            <div class="side" slot="secondary">
                <pap-tabs value="chat" aria-label="${this.t("tabs")}">
                    <pap-tab value="chat">${this.t("chat")}</pap-tab>
                    <pap-tab value="files">${this.t("files")}</pap-tab>
                    <pap-tab value="people">${this.t("people")}</pap-tab>
                    <pap-tabpanel value="chat">${this.renderConversation()}</pap-tabpanel>
                    <pap-tabpanel value="files">
                        <slot name="files"><div class="empty">${this.t("no-files")}</div></slot>
                    </pap-tabpanel>
                    <pap-tabpanel value="people">
                        <div class="people">
                            ${this.participants.map(p => html`<pc-member-item key="${p.uid}"></pc-member-item>`)}
                        </div>
                    </pap-tabpanel>
                </pap-tabs>
            </div>
        `;
    }

    render() {
        if (!this.incall)
        {
            return html`
                <div part="header" class="header">
                    <div class="heading">${this.heading}</div>
                    <pap-button size="s" type="button" data-kind="call" @click="${this.handleCall}">
                        <pap-icon name="/icons/spritesheet.svg#phone" width="16" height="16" aria-hidden="true"></pap-icon>
                        ${this.t("call")}
                    </pap-button>
                    <pap-button size="s" type="button" data-kind="video" @click="${this.handleCall}">
                        <pap-icon name="/icons/spritesheet.svg#camera" width="16" height="16" aria-hidden="true"></pap-icon>
                        ${this.t("video")}
                    </pap-button>
                </div>
                ${this.renderConversation()}
            `;
        }

        // viewers get the stage alone until they open the chat
        if (this.viewer && !this.showChat)
        {
            return this.renderStage();
        }

        return html`
            <pap-splitter split="${this.narrow ? "horizontal" : "vertical"}" label="${this.t("label")}" min="30" max="80">
                ${this.renderStage()}
                ${this.viewer ? html`<div class="side" slot="secondary">${this.renderConversation()}</div>` : this.renderTabs()}
            </pap-splitter>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-room": Room;
    }
}
