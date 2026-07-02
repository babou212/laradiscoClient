<script setup lang="ts">
import { Volume2, Monitor, MicOff, VolumeOff } from 'lucide-vue-next';
import { computed } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';
import { useUsersStore } from '@/stores/users';
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice';

type Props = {
    channel: {
        id: string;
        name: string;
        topic: string | null;
        type: string;
    };
    categoryId: string;
};

const props = defineProps<Props>();

const voiceStore = useVoiceStore();
const usersStore = useUsersStore();
const authStore = useAuthStore();
const serverStore = useServerStore();

const isSelf = (participant: VoiceParticipant): boolean =>
    !!authStore.user && String(participant.id) === String(authStore.user.id);

const isCurrentChannel = computed(() => {
    return voiceStore.currentChannel?.id === Number(props.channel.id);
});

const isAfkChannel = computed(() => Number(props.channel.id) === serverStore.afkChannelId);

const channelParticipants = computed<VoiceParticipant[]>(() => {
    if (isCurrentChannel.value) {
        return voiceStore.currentParticipants;
    }
    return voiceStore.getChannelParticipants(Number(props.channel.id));
});

const buttonClasses = computed(() =>
    isCurrentChannel.value
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
);

const handleClick = () => {
    if (isCurrentChannel.value) return;

    if (isAfkChannel.value) return;
    voiceStore.joinChannel(Number(props.channel.id), props.channel.name);
};

const handleScreenShareClick = (participant: VoiceParticipant) => {
    voiceStore.activeScreenShareView = String(participant.id);
};
</script>

<template>
    <div>
        <button
            type="button"
            data-context-channel
            :data-channel-id="channel.id"
            :data-category-id="categoryId"
            :data-channel-type="channel.type"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
            :class="buttonClasses"
            @click="handleClick"
        >
            <Volume2 :size="16" class="shrink-0" />
            <span class="truncate">{{ channel.name }}</span>
        </button>

        <div v-if="channelParticipants.length > 0" class="ml-6 space-y-0.5 py-0.5">
            <DropdownMenu v-for="participant in channelParticipants" :key="participant.id">
                <DropdownMenuTrigger as-child>
                    <div
                        class="hover:bg-sidebar-accent/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors"
                    >
                        <Avatar
                            class="size-6 shrink-0 transition-all duration-200"
                            :class="participant.isSpeaking ? 'ring-2 ring-green-500' : ''"
                        >
                            <AvatarImage
                                v-if="usersStore.avatarUrl(String(participant.id), 'thumb')"
                                :src="usersStore.avatarUrl(String(participant.id), 'thumb')!"
                                :alt="participant.displayName"
                            />
                            <AvatarFallback
                                class="text-xs font-semibold"
                                :class="
                                    participant.isSpeaking
                                        ? 'bg-green-600 text-white'
                                        : 'bg-primary text-primary-foreground'
                                "
                            >
                                {{
                                    usersStore
                                        .displayName(String(participant.id), participant.displayName)?.[0]
                                        ?.toUpperCase() || 'U'
                                }}
                            </AvatarFallback>
                        </Avatar>
                        <span
                            class="text-sidebar-foreground/70 truncate text-xs"
                            :class="{ 'text-sidebar-foreground': participant.isSpeaking }"
                        >
                            {{
                                usersStore.displayName(
                                    String(participant.id),
                                    participant.displayName || participant.username,
                                )
                            }}
                        </span>
                        <div class="ml-auto flex shrink-0 items-center gap-1">
                            <Monitor
                                v-if="participant.isScreenSharing"
                                :size="12"
                                class="cursor-pointer text-green-400 hover:text-green-300"
                                @click.stop="handleScreenShareClick(participant)"
                            />
                            <VolumeOff
                                v-if="isSelf(participant) && voiceStore.isSoundMuted"
                                :size="12"
                                class="text-red-400"
                            />
                            <MicOff v-if="participant.isMuted" :size="12" class="text-red-400" />
                        </div>
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent v-if="!isSelf(participant)" class="w-56">
                    <DropdownMenuLabel class="truncate">
                        {{
                            usersStore.displayName(
                                String(participant.id),
                                participant.displayName || participant.username,
                            )
                        }}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div class="px-2 py-1.5" @pointerdown.stop @keydown.stop>
                        <div class="text-muted-foreground mb-1.5 flex justify-between text-xs">
                            <span>User Volume</span>
                            <span>{{ Math.round(voiceStore.getUserVolume(String(participant.id)) * 100) }}%</span>
                        </div>
                        <Slider
                            :model-value="[voiceStore.getUserVolume(String(participant.id))]"
                            :min="0"
                            :max="2"
                            :step="0.05"
                            @update:model-value="(v) => voiceStore.setUserVolume(String(participant.id), v?.[0] ?? 1)"
                        />
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </div>
</template>
