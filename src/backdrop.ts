import Phaser from "phaser";
import { HEIGHT, WIDTH } from "./actors.ts";

/** Parallax space shared by every scene, plus the camera's glow treatment. */
export class Backdrop {
  /** Scroll speed multiplier; the cutscene raises it for the warp jump. */
  warp = 1;
  private readonly layers: [Phaser.GameObjects.TileSprite, number][];

  constructor(scene: Phaser.Scene) {
    const tile = (key: string, speed: number, alpha = 1) =>
      [
        scene.add.tileSprite(0, 0, WIDTH, HEIGHT, key).setOrigin(0).setAlpha(
          alpha,
        ),
        speed,
      ] as [Phaser.GameObjects.TileSprite, number];
    this.layers = [
      tile("nebula", 0.25, 0.9),
      tile("stars-far", 0.6),
      tile("stars-near", 1.6),
    ];
    const camera = scene.cameras.main;
    Phaser.Actions.AddEffectBloom(camera, {
      threshold: 0.55,
      blurRadius: 3,
      blendAmount: 0.9,
    });
    camera.filters.external.addVignette(0.5, 0.5, 0.75, 0.45);
  }

  /** Scrolls by elapsed real time; scenery never affects gameplay. */
  scroll(deltaMs: number): void {
    const frames = deltaMs / (1000 / 60);
    for (const [layer, speed] of this.layers) {
      layer.tilePositionY -= speed * this.warp * frames;
    }
  }
}
