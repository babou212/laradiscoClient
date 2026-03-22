<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { Check, Copy, Link2, Plus, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

type InviteLink = {
    id: number;
    token: string;
    expires_at: string;
    used_at: string | null;
    creator: { id: number; name: string; username: string } | null;
    used_by_user: { id: number; name: string; username: string } | null;
    created_at: string;
};

const inviteLinks = ref<InviteLink[]>([]);
const isLoading = ref(true);

const { copy, copied, text: copiedText } = useClipboard();

onMounted(async () => {
    await loadLinks();
});

async function loadLinks() {
    isLoading.value = true;
    try {
        const response = await api.get('/settings/invite-links');
        inviteLinks.value = response.data?.invite_links ?? response.data ?? [];
    } catch {
        // handle
    } finally {
        isLoading.value = false;
    }
}

async function generateLink() {
    try {
        const response = await api.post('/settings/invite-links');
        inviteLinks.value.unshift(response.data);
    } catch {
        // handle
    }
}

async function deleteLink(inviteLink: InviteLink) {
    try {
        await api.delete(`/settings/invite-links/${inviteLink.id}`);
        inviteLinks.value = inviteLinks.value.filter((l) => l.id !== inviteLink.id);
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
    if (isExpired(link.expires_at)) return 'expired';
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
                                <span>Expires {{ formatDate(link.expires_at) }}</span>
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
