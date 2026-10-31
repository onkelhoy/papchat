// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";

// local
import sheet from "./style.css" with { type: "css" };

const COPIED_MS = 2_000;

/**
 * Button that hands over an invite link: the share sheet on phones (so Messages is one tap away),
 * the clipboard elsewhere. It says "Copied" itself, because toasts sit behind modal dialogs. Without
 * a clipboard (plain http on a phone) a prompt shows the link.
 *
 * @element pc-share-link
 *
 * @property {string} link the link to share
 * @property {boolean} compact short "Invite" label on a clear button, for the header (reflected)
 */
export class ShareLink extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-share-link");

    @property({ type: String, rerender: true }) link: string = "";
    @property({ type: Boolean, reflect: true, rerender: true }) compact: boolean = false;
    @property({ type: Boolean, attribute: false, rerender: true }) private copied: boolean = false;

    private timer: ReturnType<typeof setTimeout> | undefined;

    private get sheetted(): boolean {
        return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
    }

    @bind
    private async handleClick() {
        if (this.sheetted)
        {
            // closing the sheet rejects, and that's fine
            await navigator.share({ url: this.link }).catch(() => undefined);
            return;
        }
        try
        {
            await navigator.clipboard.writeText(this.link);
        }
        catch
        {
            window.prompt(this.t("copy"), this.link);
            return;
        }
        this.copied = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.copied = false; }, COPIED_MS);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this.timer);
    }

    private get label(): string {
        if (this.copied) return this.t("copied");
        if (this.compact) return this.t("compact");
        return this.t(this.sheetted ? "share" : "copy");
    }

    render() {
        return html`
            <pap-button size="small" variant="${this.compact ? "clear" : "outline"}" type="button" @click="${this.handleClick}">${this.label}</pap-button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-share-link": ShareLink;
    }
}
