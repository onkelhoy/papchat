// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/radio";
import "@papit/button";
import "@papit/icon";

// local
import sheet from "./style.css" with { type: "css" };
import type { RingtoneChangeEvent, RingtonePreviewEvent, RingtoneVolumeEvent, Tone } from "./types";

/**
 * Radio list of ringtones, each with a play/stop preview button, plus a
 * volume slider. The component never plays audio: it emits `preview` and
 * `preview-stop`, the page plays the sound and reflects it back by setting
 * `playing` (so the button shows a stop icon).
 *
 * @element pc-ringtone-picker
 *
 * @property {Tone[]} tones the choices, `{ id, label }[]` (JSON in the `tones` attribute works too)
 * @property {string} value id of the selected tone
 * @property {number} volume 0 to 1 (default 1)
 * @property {string} playing id of the tone being previewed, set by the page
 *
 * @fires change `CustomEvent<{ value }>` another tone was selected (bubbles, composed)
 * @fires volume `CustomEvent<{ volume }>` the slider moved (bubbles, composed)
 * @fires preview `CustomEvent<{ id }>` play was pressed on a tone (bubbles, composed)
 * @fires preview-stop `CustomEvent<void>` stop was pressed on the playing tone (bubbles, composed)
 * @csspart list the radio group
 * @csspart volume the range input
 */
export class RingtonePicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-ringtone-picker");

    @property({ type: Array }) tones: Tone[] = [];
    @property({ type: String }) value: string = "";
    @property({ type: Number }) volume: number = 1;
    @property({ type: String }) playing: string = "";

    @bind
    private handleSelect(id: string, e: Event) {
        // our own event replaces the radio's `change`
        e.stopPropagation();
        if (!(e.currentTarget as HTMLInputElement).checked || this.value === id) return;

        this.value = id;
        this.dispatchEvent(new CustomEvent<RingtoneChangeEvent>("change", {
            detail: { value: id },
            bubbles: true,
            composed: true,
        }));
    }

    @bind
    private handleVolume(e: Event) {
        e.stopPropagation();
        const volume = Math.min(1, Math.max(0, Number((e.currentTarget as HTMLInputElement).value)));
        this.volume = volume;
        this.dispatchEvent(new CustomEvent<RingtoneVolumeEvent>("volume", {
            detail: { volume },
            bubbles: true,
            composed: true,
        }));
    }

    @bind
    private handlePreview(id: string) {
        if (this.playing === id)
        {
            this.dispatchEvent(new CustomEvent<void>("preview-stop", { bubbles: true, composed: true }));
            return;
        }

        this.dispatchEvent(new CustomEvent<RingtonePreviewEvent>("preview", {
            detail: { id },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const tones = Array.isArray(this.tones) ? this.tones : [];
        const volume = Number.isFinite(this.volume) ? this.volume : 1;

        return html`
            <div part="list" class="list" role="radiogroup" aria-label="${this.t("tones")}">
                ${tones.map(tone =>
                {
                    const playing = this.playing === tone.id;
                    return html`
                        <div class="row" key="${tone.id}">
                            <pap-radio
                                name="pc-ringtone-picker"
                                value="${tone.id}"
                                checked="${this.value === tone.id && "true"}"
                                @change="${(e: Event) => this.handleSelect(tone.id, e)}"
                            >${tone.label}</pap-radio>
                            <pap-button
                                size="icon"
                                variant="clear"
                                aria-label="${`${this.t(playing ? "stop" : "play")}: ${tone.label}`}"
                                aria-pressed="${String(playing)}"
                                @click="${() => this.handlePreview(tone.id)}"
                            >
                                <pap-icon name="${`/icons/spritesheet.svg#${playing ? "stop" : "play"}`}" width="20" height="20" aria-hidden="true"></pap-icon>
                            </pap-button>
                        </div>
                    `;
                })}
            </div>

            <label class="volume">
                <span class="label">${this.t("volume")}</span>
                <input
                    part="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value="${String(volume)}"
                    style="${`--_fill: ${Math.round(volume * 100)}%`}"
                    aria-valuetext="${`${Math.round(volume * 100)}%`}"
                    @input="${this.handleVolume}"
                />
                <span class="percent" aria-hidden="true">${`${Math.round(volume * 100)}%`}</span>
            </label>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-ringtone-picker": RingtonePicker;
    }
}
