import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerStore } from './server';

const CONN = { id: 1, name: 'S', host: 'example.com', is_active: true, created_at: '2026-01-01' };

beforeEach(() => {
    setActivePinia(createPinia());
});

describe('getters', () => {
    it('reports connection state and active host', () => {
        const server = useServerStore();
        expect(server.isConnected).toBe(false);
        expect(server.activeHost).toBeNull();
        server.activeServer = { ...CONN };
        expect(server.isConnected).toBe(true);
        expect(server.activeHost).toBe('example.com');
    });
});

describe('loadActiveServer / loadAllServers', () => {
    it('reads the active server from the bridge', async () => {
        window.api.server.getActive = vi.fn().mockResolvedValue(CONN);
        const server = useServerStore();
        await server.loadActiveServer();
        expect(server.activeServer).toEqual(CONN);
    });

    it('reads all servers from the bridge', async () => {
        window.api.server.getAll = vi.fn().mockResolvedValue([CONN]);
        const server = useServerStore();
        await server.loadAllServers();
        expect(server.servers).toEqual([CONN]);
    });
});

describe('pingServer', () => {
    it('captures the reverb config on success', async () => {
        const reverb = { key: 'k', host: 'h', port: 443, scheme: 'https' };
        window.api.server.ping = vi.fn().mockResolvedValue({ success: true, data: { reverb } });
        const server = useServerStore();
        const result = await server.pingServer('example.com');
        expect(result.success).toBe(true);
        expect(server.reverbConfig).toEqual(reverb);
        expect(server.isConnecting).toBe(false);
    });

    it('records a connection error on failure', async () => {
        window.api.server.ping = vi.fn().mockResolvedValue({ success: false, error: 'unreachable' });
        const server = useServerStore();
        await server.pingServer('example.com');
        expect(server.connectionError).toBe('unreachable');
    });
});

describe('saveConnection', () => {
    it('sets active server and refreshes the list on success', async () => {
        window.api.server.save = vi.fn().mockResolvedValue({ success: true, connection: CONN });
        window.api.server.getAll = vi.fn().mockResolvedValue([CONN]);
        const server = useServerStore();
        const result = await server.saveConnection('S', 'example.com');
        expect(result).toEqual(CONN);
        expect(server.activeServer).toEqual(CONN);
        expect(server.servers).toEqual([CONN]);
    });

    it('returns null when save fails', async () => {
        window.api.server.save = vi.fn().mockResolvedValue({ success: false });
        const server = useServerStore();
        expect(await server.saveConnection('S', 'h')).toBeNull();
    });
});

describe('removeServer', () => {
    it('clears the active server when it is the one removed', async () => {
        window.api.server.remove = vi.fn().mockResolvedValue({ success: true });
        window.api.server.getAll = vi.fn().mockResolvedValue([]);
        const server = useServerStore();
        server.activeServer = { ...CONN };
        await server.removeServer(1);
        expect(server.activeServer).toBeNull();
    });
});
