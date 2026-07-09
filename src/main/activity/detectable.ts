/**
 * Bundled "detectable" database mapping running-process executables to
 * rich-presence activity metadata, detectable games list.
 *
 * This is intentionally a plain data module so it is trivial to extend. Each
 * entry lists the executable names to look for (case-insensitive, with or
 * without a `.exe` suffix — both are normalised away at match time). Icons are
 * resolved at detection time: a `steamAppId` yields official Steam capsule art,
 * otherwise an explicit `iconUrl` is used, otherwise the renderer falls back to
 * a generic per-type icon.
 *
 * `application_id` is a stable identifier used for de-duplication and as the
 * key the elapsed-time "started_at" is anchored to, so keep it unique/stable.
 */
export type ActivityType = 'game' | 'music' | 'app';

export interface DetectableEntry {
    application_id: string;
    name: string;
    type: ActivityType;
    /** Executable names to match against the running process list. */
    executables: string[];
    /** When set, official Steam capsule art is used for the icon. */
    steamAppId?: number;
    /** Explicit icon URL, used when there is no steamAppId. */
    iconUrl?: string;
}

export const DETECTABLE: DetectableEntry[] = [
    // ---- Games (icons via Steam CDN) -------------------------------------
    {
        application_id: 'steam-730',
        name: 'Counter-Strike 2',
        type: 'game',
        executables: ['cs2'],
        steamAppId: 730,
    },
    {
        application_id: 'steam-570',
        name: 'Dota 2',
        type: 'game',
        executables: ['dota2'],
        steamAppId: 570,
    },
    {
        application_id: 'steam-1172470',
        name: 'Apex Legends',
        type: 'game',
        executables: ['r5apex'],
        steamAppId: 1172470,
    },
    {
        application_id: 'steam-1086940',
        name: "Baldur's Gate 3",
        type: 'game',
        executables: ['bg3', 'bg3_dx11'],
        steamAppId: 1086940,
    },
    {
        application_id: 'steam-271590',
        name: 'Grand Theft Auto V',
        type: 'game',
        executables: ['gta5', 'gta5_enhanced', 'gtavlauncher'],
        steamAppId: 271590,
    },
    {
        application_id: 'minecraft',
        name: 'Minecraft',
        type: 'game',
        executables: ['minecraft', 'javaw', 'minecraftlauncher'],
        iconUrl:
            'https://www.minecraft.net/etc.clientlibs/minecraft/clientlibs/main/resources/img/menu/menu-buy--reversed.gif',
    },

    // ---- Music ------------------------------------------------------------
    {
        application_id: 'spotify',
        name: 'Spotify',
        type: 'music',
        executables: ['spotify'],
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/84/Spotify_icon.svg',
    },

    // ---- Apps -------------------------------------------------------------
    {
        application_id: 'vscode',
        name: 'Visual Studio Code',
        type: 'app',
        executables: ['code', 'code - insiders'],
        iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg',
    },
];

/** Official Steam capsule art for a given app id. */
export function steamCapsuleUrl(appId: number): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_184x69.jpg`;
}

/** Resolve the icon URL for an entry (Steam art > explicit URL > none). */
export function resolveIcon(entry: DetectableEntry): string | null {
    if (entry.steamAppId) {
        return steamCapsuleUrl(entry.steamAppId);
    }
    return entry.iconUrl ?? null;
}
