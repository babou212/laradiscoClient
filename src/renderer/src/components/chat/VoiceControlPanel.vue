<script setup lang="ts">
import { Mic, MicOff, Volume2, VolumeOff, PhoneOff, MonitorUp, MonitorOff } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useVoiceStore } from '@/stores/voice';

const voiceStore = useVoiceStore();
const { t } = useI18n();

function toggleScreenShare() {
    if (voiceStore.isScreenSharing) {
        voiceStore.stopScreenShare();
    } else {
        voiceStore.startScreenShare();
    }
}

const qualityInfo = computed(() => {
    switch (voiceStore.connectionQuality) {
        case 'excellent':
            return { bars: 3, color: 'text-green-500', label: t('chat.voice.connected') };
        case 'good':
            return { bars: 2, color: 'text-green-500', label: t('chat.voice.connected') };
        case 'poor':
            return { bars: 1, color: 'text-yellow-500', label: t('chat.voice.poorConnection') };
        case 'lost':
            return { bars: 0, color: 'text-red-500', label: t('chat.voice.connectionLost') };
        default:
            return { bars: 3, color: 'text-green-500', label: t('chat.voice.connected') };
    }
});
</script>

<template>
    <div v-if="voiceStore.isConnected" class="border-sidebar-border border-t bg-black/20 px-3 pt-2 pb-1">
        <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-1.5">
                <!-- Signal strength bars -->
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" :class="qualityInfo.color">
                    <rect x="1" y="11" width="3" height="4" rx="0.5" :opacity="qualityInfo.bars >= 1 ? 1 : 0.2" />
                    <rect x="6" y="7" width="3" height="8" rx="0.5" :opacity="qualityInfo.bars >= 2 ? 1 : 0.2" />
                    <rect x="11" y="3" width="3" height="12" rx="0.5" :opacity="qualityInfo.bars >= 3 ? 1 : 0.2" />
                </svg>
                <span class="text-xs font-semibold" :class="qualityInfo.color">
                    {{ qualityInfo.label }}
                </span>
            </div>
            <SimpleTooltip :content="t('chat.voice.disconnect')">
                <button
                    type="button"
                    class="text-sidebar-foreground/50 hover:text-sidebar-foreground flex size-7 items-center justify-center rounded transition-colors hover:bg-white/10"
                    @click="voiceStore.leaveChannel()"
                >
                    <PhoneOff :size="15" />
                </button>
            </SimpleTooltip>
        </div>

        <!-- Channel name -->
        <div class="text-sidebar-foreground/50 mb-2 truncate text-xs">
            {{ voiceStore.currentChannel?.name }}
        </div>

        <!-- Control buttons row -->
        <div class="flex items-center gap-1">
            <SimpleTooltip :content="voiceStore.isMicMuted ? t('chat.voice.unmute') : t('chat.voice.mute')">
                <button
                    type="button"
                    class="flex h-7 flex-1 items-center justify-center rounded transition-colors"
                    :class="
                        voiceStore.isMicMuted
                            ? 'bg-white/10 text-red-400 hover:bg-white/15'
                            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground bg-white/5 hover:bg-white/10'
                    "
                    @click="voiceStore.toggleMic()"
                >
                    <MicOff v-if="voiceStore.isMicMuted" :size="15" />
                    <Mic v-else :size="15" />
                </button>
            </SimpleTooltip>

            <SimpleTooltip :content="voiceStore.isSoundMuted ? t('chat.voice.undeafen') : t('chat.voice.deafen')">
                <button
                    type="button"
                    class="flex h-7 flex-1 items-center justify-center rounded transition-colors"
                    :class="
                        voiceStore.isSoundMuted
                            ? 'bg-white/10 text-red-400 hover:bg-white/15'
                            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground bg-white/5 hover:bg-white/10'
                    "
                    @click="voiceStore.toggleSound()"
                >
                    <VolumeOff v-if="voiceStore.isSoundMuted" :size="15" />
                    <Volume2 v-else :size="15" />
                </button>
            </SimpleTooltip>

            <SimpleTooltip
                :content="voiceStore.isScreenSharing ? t('chat.voice.stopSharing') : t('chat.voice.shareScreen')"
            >
                <button
                    type="button"
                    class="flex h-7 flex-1 items-center justify-center rounded transition-colors"
                    :class="
                        voiceStore.isScreenSharing
                            ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground bg-white/5 hover:bg-white/10'
                    "
                    @click="toggleScreenShare"
                >
                    <MonitorOff v-if="voiceStore.isScreenSharing" :size="15" />
                    <MonitorUp v-else :size="15" />
                </button>
            </SimpleTooltip>
        </div>
    </div>
</template>
