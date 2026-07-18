import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useE2eeStore = defineStore('e2ee', () => {
    const linkRequired = ref(false);
    const backupNeeded = ref(false);

    function setLinkRequired(value: boolean): void {
        linkRequired.value = value;
    }

    function setBackupNeeded(value: boolean): void {
        backupNeeded.value = value;
    }

    return { linkRequired, setLinkRequired, backupNeeded, setBackupNeeded };
});
