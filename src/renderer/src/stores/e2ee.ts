import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useE2eeStore = defineStore('e2ee', () => {
    const linkRequired = ref(false);

    function setLinkRequired(value: boolean): void {
        linkRequired.value = value;
    }

    return { linkRequired, setLinkRequired };
});
