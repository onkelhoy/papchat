// A small markdown subset for chat messages (T7.16a). Text is parsed into a tree and turned into DOM
// nodes with createElement and text nodes, so message text is never parsed as HTML. Anything the
// parser doesn't recognise stays literal text, and old clients just see the marks.
//
// Blocks:  ``` fenced code ```, "> " quotes, "- " / "* " bullets, "1. " numbered items, paragraphs.
// Inline:  **bold**, *italic*, __underline__, ~~strike~~, `code`, [label](https://…), bare http(s) links.

export type Inline =
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "link"; href: string; children: Inline[] }
    | { type: "strong" | "em" | "u" | "s"; children: Inline[] };

export type Block =
    | { type: "p"; children: Inline[] }
    | { type: "pre"; text: string }
    | { type: "quote"; children: Block[] }
    | { type: "ul" | "ol"; items: Inline[][] };

// quotes inside quotes stop nesting here; deeper ">" stay text
const MAX_QUOTE = 3;

const FENCE = /^\s*```/;
const QUOTE = /^\s*>\s?/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
// trailing punctuation that usually ends the sentence, not the URL
const TRAILING = /[.,;:!?)\]}'"]+$/;

// paired marks, longest first so ** wins over *
const MARKS: { mark: string; type: "strong" | "em" | "u" | "s" }[] = [
    { mark: "**", type: "strong" },
    { mark: "__", type: "u" },
    { mark: "~~", type: "s" },
    { mark: "*", type: "em" },
];

// ---------------------------------------------------------------- blocks

/** Parses message text into blocks. */
export function parse(text: string, depth = 0): Block[] {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const blocks: Block[] = [];
    let paragraph: string[] = [];

    const flush = () => {
        if (paragraph.length === 0) return;
        blocks.push({ type: "p", children: parseInline(paragraph.join("\n")) });
        paragraph = [];
    };

    for (let i = 0; i < lines.length; i++)
    {
        const line = lines[i];

        // fenced code: up to the closing fence, or to the end when it never closes
        if (FENCE.test(line))
        {
            flush();
            const code: string[] = [];
            i++;
            while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
            blocks.push({ type: "pre", text: code.join("\n") });
            continue;
        }

        if (depth < MAX_QUOTE && QUOTE.test(line))
        {
            flush();
            const quoted: string[] = [];
            while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(QUOTE, ""));
            i--;
            blocks.push({ type: "quote", children: parse(quoted.join("\n"), depth + 1) });
            continue;
        }

        const list = BULLET.test(line) ? BULLET : NUMBER.test(line) ? NUMBER : null;
        if (list)
        {
            flush();
            const items: Inline[][] = [];
            while (i < lines.length && list.test(lines[i]))
            {
                items.push(parseInline(lines[i].match(list)![1]));
                i++;
            }
            i--;
            blocks.push({ type: list === BULLET ? "ul" : "ol", items });
            continue;
        }

        paragraph.push(line);
    }
    flush();

    // a paragraph's outer blank lines are only spacing between blocks
    for (const block of blocks)
    {
        if (block.type === "p") trimText(block.children);
    }
    return blocks.filter(block => block.type !== "p" || block.children.length > 0);
}

function trimText(children: Inline[]) {
    const first = children[0];
    if (first?.type === "text") first.text = first.text.replace(/^\n+/, "");
    const last = children[children.length - 1];
    if (last?.type === "text") last.text = last.text.replace(/\n+$/, "");
    while (children[0]?.type === "text" && !(children[0] as { text: string }).text) children.shift();
    while (children.length && children[children.length - 1].type === "text" && !(children[children.length - 1] as { text: string }).text) children.pop();
}

// ---------------------------------------------------------------- inline

/** Parses inline marks, links and code in one paragraph or list item. */
export function parseInline(text: string): Inline[] {
    const out: Inline[] = [];
    let plain = "";
    const push = (node: Inline) => {
        if (plain) out.push(...linkify(plain));
        plain = "";
        out.push(node);
    };

    let i = 0;
    while (i < text.length)
    {
        const rest = text.slice(i);

        // `code`: nothing inside is parsed
        if (rest[0] === "`")
        {
            const end = text.indexOf("`", i + 1);
            if (end > i + 1)
            {
                push({ type: "code", text: text.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }

        // [label](http…)
        if (rest[0] === "[")
        {
            const link = rest.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)"'<>]+)\)/i);
            const href = link ? safeHref(link[2]) : null;
            if (link && href)
            {
                push({ type: "link", href, children: parseInline(link[1]).map(unlink) });
                i += link[0].length;
                continue;
            }
        }

        const paired = MARKS.find(({ mark }) => rest.startsWith(mark));
        if (paired)
        {
            const close = closing(text, i, paired.mark);
            if (close > 0)
            {
                push({ type: paired.type, children: parseInline(text.slice(i + paired.mark.length, close)) });
                i = close + paired.mark.length;
                continue;
            }
        }

        plain += text[i];
        i++;
    }
    if (plain) out.push(...linkify(plain));
    return out;
}

// where `mark` opened at `start` closes, or -1. The text inside must not start or end with a space,
// so "2 * 3 * 4" and "a ** b" stay plain; a single * must not be part of a ** pair
function closing(text: string, start: number, mark: string): number {
    const from = start + mark.length;
    if (from >= text.length || /\s/.test(text[from])) return -1;

    let at = text.indexOf(mark, from + 1);
    while (at > 0)
    {
        const single = mark.length === 1 && (text[at + 1] === mark || text[at - 1] === mark);
        if (!single && !/\s/.test(text[at - 1])) return at;
        at = text.indexOf(mark, at + 1);
    }
    return -1;
}

// a link label is text only: a bare URL inside it must not become a second link
function unlink(node: Inline): Inline {
    if (node.type === "link") return { type: "text", text: textOf(node.children) };
    if (node.type === "strong" || node.type === "em" || node.type === "u" || node.type === "s")
    {
        return { ...node, children: node.children.map(unlink) };
    }
    return node;
}

function textOf(nodes: Inline[]): string {
    return nodes.map(node => node.type === "text" || node.type === "code" ? node.text : textOf(node.children)).join("");
}

/** Splits plain text into text and bare-link nodes; trailing punctuation stays outside the link. */
export function linkify(text: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;

    for (const match of text.matchAll(URL_PATTERN))
    {
        const start = match.index ?? 0;
        let url = match[0];
        const trailing = url.match(TRAILING)?.[0] ?? "";
        if (trailing) url = url.slice(0, url.length - trailing.length);

        const href = safeHref(url);
        if (!href) continue;

        if (start > last) out.push({ type: "text", text: text.slice(last, start) });
        out.push({ type: "link", href, children: [{ type: "text", text: url }] });
        last = start + url.length;
    }

    if (last < text.length) out.push({ type: "text", text: text.slice(last) });
    return out;
}

// only absolute http(s) URLs with a host, as the browser itself parses them
function safeHref(raw: string): string | null {
    try
    {
        const url = new URL(raw);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname ? url.href : null;
    }
    catch
    {
        return null;
    }
}

// ---------------------------------------------------------------- DOM

/** Builds DOM for message text: elements and text nodes only, never HTML parsing. */
export function render(text: string, doc: Document = document): DocumentFragment {
    const fragment = doc.createDocumentFragment();
    for (const block of parse(text)) fragment.append(renderBlock(block, doc));
    return fragment;
}

function renderBlock(block: Block, doc: Document): Node {
    switch (block.type)
    {
        case "p":
            return element(doc, "p", block.children);
        case "pre":
        {
            const pre = doc.createElement("pre");
            const code = doc.createElement("code");
            code.textContent = block.text;
            pre.append(code);
            return pre;
        }
        case "quote":
        {
            const quote = doc.createElement("blockquote");
            for (const child of block.children) quote.append(renderBlock(child, doc));
            return quote;
        }
        case "ul":
        case "ol":
        {
            const list = doc.createElement(block.type);
            for (const item of block.items) list.append(element(doc, "li", item));
            return list;
        }
    }
}

function element(doc: Document, tag: string, children: Inline[]): HTMLElement {
    const el = doc.createElement(tag);
    for (const child of children) el.append(renderInline(child, doc));
    return el;
}

function renderInline(node: Inline, doc: Document): Node {
    switch (node.type)
    {
        case "text":
            return doc.createTextNode(node.text);
        case "code":
        {
            const code = doc.createElement("code");
            code.textContent = node.text;
            return code;
        }
        case "link":
        {
            const a = element(doc, "a", node.children) as HTMLAnchorElement;
            a.href = node.href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            return a;
        }
        default:
            return element(doc, node.type, node.children);
    }
}
