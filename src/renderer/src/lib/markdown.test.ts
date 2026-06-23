import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownWithMentions } from './markdown';

describe('renderMarkdown (sanitization)', () => {
    it('never emits an executable <script> element', () => {
        // html:false escapes raw HTML to inert text, so the payload survives as
        // harmless escaped text but must never become a real element.
        const html = renderMarkdown('hello <script>alert(1)</script> world');
        expect(html).not.toContain('<script');
    });

    it('never emits a raw <img> element with an event handler', () => {
        const html = renderMarkdown('<img src=x onerror="alert(1)">');
        expect(html).not.toContain('<img');
    });

    it('never produces an anchor with a javascript: href', () => {
        const html = renderMarkdown('[click](javascript:alert(1))');
        expect(html.toLowerCase()).not.toContain('href="javascript');
    });

    it('renders allowed inline formatting', () => {
        const html = renderMarkdown('**bold** and `code`');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<code>code</code>');
    });

    it('adds target=_blank and rel=noopener to links', () => {
        const html = renderMarkdown('[site](https://example.com)');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('wraps fenced code blocks with a copy button', () => {
        const html = renderMarkdown('```js\nconst a = 1;\n```');
        expect(html).toContain('code-block-wrapper');
        expect(html).toContain('code-block-copy');
    });
});

describe('renderMarkdownWithMentions', () => {
    it('wraps @user mentions in a mention span', () => {
        const html = renderMarkdownWithMentions('hey @alice');
        expect(html).toContain('data-mention="alice"');
        expect(html).toContain('mention-user');
    });

    it('marks @everyone and @here as special mentions', () => {
        expect(renderMarkdownWithMentions('@everyone')).toContain('mention-special');
        expect(renderMarkdownWithMentions('@here')).toContain('mention-special');
    });

    it('does NOT mentionify inside code spans', () => {
        const html = renderMarkdownWithMentions('`@alice`');
        expect(html).not.toContain('data-mention');
    });

    it('does NOT mentionify inside fenced code blocks', () => {
        const html = renderMarkdownWithMentions('```\n@alice\n```');
        expect(html).not.toContain('data-mention');
    });

    it('still sanitizes scripts when applying mentions', () => {
        const html = renderMarkdownWithMentions('@alice <script>alert(1)</script>');
        expect(html).not.toContain('<script');
        expect(html).toContain('data-mention="alice"');
    });
});
