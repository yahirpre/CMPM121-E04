import Phaser from "phaser";
import { loadSounds } from "../sounds.ts";
import { makeTextures } from "../textures.ts";

export const SCENES = {
  boot: "boot",
  title: "title",
  play: "play",
  cutscene: "cutscene",
} as const;

const FADE_MS = 450;
const FADE_RGB = [4, 2, 12] as const;

//Scenes already fading out
const leaving = new WeakSet<Phaser.Scene>();

export function fadeIn(scene: Phaser.Scene, ms = 400): void {
  scene.cameras.main.fadeIn(ms, ...FADE_RGB);
}

// True once the scene has started fading toward another scene
export function isLeaving(scene: Phaser.Scene): boolean {
  return leaving.has(scene);
}

export function fadeTo(
  scene: Phaser.Scene,
  key: string,
  data?: object,
): void {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  const camera = scene.cameras.main;
  camera.fadeOut(FADE_MS, ...FADE_RGB);
  camera.once("camerafadeoutcomplete", () => {
    leaving.delete(scene);
    scene.scene.start(key, data);
  });
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    makeTextures(this);
    loadSounds(this);
    this.scene.start(SCENES.title);
  }
}
