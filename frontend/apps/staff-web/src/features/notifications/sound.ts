/**
 * A short notification tone made with Web Audio (no audio asset; design 04 §5: sounds are off by
 * default at reception). Browsers only allow audio after a user gesture, so `unlockAudio()` runs on
 * the first click or key press; before that `playNotificationSound()` does nothing. S4 reuses it.
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let installed = false;

function audioContextClass(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Create or resume the audio context (call from a user gesture). */
export function unlockAudio(): void {
  const Ctor = audioContextClass();
  if (!Ctor) return;
  try {
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    context = null;
  }
}

/** Unlock audio on the first user gesture of the page (idempotent). */
export function installAudioUnlock(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once);
  window.addEventListener("keydown", once);
}

/** Play the tone: returns false when audio is unavailable or still locked. */
export function playNotificationSound(): boolean {
  if (!context || context.state !== "running") return false;
  try {
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, start);
    oscillator.frequency.setValueAtTime(660, start + 0.12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.32);
    return true;
  } catch {
    return false;
  }
}

/** Tests only. */
export function resetAudioForTests(): void {
  context = null;
  installed = false;
}
