<script setup lang="ts">
import { ref, watch } from 'vue';
import { CircleStencil, Cropper } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const props = defineProps<{
    open: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'save', blob: Blob): void;
}>();

const cropperRef = ref<InstanceType<typeof Cropper> | null>(null);
const imageSrc = ref<string | null>(null);
const cropperKey = ref(0);
const saving = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const isGif = ref(false);
const originalFile = ref<File | null>(null);

const CONTAINER_HEIGHT = 350;

function initStretcher({
    stretcher,
    imageSize,
}: {
    stretcher: HTMLElement;
    imageSize: { width: number; height: number };
}) {
    const containerWidth = stretcher.parentElement?.clientWidth || 0;
    const aspectRatio = imageSize.width / imageSize.height;

    let width = containerWidth;
    let height = width / aspectRatio;

    if (height > CONTAINER_HEIGHT) {
        height = CONTAINER_HEIGHT;
        width = height * aspectRatio;
    }

    stretcher.style.width = `${width}px`;
    stretcher.style.height = `${height}px`;
}

watch(
    () => props.open,
    (open) => {
        if (!open) {
            imageSrc.value = null;
            saving.value = false;
        }
    },
);

function onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isGif.value = file.type === 'image/gif';
    originalFile.value = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        imageSrc.value = e.target?.result as string;
        cropperKey.value++;
    };
    reader.readAsDataURL(file);

    target.value = '';
}

function triggerFileSelect() {
    fileInput.value?.click();
}

async function save() {
    saving.value = true;

    try {
        if (isGif.value && originalFile.value) {
            emit('save', originalFile.value);
            return;
        }

        if (!cropperRef.value) return;

        const { canvas } = cropperRef.value.getResult();
        if (!canvas) return;

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/png');
        });

        if (blob) {
            emit('save', blob);
        }
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="max-w-lg overflow-hidden">
            <DialogHeader>
                <DialogTitle>Update avatar</DialogTitle>
                <DialogDescription class="sr-only">Crop and upload a new profile picture</DialogDescription>
            </DialogHeader>

            <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="hidden"
                @change="onFileSelect"
            />

            <div v-if="!imageSrc" class="flex flex-col items-center justify-center gap-4 py-12">
                <p class="text-muted-foreground text-sm">Select an image to use as your avatar</p>
                <Button @click="triggerFileSelect">Choose image</Button>
            </div>

            <div v-else class="space-y-4">
                <div class="bg-muted/50 rounded-lg" :style="{ height: CONTAINER_HEIGHT + 'px', overflow: 'hidden' }">
                    <div v-if="isGif" class="flex h-full items-center justify-center">
                        <img
                            :src="imageSrc!"
                            class="aspect-square h-full max-h-[300px] w-auto rounded-full object-cover"
                        />
                    </div>
                    <Cropper
                        v-else
                        :key="cropperKey"
                        ref="cropperRef"
                        :src="imageSrc"
                        :stencil-component="CircleStencil"
                        :stencil-props="{ aspectRatio: 1 }"
                        image-restriction="fit-area"
                        :auto-zoom="true"
                        default-boundaries="fit"
                        :init-stretcher="initStretcher"
                    />
                </div>

                <div class="flex justify-center">
                    <Button variant="ghost" size="sm" @click="triggerFileSelect">Choose different image</Button>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
                <Button v-if="imageSrc" :disabled="saving" @click="save">
                    {{ saving ? 'Saving...' : 'Save avatar' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
