<script setup lang="ts">
import { Loader2, Music, Plus, Trash2 } from 'lucide-vue-next';
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import type { Sound } from '@/api/soundboard';
import { useSoundboardStore } from '@/stores/soundboard';
import SoundUploadDialog from './SoundUploadDialog.vue';

const { t } = useI18n();
const soundboard = useSoundboardStore();

const open = ref(false);
const uploadOpen = ref(false);
const errorMsg = ref<string | null>(null);

const showDeleteDialog = ref(false);
const pendingDelete = ref<Sound | null>(null);
const deleteError = ref<string | null>(null);
const isDeleting = ref(false);

async function onOpenChange(value: boolean): Promise<void> {
    open.value = value;
    if (value) {
        errorMsg.value = null;
        try {
            await soundboard.ensureLoaded();
        } catch {
            errorMsg.value = t('chat.voice.soundboard.loadError');
        }
    }
}

async function play(sound: Sound): Promise<void> {
    errorMsg.value = null;
    try {
        await soundboard.trigger(sound.id);
    } catch {
        errorMsg.value = t('chat.voice.soundboard.playError');
    }
}

function remove(sound: Sound): void {
    deleteError.value = null;
    pendingDelete.value = sound;
    showDeleteDialog.value = true;
}

async function confirmDelete(): Promise<void> {
    const sound = pendingDelete.value;
    if (!sound) return;
    isDeleting.value = true;
    deleteError.value = null;
    try {
        await soundboard.remove(sound.id);
        showDeleteDialog.value = false;
        pendingDelete.value = null;
    } catch {
        deleteError.value = t('chat.voice.soundboard.loadError');
    } finally {
        isDeleting.value = false;
    }
}

function openUpload(): void {
    open.value = false;
    uploadOpen.value = true;
}

const volumeModel = computed<number[]>({
    get: () => [Math.round(soundboard.volume * 100)],
    set: (value) => soundboard.setVolume((value[0] ?? 100) / 100),
});
</script>

<template>
    <PopoverRoot :open="open" @update:open="onOpenChange">
        <PopoverTrigger
            type="button"
            :title="t('chat.voice.soundboard.open')"
            class="text-sidebar-foreground/60 hover:text-sidebar-foreground flex h-7 flex-1 items-center justify-center rounded bg-white/5 transition-colors hover:bg-white/10 data-[state=open]:bg-white/15 data-[state=open]:text-white"
        >
            <Music :size="15" />
        </PopoverTrigger>

        <PopoverPortal>
            <PopoverContent
                side="top"
                align="start"
                :side-offset="8"
                :align-offset="8"
                class="bg-popover text-popover-foreground z-50 w-72 rounded-md border p-3 shadow-md outline-none"
            >
                <div class="mb-2 flex items-center justify-between">
                    <span class="text-sm font-semibold">{{ t('chat.voice.soundboard.title') }}</span>
                    <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors hover:bg-white/5"
                        @click="openUpload"
                    >
                        <Plus :size="13" />
                        {{ t('chat.voice.soundboard.addSound') }}
                    </button>
                </div>

                <div v-if="soundboard.isLoading" class="flex justify-center py-6">
                    <Loader2 class="text-muted-foreground size-5 animate-spin" />
                </div>

                <p v-else-if="soundboard.sounds.length === 0" class="text-muted-foreground py-6 text-center text-xs">
                    {{ t('chat.voice.soundboard.empty') }}
                </p>

                <div v-else class="grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
                    <div v-for="sound in soundboard.sounds" :key="sound.id" class="group relative">
                        <button
                            type="button"
                            class="focus-visible:ring-ring flex h-8 w-full items-center justify-center rounded px-1 text-center text-[10px] leading-tight font-medium transition-colors outline-none focus-visible:ring-1"
                            :class="
                                soundboard.playingId === sound.id
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-muted/40 hover:bg-muted/70'
                            "
                            @click="play(sound)"
                        >
                            <span class="line-clamp-2 break-words">{{ sound.name }}</span>
                        </button>
                        <button
                            v-if="soundboard.canDelete(sound)"
                            type="button"
                            class="bg-background/80 text-muted-foreground hover:text-destructive absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border shadow-sm group-hover:flex"
                            :title="t('chat.voice.soundboard.delete')"
                            @click.stop="remove(sound)"
                        >
                            <Trash2 :size="11" />
                        </button>
                    </div>
                </div>

                <p v-if="errorMsg" class="text-destructive mt-2 text-xs">{{ errorMsg }}</p>

                <div class="mt-3 border-t pt-3">
                    <label class="text-muted-foreground mb-1.5 block text-xs">
                        {{ t('chat.voice.soundboard.volume') }}
                    </label>
                    <Slider v-model="volumeModel" :min="0" :max="100" :step="1" />
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>

    <SoundUploadDialog v-model:open="uploadOpen" />

    <Dialog v-model:open="showDeleteDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('chat.voice.soundboard.deleteDialogTitle') }}</DialogTitle>
                <DialogDescription>
                    {{
                        pendingDelete
                            ? t('chat.voice.soundboard.deleteDialogDescription', { name: pendingDelete.name })
                            : ''
                    }}
                </DialogDescription>
            </DialogHeader>
            <p v-if="deleteError" class="text-destructive text-xs">{{ deleteError }}</p>
            <DialogFooter>
                <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">
                    {{ t('common.cancel') }}
                </Button>
                <Button variant="destructive" :disabled="isDeleting" @click="confirmDelete">
                    {{ t('chat.voice.soundboard.deleteConfirm') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
