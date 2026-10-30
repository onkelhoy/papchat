// system
import { CustomElement, html, property, bind } from "@papit/web-component";
import { translate, translator, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/icon";
import "@papchat/progress";

// local
import sheet from "./style.css" with { type: "css" };
import type { CancelEvent, FileEntry } from "./types";

/**
 * Card for a shared file: type icon, name, size, progress while in flight,
 * Cancel while in flight, Download and a preview (image, video, audio) when done.
 *
 * The name is only ever rendered as text, never as HTML. Only `blob:` urls are
 * used for download and preview.
 *
 * @element pc-file-card
 *
 * @property {FileEntry} file the file and its transfer state
 * @property {boolean} mine  own file: right aligned on the primary colour
 *
 * @fires cancel { fid } the user cancelled an in-flight transfer
 *
 * @csspart card the card
 * @csspart preview the preview element
 * @cssprop --file-card-background
 * @cssprop --file-card-color
 * @cssprop --file-card-preview-height max preview height (default 16rem)
 */
export class FileCard extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-file-card");

    // object: set as a property (JSON attribute also works, see TASKS gotchas)
    @property({ type: Object, rerender: true }) file?: FileEntry;
    @property({ type: Boolean, reflect: true }) mine: boolean = false;

    @bind
    private handleCancel() {
        if (!this.file) return;
        this.dispatchEvent(new CustomEvent<CancelEvent>("cancel", { detail: { fid: this.file.fid }, bubbles: true, composed: true }));
    }

    private get inflight() {
        return this.file?.state === "sending" || this.file?.state === "receiving";
    }

    // only blob: urls are trusted for src/href
    private get url(): string | undefined {
        const url = this.file?.url;
        return typeof url === "string" && url.startsWith("blob:") ? url : undefined;
    }

    private get kind(): "image" | "video" | "audio" | "file" {
        const type = this.file?.type ?? "";
        if (type.startsWith("image/")) return "image";
        if (type.startsWith("video/")) return "video";
        if (type.startsWith("audio/")) return "audio";
        return "file";
    }

    private get icon() {
        switch (this.kind)
        {
            case "image": return "camera";
            case "video": return "play";
            case "audio": return "volume";
            default: return "paperclip";
        }
    }

    private renderPreview(url: string, name: string) {
        switch (this.kind)
        {
            case "image": return html`<img part="preview" src="${url}" alt="${name}" loading="lazy" />`;
            case "video": return html`<video part="preview" src="${url}" controls preload="metadata" aria-label="${name}"></video>`;
            case "audio": return html`<audio part="preview" src="${url}" controls preload="metadata" aria-label="${name}"></audio>`;
            default: return "";
        }
    }

    render() {
        const file = this.file;
        if (!file) return html``;

        const t = this.t;
        const name = file.name || t("unnamed");
        const url = this.url;
        const done = file.state === "done" && url;
        const progress = typeof file.progress === "number" && Number.isFinite(file.progress) ? file.progress : undefined;
        const status = file.state === "done" ? "" : t(file.state);

        return html`
            <div part="card" class="card">
                <div class="row">
                    <pap-icon class="type" name="${`/icons/${this.icon}.svg`}" aria-hidden="true"></pap-icon>
                    <div class="info">
                        <span class="name" title="${name}">${name}</span>
                        <span class="meta">
                            <span>${formatSize(file.size, translator.locale() ?? undefined)}</span>
                            ${status ? html`<span class="status" data-state="${file.state}">${status}</span>` : ""}
                        </span>
                    </div>
                    ${this.inflight ? html`
                        <pap-button size="small" variant="outline" color="secondary" type="button" @click="${this.handleCancel}">${t("cancel")}</pap-button>
                    ` : ""}
                    ${done ? html`
                        <a class="download" href="${url}" download="${name}" aria-label="${`${t("download")}: ${name}`}">
                            <pap-icon name="/icons/download.svg" aria-hidden="true"></pap-icon>
                            <span>${t("download")}</span>
                        </a>
                    ` : ""}
                </div>
                ${this.inflight ? html`<pc-progress label="${name}" value="${progress}"></pc-progress>` : ""}
                ${done ? this.renderPreview(url as string, name) : ""}
            </div>
        `;
    }
}

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"];

// 1536 → "1.5 kB", 100 MB → "100 MB"
export function formatSize(bytes: number, locale?: string): string {
    let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    let unit = 0;
    while (value >= 1000 && unit < UNITS.length - 1)
    {
        value /= 1000;
        unit++;
    }
    return new Intl.NumberFormat(locale, { style: "unit", unit: UNITS[unit], unitDisplay: "short", maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-file-card": FileCard;
    }
}
