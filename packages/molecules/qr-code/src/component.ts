// system
import { CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };
import { encodeQr } from "./qr";

const QUIET_ZONE = 4;
const SVG = "http://www.w3.org/2000/svg";

/**
 * A QR code of `value` as an SVG, with its quiet zone. It's generated here, nothing leaves the
 * browser. Too much data for a QR code shows a message instead.
 *
 * @element pc-qr-code
 *
 * @property {string} value the text to encode
 * @property {string} label what the code is, for screen readers
 *
 * @csspart code the element holding the SVG
 * @csspart error the message shown when `value` doesn't fit
 */
export class QrCode extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-qr-code");

    @property({ type: String, rerender: true }) value: string = "";
    @property({ type: String, rerender: true }) label: string = "";

    @query("[part='code']") private code?: HTMLElement;

    private drawn: string | null = null;
    private fits = true;

    update() {
        const matrix = this.value === this.drawn ? undefined : encodeQr(this.value);
        if (matrix !== undefined) this.fits = matrix !== null;
        super.update();

        if (matrix === undefined || !this.code) return undefined;
        this.drawn = this.value;
        this.code.replaceChildren(...(matrix && this.value ? [this.draw(matrix.size, matrix.modules)] : []));
        return undefined;
    }

    // one path, not a rect per module: a long link has thousands of them
    private draw(size: number, modules: boolean[]): SVGSVGElement {
        const svg = document.createElementNS(SVG, "svg");
        svg.setAttribute("viewBox", `0 0 ${size + QUIET_ZONE * 2} ${size + QUIET_ZONE * 2}`);
        svg.setAttribute("shape-rendering", "crispEdges");

        let d = "";
        modules.forEach((dark, i) => {
            if (dark) d += `M${i % size + QUIET_ZONE} ${Math.floor(i / size) + QUIET_ZONE}h1v1h-1z`;
        });
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("d", d);
        svg.append(path);
        return svg;
    }

    render() {
        return html`
            <div part="code" class="code" role="img" aria-label="${this.label || this.t("label")}"></div>
            ${this.fits ? "" : html`<p part="error" class="error" role="alert">${this.t("too-long")}</p>`}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-qr-code": QrCode;
    }
}
