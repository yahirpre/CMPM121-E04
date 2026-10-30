import Phaser from "phaser";

const RATE = 22050;

/** A sample generator: time in seconds and a 0–1 progress through the sound. */
type Voice = (t: number, p: number, noise: () => number) => number;

interface SoundRecipe {
  seconds: number;
  voice: Voice;
}

const square = (phase: number) => (phase % 1 < 0.5 ? 1 : -1);
const tri = (phase: number) => 4 * Math.abs((phase % 1) - 0.5) - 1;

/** Short effects synthesized at boot, then decoded into Phaser's audio cache. */
const RECIPES: Record<string, SoundRecipe> = {
  shoot: {
    seconds: 0.07,
    voice: (t, p) => 0.18 * square(t * (1400 - 900 * p)) * (1 - p),
  },
  hit: {
    seconds: 0.06,
    voice: (_t, p, noise) => 0.25 * noise() * (1 - p),
  },
  boom: {
    seconds: 0.45,
    voice: (t, p, noise) =>
      (0.45 * noise() + 0.3 * tri(t * (90 - 60 * p))) * (1 - p) ** 2,
  },
  bigboom: {
    seconds: 1.6,
    voice: (t, p, noise) =>
      (0.5 * noise() + 0.4 * tri(t * (60 - 40 * p))) * (1 - p) ** 1.5,
  },
  pickup: {
    seconds: 0.3,
    voice: (t, p) => {
      const step = Math.floor(p * 4);
      return 0.22 * square(t * [660, 880, 990, 1320][step]) * (1 - p * 0.5);
    },
  },
  hurt: {
    seconds: 0.4,
    voice: (t, p, noise) =>
      (0.3 * square(t * (300 - 200 * p)) + 0.2 * noise()) * (1 - p),
  },
  warn: {
    seconds: 1.2,
    voice: (t) => 0.22 * square(t * (Math.floor(t * 4) % 2 ? 440 : 330)),
  },
  music: {
    seconds: 8,
    voice: (t) => {
      // Four bars of a minor-key bass arpeggio with a soft pad above it.
      const roots = [110, 87.31, 130.81, 98];
      const root = roots[Math.floor(t / 2) % 4];
      const step = Math.floor(t * 8) % 4;
      const note = root * [1, 1.5, 2, 1.5][step];
      const pluck = 1 - ((t * 8) % 1);
      return 0.12 * tri(t * note) * pluck + 0.04 * tri(t * root * 4);
    },
  },
};

export function loadSounds(scene: Phaser.Scene): void {
  const sound = scene.sound;
  if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  sound.decodeAudio(
    Object.entries(RECIPES).map(([key, recipe]) => ({
      key,
      data: render(recipe),
    })),
  );
}

/** Plays a cached sound if decoding has finished; silent otherwise. */
export function play(scene: Phaser.Scene, key: string, volume = 1): void {
  if (scene.cache.audio.exists(key)) scene.sound.play(key, { volume });
}

function render({ seconds, voice }: SoundRecipe): ArrayBuffer {
  const length = Math.floor(seconds * RATE);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) =>
    [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 1073741823) - 1;
  for (let i = 0; i < length; i++) {
    const sample = voice(i / RATE, i / length, noise);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return buffer;
}
