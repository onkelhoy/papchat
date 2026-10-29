// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/dialog";
import "@papit/tabs";
import "@papit/switch";
import "@papit/input";
import "@papit/radio";
import "@papit/button";
import "@papit/theme-picker";
import "@papchat/ringtone-picker";
import "@papchat/device-picker";
import "@papchat/language-picker";
import "@papchat/video";
import "@papchat/level-meter";

// local
import sheet from "./style.css" with { type: "css" };
import type {
    DeviceLists, LanguageChangeEvent, Prefs, PrefsChangeEvent, PreviewDeviceEvent,
    Profile, ProfileChangeEvent, Shortcut, Status, Tone,
} from "./types";

const STATUSES: Status[] = ["available", "busy", "away", "dnd"];

type Synced = HTMLElement & Record<string, unknown>;

/**
 * Settings dialog. Everything applies immediately: each change is an event, the page stores it
 * and passes the new `profile` / `prefs` back. Ringtone `preview` / `preview-stop` events from the
 * picker pass through untouched (the page plays the tone and sets `playing`).
 *
 * @element pc-settings
 *
 * @property {boolean} open whether the dialog is shown
 * @property {Profile} profile own profile (property only)
 * @property {Prefs} prefs preferences (property only)
 * @property {Tone[]} tones ringtone choices (property only)
 * @property {DeviceLists} devices devices split by kind (property only)
 * @property {string} language current language code
 * @property {string} playing id of the ringtone being previewed
 * @property {MediaStream | null} camerastream camera test stream, set by the page after `preview-device` (property only)
 * @property {MediaStream | null} micstream microphone test stream (property only)
 * @property {boolean} sinkSupported the browser can pick an output device (default true)
 * @property {Shortcut[]} shortcuts keyboard shortcuts listed in the Shortcuts tab, hidden when empty (property only)
 *
 * @fires profile-change `{ partial }` name, colour or status changed
 * @fires prefs-change `{ partial }` ringtone, volume, devices or auto-decline changed
 * @fires language-change `{ value }`
 * @fires request-notifications switch turned on: the page asks for permission, then sets `prefs.notifications`
 * @fires preview-device `{ kind: "camera" | "mic" }` a test button was pressed
 * @fires close the dialog was dismissed (the page sets `open = false`)
 *
 * @csspart dialog the `pap-dialog`
 */
export class Settings extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-settings");

    @property({ type: Boolean, rerender: true }) open: boolean = false;
    @property({ type: Object, attribute: false, rerender: true }) profile?: Profile;
    @property({ type: Object, attribute: false, rerender: true }) prefs?: Prefs;
    @property({ type: Array, attribute: false, rerender: true }) tones: Tone[] = [];
    @property({ type: Object, attribute: false, rerender: true }) devices: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] };
    @property({ type: String, rerender: true }) language: string = "en";
    @property({ type: String, rerender: true }) playing: string = "";
    @property({ type: Object, attribute: false, rerender: true }) camerastream?: MediaStream;
    @property({ type: Object, attribute: false, rerender: true }) micstream?: MediaStream;
    @property({ type: Boolean, attribute: false, rerender: true }) sinkSupported: boolean = true;
    @property({ type: Array, attribute: false, rerender: true }) shortcuts: Shortcut[] = [];

    @query("pc-ringtone-picker") private ringtones?: Synced;
    @query("pc-language-picker") private languages?: Synced;
    @query("pc-video") private video?: Synced;
    @query("pc-level-meter") private meter?: Synced;

    // objects, arrays and streams can't go through attribute bindings, so they are set after patching
    update() {
        super.update();
        this.syncChildren();
        return undefined;
    }

    private syncChildren() {
        const prefs = this.prefs;

        if (this.ringtones)
        {
            this.ringtones.tones = this.tones;
            this.ringtones.value = prefs?.ringtone ?? "";
            this.ringtones.volume = prefs?.volume ?? 1;
            this.ringtones.playing = this.playing;
        }

        if (this.languages) this.languages.value = this.language;

        const pickers: [string, keyof DeviceLists, string | undefined][] = [
            ["mic", "audioinput", prefs?.devices.mic],
            ["camera", "videoinput", prefs?.devices.camera],
            ["speaker", "audiooutput", prefs?.devices.speaker],
        ];
        for (const [name, kind, value] of pickers)
        {
            const picker = this.shadowRoot?.querySelector<Synced>(`pc-device-picker[data-device="${name}"]`);
            if (!picker) continue;
            picker.devices = this.devices[kind];
            picker.value = value ?? "";
            picker.supported = this.sinkSupported;
        }

        if (this.video)
        {
            this.video.stream = this.camerastream;
            this.video.muted = true;
            this.video.mirror = true;
        }
        if (this.meter) this.meter.stream = this.micstream;
    }

    private emit<T>(name: string, detail?: T) {
        this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
    }

    private emitPrefs(partial: Partial<Prefs>) {
        this.emit<PrefsChangeEvent>("prefs-change", { partial });
    }

    @bind
    private handleDialogClose() {
        // also fires when the page closes us; only dismissals by the user count
        if (!this.open) return;
        this.open = false;
        this.emit("close");
    }

    @bind
    private handleName(e: Event) {
        const name = String((e.currentTarget as HTMLInputElement).value ?? "").trim();
        if (!name || name === this.profile?.name) return;
        this.emit<ProfileChangeEvent>("profile-change", { partial: { name } });
    }

    @bind
    private handleColor(e: Event) {
        const color = (e.currentTarget as HTMLInputElement).value;
        if (color && color !== this.profile?.color) this.emit<ProfileChangeEvent>("profile-change", { partial: { color } });
    }

    @bind
    private handleStatus(status: Status, e: Event) {
        // the radio being unchecked fires change too, only the newly checked one counts
        if (!(e.currentTarget as HTMLInputElement).checked) return;
        if (status !== this.profile?.status) this.emit<ProfileChangeEvent>("profile-change", { partial: { status } });
    }

    @bind
    private handleTone(e: CustomEvent<{ value: string }>) {
        e.stopPropagation();
        this.emitPrefs({ ringtone: e.detail.value });
    }

    @bind
    private handleVolume(e: CustomEvent<{ volume: number }>) {
        e.stopPropagation();
        this.emitPrefs({ volume: e.detail.volume });
    }

    @bind
    private handleAutoDecline(e: Event) {
        const checked = !!(e.currentTarget as HTMLInputElement).checked;
        if (checked !== this.prefs?.autoDeclineBusy) this.emitPrefs({ autoDeclineBusy: checked });
    }

    private handleDevice(slot: "mic" | "camera" | "speaker", e: CustomEvent<{ value: string }>) {
        e.stopPropagation();
        this.emitPrefs({ devices: { ...this.prefs?.devices, [slot]: e.detail.value || undefined } });
    }

    @bind
    private handleMic(e: CustomEvent<{ value: string }>) { this.handleDevice("mic", e); }

    @bind
    private handleCamera(e: CustomEvent<{ value: string }>) { this.handleDevice("camera", e); }

    @bind
    private handleSpeaker(e: CustomEvent<{ value: string }>) { this.handleDevice("speaker", e); }

    @bind
    private handleTest(e: Event) {
        const kind = (e.currentTarget as HTMLElement).dataset.kind as PreviewDeviceEvent["kind"];
        this.emit<PreviewDeviceEvent>("preview-device", { kind });
    }

    @bind
    private handleTheme(e: Event) {
        // the theme picker applies the theme itself
        e.stopPropagation();
    }

    @bind
    private handleLanguage(e: CustomEvent<{ value: string }>) {
        e.stopPropagation();
        this.emit<LanguageChangeEvent>("language-change", { value: e.detail.value });
    }

    @bind
    private handleNotifications(e: Event) {
        const checked = !!(e.currentTarget as HTMLInputElement).checked;
        if (checked === !!this.prefs?.notifications) return;

        if (checked) this.emit("request-notifications");
        else this.emitPrefs({ notifications: false });
    }

    render() {
        const profile = this.profile;
        const prefs = this.prefs;

        return html`
            <pap-dialog
                part="dialog"
                open="${this.open && "true"}"
                header="${this.t("title")}"
                close-outside-click="true"
                @close="${this.handleDialogClose}"
            >
                <div class="body">
                    <pap-tabs value="profile">
                        <pap-tab value="profile">${this.t("profile")}</pap-tab>
                        <pap-tab value="sound">${this.t("sound")}</pap-tab>
                        <pap-tab value="devices">${this.t("devices")}</pap-tab>
                        <pap-tab value="appearance">${this.t("appearance")}</pap-tab>
                        <pap-tab value="notifications">${this.t("notifications")}</pap-tab>
                        ${this.shortcuts?.length ? html`<pap-tab value="shortcuts">${this.t("shortcuts")}</pap-tab>` : ""}

                        <pap-tabpanel value="profile">
                            <div class="field">
                                <label for="name">${this.t("name")}</label>
                                <pap-input id="name" name="name" autocomplete="nickname" maxlength="32" value="${profile?.name ?? ""}" @change="${this.handleName}"></pap-input>
                            </div>
                            <div class="field">
                                <label for="color">${this.t("color")}</label>
                                <div class="row">
                                    <input id="color" type="color" value="${profile?.color || "#4f46e5"}" @change="${this.handleColor}" />
                                </div>
                            </div>
                            <fieldset class="field">
                                <legend>${this.t("status")}</legend>
                                <div class="status">
                                    ${STATUSES.map(status => html`
                                        <pap-radio
                                            key="${status}"
                                            name="status"
                                            value="${status}"
                                            checked="${profile?.status === status && "true"}"
                                            @change="${(e: Event) => this.handleStatus(status, e)}"
                                        >${this.t(`status-${status}`)}</pap-radio>
                                    `)}
                                </div>
                            </fieldset>
                        </pap-tabpanel>

                        <pap-tabpanel value="sound">
                            <pc-ringtone-picker @change="${this.handleTone}" @volume="${this.handleVolume}"></pc-ringtone-picker>
                            <pap-switch checked="${prefs?.autoDeclineBusy && "true"}" @change="${this.handleAutoDecline}">${this.t("auto-decline")}</pap-switch>
                        </pap-tabpanel>

                        <pap-tabpanel value="devices">
                            <div class="field">
                                <span>${this.t("microphone")}</span>
                                <pc-device-picker kind="audioinput" data-device="mic" @change="${this.handleMic}"></pc-device-picker>
                                <div class="preview">
                                    <pap-button size="small" variant="clear" data-kind="mic" @click="${this.handleTest}">${this.t("test-mic")}</pap-button>
                                    <pc-level-meter></pc-level-meter>
                                </div>
                            </div>
                            <div class="field">
                                <span>${this.t("camera")}</span>
                                <pc-device-picker kind="videoinput" data-device="camera" @change="${this.handleCamera}"></pc-device-picker>
                                <pap-button size="small" variant="clear" data-kind="camera" @click="${this.handleTest}">${this.t("test-camera")}</pap-button>
                                <div class="camera"><pc-video fit="cover"></pc-video></div>
                            </div>
                            <div class="field">
                                <span>${this.t("speaker")}</span>
                                <pc-device-picker kind="audiooutput" data-device="speaker" @change="${this.handleSpeaker}"></pc-device-picker>
                            </div>
                        </pap-tabpanel>

                        <pap-tabpanel value="appearance">
                            <div class="field">
                                <span>${this.t("theme")}</span>
                                <div class="row"><pap-theme-picker storage="local" @change="${this.handleTheme}"></pap-theme-picker></div>
                            </div>
                            <div class="field">
                                <span>${this.t("language")}</span>
                                <pc-language-picker @change="${this.handleLanguage}"></pc-language-picker>
                            </div>
                        </pap-tabpanel>

                        <pap-tabpanel value="notifications">
                            <pap-switch checked="${prefs?.notifications && "true"}" @change="${this.handleNotifications}">${this.t("notify")}</pap-switch>
                            <p class="hint">${this.t("notify-hint")}</p>
                        </pap-tabpanel>

                        ${this.shortcuts?.length ? html`
                            <pap-tabpanel value="shortcuts">
                                <dl class="shortcuts">
                                    ${this.shortcuts.map(item => html`<dt><kbd>${item.keys}</kbd></dt><dd>${item.label}</dd>`)}
                                </dl>
                            </pap-tabpanel>
                        ` : ""}
                    </pap-tabs>
                </div>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-settings": Settings;
    }
}
