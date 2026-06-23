import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageListSkeleton from './MessageListSkeleton.vue';

const stubs = {
    Skeleton: { template: '<div data-stub="skeleton" :style="$attrs.style" />' },
};

function mountSkeleton(rows?: number) {
    return mount(MessageListSkeleton, {
        props: rows === undefined ? {} : { rows },
        global: { stubs },
    });
}

describe('MessageListSkeleton', () => {
    it('renders the default number of rows (16)', () => {
        const wrapper = mountSkeleton();
        // Each row has one avatar skeleton, so the row count equals the number
        // of top-level row containers.
        const rows = wrapper.findAll('[aria-hidden="true"] > div');
        expect(rows).toHaveLength(16);
    });

    it('renders the requested number of rows', () => {
        const wrapper = mountSkeleton(5);
        const rows = wrapper.findAll('[aria-hidden="true"] > div');
        expect(rows).toHaveLength(5);
    });

    it('is hidden from assistive technology', () => {
        const wrapper = mountSkeleton(2);
        expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
    });

    it('adds a second body line on roughly every third row (i % 3 === 1)', () => {
        // With 4 rows, indices 1 produces a two-line row (1 % 3 === 1).
        // Row layout per row: avatar + name + timeBadge + line (+ optional second line).
        // Two-line rows therefore have 5 skeletons, single-line rows have 4.
        const wrapper = mountSkeleton(4);
        const rows = wrapper.findAll('[aria-hidden="true"] > div');
        const skeletonCounts = rows.map((row) => row.findAll('[data-stub="skeleton"]').length);
        expect(skeletonCounts).toEqual([4, 5, 4, 4]);
    });

    it('applies a deterministic, varied line width per row', () => {
        const wrapper = mountSkeleton(3);
        const rows = wrapper.findAll('[aria-hidden="true"] > div');
        // The third skeleton in each row is the primary body line (avatar, name,
        // time badge precede it). widths[i % widths.length] => row0 '62%', row1 '85%'.
        const bodyLine = (rowIndex: number) => rows[rowIndex].findAll('[data-stub="skeleton"]')[3].attributes('style');
        expect(bodyLine(0)).toContain('62%');
        expect(bodyLine(2)).toContain('45%');
    });

    it('renders nothing-but-container for zero rows', () => {
        const wrapper = mountSkeleton(0);
        expect(wrapper.findAll('[aria-hidden="true"] > div')).toHaveLength(0);
    });
});
