import Phaser from "phaser";
import { HEIGHT, WIDTH } from "../actors.ts";
import type { Hud } from "../hud.ts";
import type { LaunchOptions } from "../main.ts";
import { Backdrop } from "./backdrop.ts";
import { fadeIn, fadeTo, isLeaving, SCENES } from "./boot.ts";

/** Seconds of idling before the title hands the ship to the autopilot. */
const IDLE_SECONDS = 8;

const ROUTE = [
  "Outer Drift",
  "Shatter Belt",
  "Gun Lanes",
  "Lancer Gate",
  "Last Approach",
  "The Warden",
];

export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private countdown!: Phaser.GameObjects.Text;
  private idle = 0;

  constructor(
    private readonly hud: Hud,
    private readonly options: LaunchOptions,
  ) {
    super(SCENES.title);
  }

  init(): void {
    this.idle = 0;
  }

  create(): void {
    this.backdrop = new Backdrop(this);
    this.input.keyboard?.on(
      "keydown-SPACE",
      () => fadeTo(this, SCENES.play, { attract: false }),
    );

    this.hud.setMode("title");
    this.hud.setRoute(ROUTE);
    this.hud.setSector(-1);
    this.hud.setBoss(null);
    this.hud.say("");

    const title = this.add.text(WIDTH / 2, HEIGHT * 0.34, "NEON\nWARDEN", {
      fontFamily: "Orbitron, Trebuchet MS, sans-serif",
      fontSize: "64px",
      fontStyle: "bold",
      align: "center",
      color: "#e8fdff",
    }).setOrigin(0.5).setLineSpacing(-6);
    title.enableFilters();
    title.filters?.internal.addGlow(0x5ef2ff, 6, 0, 1);
    this.tweens.add({
      targets: title,
      scale: 1.04,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.add.text(WIDTH / 2, HEIGHT * 0.62, "SPACE  launch", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#ffe066",
    }).setOrigin(0.5);
    this.countdown = this.add.text(WIDTH / 2, HEIGHT * 0.68, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#8aa4c8",
    }).setOrigin(0.5);

    fadeIn(this);
    if (this.options.attract) fadeTo(this, SCENES.play, { attract: true });
  }

  override update(_time: number, delta: number): void {
    this.backdrop.scroll(delta);
    if (isLeaving(this)) return;
    this.idle += delta / 1000;
    const left = Math.ceil(IDLE_SECONDS - this.idle);
    this.countdown.setText(`self-play demo in ${left}`);
    if (left <= 0) fadeTo(this, SCENES.play, { attract: true });
  }
}
