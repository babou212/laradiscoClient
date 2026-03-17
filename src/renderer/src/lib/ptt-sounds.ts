let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContext();
    }

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export function playPttActivateSound(volume = 0.25): void {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(800, now);
        osc1.connect(gain);
        osc1.start(now);
        osc1.stop(now + 0.07);

        const gain2 = ctx.createGain();
        gain2.connect(ctx.destination);
        gain2.gain.setValueAtTime(volume, now + 0.07);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200, now + 0.07);
        osc2.connect(gain2);
        osc2.start(now + 0.07);
        osc2.stop(now + 0.15);
    } catch (error) {
        console.error(error);
    }
}

export function playPttDeactivateSound(volume = 0.2): void {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.1);
    } catch (error) {
        console.error(error);
    }
}
