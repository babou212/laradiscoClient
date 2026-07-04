<script setup lang="ts">
import { Volume2, Monitor, MicOff, VolumeOff } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { moveVoiceMember } from '@/api/voice';
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

// Hidden entirely under a minute; mm:ss once a minute has passed; hh:mm:ss once an hour has.
function formatElapsed(totalSeconds: number): string | null {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    if (seconds < 60) return null;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

// Live elapsed-time counter — re-evaluated each tick via the `now` ref.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
    timer = setInterval(() => {
        now.value = Date.now();
    }, 1000);
});

onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
});

const isSelf = (participant: VoiceParticipant): boolean =>
    !!authStore.user && String(participant.id) === String(authStore.user.id);

const isCurrentChannel = computed(() => {
    return voiceStore.currentChannel?.id === Number(props.channel.id);
});

const isAfkChannel = computed(() => Number(props.channel.id) === serverStore.afkChannelId);

const canMoveMembers = computed(
    () => !!authStore.user?.permissions?.canMoveMembers || !!authStore.user?.permissions?.isAdministrator,
);

const isDragOver = ref(false);

type VoiceMoveDragPayload = { userId: string | number; fromChannelId: string };

const handleParticipantDragStart = (event: DragEvent, participant: VoiceParticipant): void => {
    if (!canMoveMembers.value || isAfkChannel.value) return;
    const payload: VoiceMoveDragPayload = { userId: participant.id, fromChannelId: props.channel.id };
    event.dataTransfer?.setData('application/json', JSON.stringify(payload));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
};

const handleChannelDragOver = (event: DragEvent): void => {
    if (!canMoveMembers.value || isAfkChannel.value) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
};

const handleChannelDragEnter = (): void => {
    if (!canMoveMembers.value || isAfkChannel.value) return;
    isDragOver.value = true;
};

const handleChannelDragLeave = (): void => {
    isDragOver.value = false;
};

const handleChannelDrop = (event: DragEvent): void => {
    isDragOver.value = false;
    if (!canMoveMembers.value || isAfkChannel.value) return;

    const raw = event.dataTransfer?.getData('application/json');
    if (!raw) return;

    let payload: VoiceMoveDragPayload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return;
    }

    if (payload.fromChannelId === props.channel.id) return;

    moveVoiceMember(Number(payload.fromChannelId), Number(props.channel.id), payload.userId).catch(() => {});
};
const elapsedText = computed<string | null>(() => {
    if (isAfkChannel.value) return null;
    const startedAt = voiceStore.getChannelStartedAt(Number(props.channel.id));
    if (startedAt === null) return null;
    return formatElapsed(now.value / 1000 - startedAt);
});

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
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors select-none"
            :class="[buttonClasses, isDragOver ? 'ring-primary ring-2' : '']"
            @click="handleClick"
            @dragover="handleChannelDragOver"
            @dragenter="handleChannelDragEnter"
            @dragleave="handleChannelDragLeave"
            @drop="handleChannelDrop"
        >
            <Volume2 :size="16" class="shrink-0" />
            <span class="truncate">{{ channel.name }}</span>
            <span v-if="elapsedText" class="text-sidebar-foreground/50 ml-auto shrink-0 text-xs tabular-nums">{{
                elapsedText
            }}</span>
        </button>

        <div v-if="channelParticipants.length > 0" class="ml-6 space-y-0.5 py-0.5">
            <DropdownMenu v-for="participant in channelParticipants" :key="participant.id">
                <DropdownMenuTrigger as-child>
                    <div
                        class="hover:bg-sidebar-accent/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors select-none"
                        :draggable="canMoveMembers && !isAfkChannel"
                        @dragstart="(e) => handleParticipantDragStart(e, participant)"
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
