<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { Check, Copy, Link2, Plus, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { createInviteLink, deleteInviteLink } from '@/api/settings';
import { findIncluded } from '@/api/types';
import type { UserResource } from '@/api/types';
import { inviteLinksQuery } from '@/queries/settings/invite-links';
import { SETTINGS_KEYS } from '@/queries/keys';

type InviteLink = {
    id: string;
    token: string;
    expires_at: string | null;
    used_at: string | null;
    creator: { id: string; name: string; username: string } | null;
    used_by_user: { id: string; name: string; username: string } | null;
    created_at: string;
};

const queryCache = useQueryCache();
const { data: rawData, isLoading } = useQuery(inviteLinksQuery);

const inviteLinks = computed<InviteLink[]>(() => {
    if (!rawData.value?.data) return [];
    return rawData.value.data.map((res) => {
        const creatorRel = res.relationships?.creator?.data;
        const usedByRel = res.relationships?.usedByUser?.data;
        const creator = creatorRel && !Array.isArray(creatorRel)
            ? findIncluded<UserResource>(rawData.value!.included, 'users', creatorRel.id)
            : undefined;
        const usedBy = usedByRel && !Array.isArray(usedByRel)
            ? findIncluded<UserResource>(rawData.value!.included, 'users', usedByRel.id)
            : undefined;
        return {
            id: res.id,
            token: res.attributes.token,
            expires_at: res.attributes.expires_at,
            used_at: res.attributes.used_at,
            creator: creator
                ? { id: creator.id, name: creator.attributes.name ?? '', username: creator.attributes.username }
                : null,
            used_by_user: usedBy
                ? { id: usedBy.id, name: usedBy.attributes.name ?? '', username: usedBy.attributes.username }
                : null,
            created_at: res.attributes.created_at,
        };
    });
});

const { copy, copied, text: copiedText } = useClipboard();

const { mutateAsync: doGenerateLink } = useMutation({
    mutation: () => createInviteLink(),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.inviteLinks() }),
});

const { mutateAsync: doDeleteLink } = useMutation({
    mutation: (id: string) => deleteInviteLink(id),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.inviteLinks() }),
});

async function generateLink() {
    try {
        await doGenerateLink();
    } catch {
        // handle
    }
}

async function deleteLink(inviteLink: InviteLink) {
    try {
        await doDeleteLink(inviteLink.id);
    } catch {
        // handle
    }
}

function copyToken(token: string) {
    copy(token);
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
}

function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
}

function getStatus(link: InviteLink): 'used' | 'expired' | 'active' {
    if (link.used_at) return 'used';
    if (link.expires_at && isExpired(link.expires_at)) return 'expired';
    return 'active';
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">Invite Links</h2>
                    <p class="text-muted-foreground mt-1 text-sm">
                        Generate single-use invite links for new members. Links expire after 1 hour.
                    </p>
                </div>
                <Button @click="generateLink" size="sm">
                    <Plus class="mr-1.5 h-4 w-4" />
                    Generate
                </Button>
            </div>

            <div class="p-6">
                <div v-if="isLoading" class="text-muted-foreground text-sm">Loading...</div>

                <div
                    v-else-if="inviteLinks.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <Link2 class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">No invite links yet</p>
                    <p class="text-muted-foreground mt-1 text-sm">Generate a link to invite someone to register.</p>
                </div>

                <div v-else class="space-y-3">
                    <div
                        v-for="link in inviteLinks"
                        :key="link.id"
                        :class="[
                            'flex items-center justify-between gap-4 rounded-lg border p-4',
                            getStatus(link) === 'active'
                                ? 'border-border bg-background'
                                : 'border-border/50 bg-muted/30',
                        ]"
                    >
                        <div class="min-w-0 flex-1 space-y-1">
                            <div class="flex items-center gap-2">
                                <code class="text-muted-foreground truncate text-xs">
                                    {{ link.token }}
                                </code>
                            </div>
                            <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                                <span>Created {{ formatDate(link.created_at) }}</span>
                                <span>&middot;</span>
                                <span>Expires {{ link.expires_at ? formatDate(link.expires_at) : 'Never' }}</span>
                                <template v-if="link.used_by_user">
                                    <span>&middot;</span>
                                    <span
                                        >Used by <strong>{{ link.used_by_user.name }}</strong></span
                                    >
                                </template>
                            </div>
                        </div>

                        <div class="flex shrink-0 items-center gap-2">
                            <Badge
                                :variant="
                                    getStatus(link) === 'active'
                                        ? 'default'
                                        : getStatus(link) === 'used'
                                          ? 'secondary'
                                          : 'destructive'
                                "
                            >
                                {{
                                    getStatus(link) === 'active'
                                        ? 'Active'
                                        : getStatus(link) === 'used'
                                          ? 'Used'
                                          : 'Expired'
                                }}
                            </Badge>

                            <Button
                                v-if="getStatus(link) === 'active'"
                                variant="ghost"
                                size="icon"
                                @click="copyToken(link.token)"
                                class="h-8 w-8"
                            >
                                <Check v-if="copied && copiedText === link.token" class="h-4 w-4 text-green-500" />
                                <Copy v-else class="h-4 w-4" />
                            </Button>

                            <Button
                                v-if="!link.used_at"
                                variant="ghost"
                                size="icon"
                                @click="deleteLink(link)"
                                class="text-destructive hover:text-destructive h-8 w-8"
                            >
                                <Trash2 class="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
