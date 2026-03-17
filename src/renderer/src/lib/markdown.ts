import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
export const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

function encodeForAttr(raw: string): string {
    return raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCodeBlock(highlightedCode: string, rawCode: string, langLabel: string): string {
    return (
        `<div class="code-block-wrapper">` +
        `<div class="code-block-header">` +
        `<span class="code-block-lang">${langLabel}</span>` +
        `<button class="code-block-copy" data-code="${encodeForAttr(rawCode)}" title="Copy code">${copyIcon}</button>` +
        `</div>` +
        `<pre class="hljs"><code>${highlightedCode}</code></pre>` +
        `</div>`
    );
}

const md: MarkdownIt = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight(str: string, lang: string): string {
        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value;
                return buildCodeBlock(highlighted, str, lang);
            } catch {
                // fall through
            }
        }
        return buildCodeBlock(md.utils.escapeHtml(str), str, lang || 'code');
    },
});

const defaultRender = md.renderer.rules.link_open || md.renderer.renderToken.bind(md.renderer);

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return defaultRender(tokens, idx, options, env, self);
};

const ALLOWED_TAGS = [
    'p',
    'br',
    'strong',
    'em',
    'del',
    's',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'span',
    'div',
    'button',
    'svg',
    'rect',
    'path',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
];

const ALLOWED_ATTR = [
    'class',
    'href',
    'target',
    'rel',
    'data-mention',
    'data-code',
    'title',
    'xmlns',
    'width',
    'height',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'd',
    'x',
    'y',
    'rx',
    'ry',
];

export function renderMarkdown(text: string): string {
    const rendered = md.render(text);
    return DOMPurify.sanitize(rendered, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
    });
}

function applyMentionsToHtml(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            let parent = node.parentElement;
            while (parent && parent !== container) {
                if (parent.tagName === 'CODE' || parent.tagName === 'PRE') {
                    return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) {
        textNodes.push(current as Text);
    }

    for (const textNode of textNodes) {
        const text = textNode.textContent ?? '';
        if (!/@\w+/.test(text)) continue;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        const regex = /@(everyone|here|\w+)/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const name = match[1];
            const isSpecial = name === 'everyone' || name === 'here';
            const span = document.createElement('span');
            span.className = isSpecial
                ? 'mention mention-special cursor-pointer rounded bg-primary/20 px-1 py-0.5 font-medium text-primary hover:bg-primary/30'
                : 'mention mention-user cursor-pointer rounded bg-primary/20 px-1 py-0.5 font-medium text-primary hover:bg-primary/30';
            span.dataset.mention = name;
            span.textContent = match[0];
            fragment.appendChild(span);
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return container.innerHTML;
}

export function renderMarkdownWithMentions(text: string): string {
    const rendered = md.render(text);
    const withMentions = applyMentionsToHtml(rendered);
    return DOMPurify.sanitize(withMentions, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
    });
}
