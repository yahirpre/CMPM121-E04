import Phaser from "phaser";
import {
  type Actor,
  type Arena,
  Bullet,
  HEIGHT,
  Player,
  type PowerKind,
  WIDTH,
} from "./actors.ts";
import {
  Enemy,
  ENEMY_STATS,
  EnemyKind,
  ShmupBoss,
  ShmupPowerUp,
} from "./actors.ts";
import type { Hud } from "./hud.ts";
import type { LaunchOptions } from "./main.ts";
import { AutoPilot, KeyboardPilot, type Pilot } from "./pilots.ts";
import { Rng } from "./rng.ts";
import { loadSounds, play } from "./sounds.ts";
import { makeTextures, TINTS } from "./textures.ts";
import { Backdrop } from "./backdrop.ts";

const TICK_MS = 1000 / 60;
const START_LIVES = 3;
const BOSS_WARNING_TICKS = 200;
const VICTORY_TICKS = 180;
/** Seconds of idling before the title hands the ship to the autopilot. */
const IDLE_SECONDS = 8;

/** Lines of the closing story and when (seconds) each appears. */
const STORY: [number, string][] = [
  [0.8, "The Warden's lights go dark, one ring at a time."],
  [4.2, "Behind you, five sectors of open sky."],
  [7.6, "Ahead, the long way home."],
];
const WARP_AT = 9;
const CREDITS_AT = 11;
const RETURN_AT = 18;

//layout constants

const CENTER_X = 240;
const TOP_Y = -30;
const LEFT_EDGE_X = -30;
const RIGHT_EDGE_X = 510;

interface Spawn {
  /** Frames after the wave's start. */
  delay: number;
  x: number;
  y: number;
  /** +1 / -1, alternating by index. */
  side: number;
}

const alternate = (i: number) => (i % 2 === 0 ? 1 : -1);
const indices = (n: number) => Array.from({ length: n }, (_, i) => i);

function lineSpawns(count: number, centerX = CENTER_X, spacing = 64): Spawn[] {
  const mid = (count - 1) / 2;
  return indices(count).map((i) => ({
    delay: 0,
    x: centerX + (i - mid) * spacing,
    y: TOP_Y,
    side: alternate(i),
  }));
}

function veeSpawns(
  count: number,
  centerX = CENTER_X,
  spacing = 44,
  stagger = 10,
): Spawn[] {
  const mid = (count - 1) / 2;
  return indices(count).map((i) => ({
    delay: Math.abs(i - mid) * stagger,
    x: centerX + (i - mid) * spacing,
    y: TOP_Y,
    side: alternate(i),
  }));
}

function columnSpawns(count: number, x: number, interval = 24): Spawn[] {
  return indices(count).map((i) => ({
    delay: i * interval,
    x,
    y: TOP_Y,
    side: alternate(i),
  }));
}

function pincerSpawns(count: number): Spawn[] {
  return indices(count).map((i) => {
    const row = Math.floor(i / 2);
    return {
      delay: row * 30,
      x: i % 2 === 0 ? LEFT_EDGE_X : RIGHT_EDGE_X,
      y: 70 + row * 50,
      side: alternate(i),
    };
  });
}

interface Wave {
  /** Frame (relative to the start of the sector) the wave begins on. */
  at: number;
  kind: EnemyKind;
  spawns: Spawn[];
}

const line = (
  at: number,
  kind: EnemyKind,
  count: number,
  centerX?: number,
): Wave => ({ at, kind, spawns: lineSpawns(count, centerX) });

const vee = (
  at: number,
  kind: EnemyKind,
  count: number,
  centerX?: number,
): Wave => ({ at, kind, spawns: veeSpawns(count, centerX) });

const column = (
  at: number,
  kind: EnemyKind,
  count: number,
  x: number,
): Wave => ({ at, kind, spawns: columnSpawns(count, x) });

const pincer = (at: number, kind: EnemyKind, count: number): Wave => ({
  at,
  kind,
  spawns: pincerSpawns(count),
});

const SECTORS: Wave[][] = [
  // sector 1: Outer Drift
  [
    line(60, "drone", 4),
    vee(360, "drone", 5, 168),
    vee(660, "drone", 5, 312),
    line(960, "drone", 6),
    column(1200, "drone", 4, 120),
    column(1260, "drone", 4, 360),
  ],
  // sector 2: Shatter Belt
  [
    vee(60, "drone", 6),
    line(300, "dart", 4),
    column(600, "dart", 5, 144),
    column(720, "dart", 5, 336),
    line(1020, "drone", 7),
    vee(1140, "dart", 5),
    line(1440, "dart", 6),
  ],
  // sector 3: Gun Lanes
  [
    line(60, "turret", 1),
    vee(240, "drone", 6),
    line(540, "turret", 2),
    column(840, "dart", 6, CENTER_X),
    line(1080, "turret", 2),
    line(1140, "drone", 6),
    line(1500, "turret", 3),
  ],
  // sector 4: Lancer Gate (sector 3, but faster, with lancers)
  [
    pincer(60, "lancer", 4),
    vee(360, "dart", 6),
    pincer(600, "lancer", 6),
    line(780, "turret", 2),
    pincer(1140, "lancer", 6),
    vee(1260, "drone", 8),
    line(1560, "dart", 8),
  ],
  // sector 5: Last Approach
  [
    line(60, "turret", 3),
    pincer(180, "lancer", 6),
    column(540, "dart", 6, 120),
    column(540, "dart", 6, 360),
    vee(900, "drone", 9),
    line(1020, "turret", 2),
    pincer(1320, "lancer", 8),
    vee(1560, "dart", 8),
  ],
];

interface SpawnOrder {
  kind: EnemyKind;
  x: number;
  y: number;
  side: number;
}

function buildSchedule(waves: Wave[]): Map<number, SpawnOrder[]> {
  const schedule = new Map<number, SpawnOrder[]>();
  for (const wave of waves) {
    for (const s of wave.spawns) {
      const frame = wave.at + s.delay;
      const orders = schedule.get(frame) ?? [];
      orders.push({ kind: wave.kind, x: s.x, y: s.y, side: s.side });
      schedule.set(frame, orders);
    }
  }
  return schedule;
}

/** Indexed by sector number; built once at load. */
const SCHEDULES = SECTORS.map(buildSchedule);

export class GameScene extends Phaser.Scene implements Arena {
  mode = "title";
  rng!: Rng;
  player!: Player;
  now = 0;
  private run;
  private pilot!: Pilot;
  private backdrop!: Backdrop;
  private enemies: Enemy[] = [];
  private shots: Bullet[] = [];
  private bullets: Bullet[] = [];
  private pickups: ShmupPowerUp[] = [];
  private sector = -1;
  private sectorStart = 0;
  private boss: ShmupBoss | null = null;
  private bossDueAt = 0;
  private victoryAt = 0;
  private gameOver = false;
  private carry = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private countdown!: Phaser.GameObjects.Text;
  private idle = 0;
  private leaving = false;
  private cutsceneAfterDemo = false;

  constructor(
    private readonly hud: Hud,
    private readonly options: LaunchOptions,
  ) {
    super("game");
  }

  init(data: { mode?: string }): void {
    // remember whether the cutscene follows a self-play run
    if (data.mode === "cutscene") {
      this.cutsceneAfterDemo = this.mode === "attract";
    }
    this.mode = data.mode ?? "title";
    this.leaving = false;
    if (this.mode === "title") {
      this.idle = 0;
    } else if (this.mode === "play" || this.mode === "attract") {
      this.rng = new Rng(this.options.seed);
      this.now = 0;
      this.carry = 0;
      this.run = {
        score: 0,
        lives: START_LIVES,
        kills: 0,
        hits: 0,
        continues: 0,
      };
      this.enemies = [];
      this.shots = [];
      this.bullets = [];
      this.pickups = [];
      this.sector = -1;
      this.boss = null;
      this.bossDueAt = 0;
      this.victoryAt = 0;
      this.gameOver = false;
    }
  }

  create(): void {
    // first run only: draw every texture and synthesize every sound
    if (!this.textures.exists("player")) {
      makeTextures(this);
      loadSounds(this);
    }
    this.backdrop = new Backdrop(this);
    this.input.keyboard?.on("keydown-SPACE", () => this.onSpace());

    if (this.mode === "title") {
      this.hud.setMode("title");
      this.hud.setRoute([
        "Outer Drift",
        "Shatter Belt",
        "Gun Lanes",
        "Lancer Gate",
        "Last Approach",
        "The Warden",
      ]);
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

      this.cameras.main.fadeIn(400, 4, 2, 12);
      if (this.options.attract) this.launch("attract");
    } else if (this.mode === "play" || this.mode === "attract") {
      this.player = new Player(this);
      this.player.enableFilters();
      this.player.filters?.internal.addGlow(TINTS.player, 4, 0, 1);
      this.add.particles(0, 0, "spark", {
        speedY: { min: 80, max: 160 },
        speedX: { min: -20, max: 20 },
        lifespan: 260,
        scale: { start: 0.9, end: 0 },
        tint: TINTS.player,
        blendMode: "ADD",
        frequency: 30,
      }).startFollow(this.player, 0, 18);
      this.sparks = this.add.particles(0, 0, "spark", {
        speed: { min: 60, max: 260 },
        lifespan: { min: 250, max: 600 },
        scale: { start: 1.4, end: 0 },
        blendMode: "ADD",
        emitting: false,
      });

      this.pilot = this.mode === "attract"
        ? new AutoPilot()
        : new KeyboardPilot(this.input.keyboard!);
      this.hud.setMode(this.mode === "attract" ? "attract" : "play");
      this.cameras.main.fadeIn(400, 4, 2, 12);
      this.startSector(0);
    } else if (this.mode === "cutscene") {
      const run = this.run;
      this.hud.setMode("cutscene");
      this.hud.setBoss(null);
      this.cameras.main.fadeIn(600, 4, 2, 12);

      const ship = this.add.image(WIDTH / 2, HEIGHT - 120, "player");
      ship.enableFilters();
      ship.filters?.internal.addGlow(TINTS.player, 5, 0, 1);
      this.add.particles(0, 0, "spark", {
        speedY: { min: 120, max: 260 },
        lifespan: 420,
        scale: { start: 1.2, end: 0 },
        tint: TINTS.player,
        blendMode: "ADD",
        frequency: 16,
      }).startFollow(ship, 0, 18);
      this.tweens.add({
        targets: ship,
        y: HEIGHT - 140,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });

      for (const [at, line] of STORY) {
        this.time.delayedCall(at * 1000, () => this.hud.say(line));
      }
      this.time.delayedCall(WARP_AT * 1000, () => {
        this.hud.say("");
        play(this, "pickup", 0.7);
        this.tweens.add({
          targets: this.backdrop,
          warp: 18,
          duration: 900,
          ease: "Quad.in",
        });
        this.tweens.killTweensOf(ship);
        this.tweens.add({
          targets: ship,
          y: -80,
          scale: 0.4,
          duration: 1100,
          ease: "Back.in",
        });
        this.time.delayedCall(
          1000,
          () => this.cameras.main.flash(500, 220, 250, 255),
        );
      });
      this.time.delayedCall(CREDITS_AT * 1000, () => {
        this.hud.announce("THANK YOU FOR PLAYING", `Final score ${run.score}`);
        if (this.cutsceneAfterDemo) {
          this.hud.say(
            `Self-play: ${run.kills} kills, ${run.hits} hits, ${run.continues} continues`,
          );
        }
      });
      this.time.delayedCall(RETURN_AT * 1000, () => this.endCutscene());
    }
  }

  override update(_time: number, delta: number): void {
    this.backdrop.scroll(delta);
    if (this.mode === "title") {
      if (this.leaving) return;
      this.idle += delta / 1000;
      const left = Math.ceil(IDLE_SECONDS - this.idle);
      this.countdown.setText(`self-play demo in ${left}`);
      if (left <= 0) this.launch("attract");
    } else if (this.mode === "play" || this.mode === "attract") {
      const speed = this.mode === "attract" ? this.options.speed : 1;
      // the play branch runs one tick per frame
      this.carry += Math.min(delta, 250) * speed;
      while (this.carry >= TICK_MS && this.scene.isActive()) {
        this.carry -= TICK_MS;
        this.tick();
      }
    } else if (this.mode === "cutscene") {
      // the cutscene runs on timers
    }
  }

  private onSpace(): void {
    if (this.mode === "title") {
      this.launch("play");
    } else if (this.mode === "attract") {
      // any key during the demo goes back to the title
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(450, 4, 2, 12);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.restart({ mode: "title" });
      });
    } else if (this.mode === "cutscene") {
      this.endCutscene();
    }
  }

  private launch(mode: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(450, 4, 2, 12);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.restart({ mode: mode });
    });
  }

  private endCutscene(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.hud.say("");
    this.cameras.main.fadeOut(450, 4, 2, 12);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.restart({ mode: "title" });
    });
  }

  // Arena: what actors may ask of the scene.

  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    heavy = false,
  ): void {
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this.bullets.push(
      heavy
        ? new Bullet(this, x, y, "heavy", 8, vx, vy)
        : new Bullet(this, x, y, "bullet", 5, vx, vy),
    );
  }

  summon(_kind: string, x: number, y: number): void {
    this.spawnEnemy({ kind: "drone", x, y, side: x < WIDTH / 2 ? 1 : -1 });
  }

  // one tick of gameplay

  private tick(): void {
    this.now++;
    this.advanceRoute();
    this.updateProgression();

    if (!this.gameOver) this.flyPlayer();
    for (const enemy of this.enemies) enemy.step(this);
    for (const actor of [...this.shots, ...this.bullets, ...this.pickups]) {
      actor.step();
    }

    this.resolveHits();
    this.cull();
    this.refreshHud();
  }

  private flyPlayer(): void {
    const controls = this.pilot.read({
      player: this.player,
      enemies: this.enemies,
      threats: [...this.bullets, ...this.enemies],
      pickups: this.pickups,
    });
    for (const shot of this.player.step(controls)) {
      this.shots.push(
        new Bullet(this, shot.x, shot.y, "shot", 6, shot.vx, -11),
      );
      if (this.now % 2 === 0) play(this, "shoot", 0.25);
    }
  }

  private advanceRoute(): void {
    if (this.gameOver) return;
    if (this.victoryAt > 0) {
      if (this.now === this.victoryAt) {
        // fade out, then switch modes
        this.cameras.main.fadeOut(450, 4, 2, 12);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.scene.restart({ mode: "cutscene" });
        });
      }
      return;
    }
    if (this.bossDueAt > 0) {
      if (this.now === this.bossDueAt) this.startBoss();
      return;
    }
    if (this.boss) return;
    const t = this.now - this.sectorStart;
    if (
      this.sector === 0 && t >= 1560 && (this.enemies.length === 0 || t >= 1800)
    ) {
      this.startSector(1);
    } else if (
      this.sector === 1 && t >= 1800 && (this.enemies.length === 0 || t >= 2040)
    ) {
      this.startSector(2);
    } else if (
      this.sector === 2 && t >= 1920 && (this.enemies.length === 0 || t >= 2160)
    ) {
      this.startSector(3);
    } else if (
      this.sector === 3 && t >= 1920 && (this.enemies.length === 0 || t >= 2160)
    ) {
      this.startSector(4);
    } else if (
      this.sector === 4 && t >= 2040 && (this.enemies.length === 0 || t >= 2280)
    ) {
      this.startSector(5);
    }
  }

  private startSector(index: number): void {
    this.sector = index;
    this.hud.setSector(index);
    this.sectorStart = this.now;
    if (index === 0) {
      this.hud.announce("Sector 1: Outer Drift", "Scouts ahead");
    } else if (index === 1) {
      this.hud.announce("Sector 2: Shatter Belt", "Divers incoming");
    } else if (index === 2) {
      this.hud.announce("Sector 3: Gun Lanes", "Turrets online");
    } else if (index === 3) {
      this.hud.announce("Sector 4: Lancer Gate", "Crossfire");
    } else if (index === 4) {
      this.hud.announce("Sector 5: Last Approach", "Everything they have");
    } else {
      this.hud.announce("WARNING", "The Warden approaches");
      this.hud.shudder(true);
      play(this, "warn", 0.6);
      this.bossDueAt = this.now + BOSS_WARNING_TICKS;
    }
  }

  private updateProgression(): void {
    const t = this.now - this.sectorStart;
    for (const order of SCHEDULES[this.sector]?.get(t) ?? []) {
      this.spawnEnemy(order);
    }
  }

  private spawnEnemy({ kind, x, y, side }: SpawnOrder): void {
    const stats = ENEMY_STATS[kind];
    this.enemies.push(
      new Enemy(
        this,
        x,
        y,
        kind,
        stats,
        x, // homeX: enemies are anchored where they spawn
        side,
      ),
    );
  }

  private startBoss(): void {
    this.bossDueAt = 0;
    this.boss = new ShmupBoss(this);
    this.boss.enableFilters();
    this.boss.filters?.internal.addGlow(TINTS.boss, 4, 0, 1);
    this.enemies.push(this.boss);
    this.hud.setBoss(1);
  }

  private resolveHits(): void {
    for (const shot of this.shots) {
      const enemy = this.enemies.find((e) => e.active && e.touches(shot));
      if (!enemy) continue;
      shot.setActive(false);
      this.burst(shot.x, shot.y, 3, TINTS.spark);
      if (enemy.takeDamage(shot.damage)) this.destroyEnemy(enemy);
      else play(this, "hit", 0.3);
    }

    for (const bullet of this.bullets) {
      if (bullet.active && bullet.touches(this.player)) {
        bullet.setActive(false);
        this.hurtPlayer();
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.active || !enemy.touches(this.player)) continue;
      this.hurtPlayer();
      if (enemy !== this.boss && enemy.takeDamage(3)) this.destroyEnemy(enemy);
    }
    for (const pickup of this.pickups) {
      if (pickup.active && pickup.touches(this.player)) {
        pickup.setActive(false);
        this.player.collect(pickup.kind);
        play(this, "pickup", 0.6);
        this.burst(pickup.x, pickup.y, 14, TINTS.player);
      }
    }
  }

  private destroyEnemy(enemy: Enemy): void {
    enemy.setActive(false);
    this.run.score += enemy.stats.score;
    this.run.kills++;
    if (enemy === this.boss) {
      this.defeatBoss(this.boss);
      return;
    }
    this.explode(enemy.x, enemy.y, 1);
    if (this.rng.chance(enemy.stats.dropChance)) {
      const kind: PowerKind = this.player.power < 3 && this.rng.chance(0.5)
        ? "spread"
        : "shield";
      this.pickups.push(new ShmupPowerUp(this, enemy.x, enemy.y, kind));
    }
  }

  private hurtPlayer(): void {
    // After the Warden falls, nothing can hurt the ship during the victory lap.
    if (this.run.bossDefeted || this.gameOver || !this.player.vulnerable) {
      return;
    }
    this.run.hits++;
    const lostLife = this.player.takeHit();
    this.hud.shudder(lostLife);
    this.cameras.main.shake(lostLife ? 260 : 120, lostLife ? 0.012 : 0.005);
    play(this, "hurt", 0.7);
    this.burst(this.player.x, this.player.y, 24, TINTS.player);
    if (!lostLife) return;
    this.run.lives--;
    this.cameras.main.flash(180, 255, 80, 120);
    if (this.run.lives > 0) return;
    if (this.mode === "attract") {
      // The demo never ends early: self-play buys another ship and keeps going.
      this.run.continues++;
      this.run.lives = START_LIVES;
      return;
    }
    this.hud.announce("GAME OVER", "The lanes stay closed");
    this.gameOver = true;
    this.player.setVisible(false);
    this.player.bubble.setVisible(false);
    this.explode(this.player.x, this.player.y, 2);
    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(450, 4, 2, 12);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.restart({ mode: "title" });
      });
    });
  }

  private defeatBoss(boss: ShmupBoss): void {
    this.run.bossDefeated = true;
    this.victoryAt = this.now + VICTORY_TICKS;
    this.hud.setBoss(0);
    this.hud.announce("WARDEN DOWN", "The lanes are open");
    console.log("victory lap: ship protected =", this.run.bossDefeted);
    // The Warden's fall takes its bullets and escorts with it (no score).
    for (const bullet of this.bullets) {
      this.burst(bullet.x, bullet.y, 2, TINTS.spark);
      bullet.setActive(false);
    }
    for (const escort of this.enemies) {
      if (escort === boss || !escort.active) continue;
      this.explode(escort.x, escort.y, 1);
      escort.setActive(false);
    }
    console.info(
      `[self-play] seed=${this.options.seed} ticks=${this.now} score=${this.run.score}` +
        ` kills=${this.run.kills} hits=${this.run.hits} continues=${this.run.continues}`,
    );
    // A chain of blasts across the hull, then the big one.
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 140, () => {
        this.explode(
          boss.x + Phaser.Math.Between(-80, 80),
          boss.y + Phaser.Math.Between(-40, 40),
          1,
        );
      });
    }
    this.time.delayedCall(1200, () => {
      this.explode(boss.x, boss.y, 3);
      this.cameras.main.flash(400, 255, 230, 160);
      this.hud.shudder(true);
      play(this, "bigboom", 0.9);
      boss.setVisible(false);
      boss.core.setVisible(false);
    });
  }

  private explode(x: number, y: number, size: number): void {
    this.burst(x, y, 18 * size, size > 1 ? TINTS.bossCore : TINTS.spark);
    const ring = this.add.image(x, y, "ring").setBlendMode(
      Phaser.BlendModes.ADD,
    );
    ring.setScale(0.2 * size);
    this.tweens.add({
      targets: ring,
      scale: 1.2 * size,
      alpha: 0,
      duration: 380 + 120 * size,
      ease: "Cubic.out",
      onComplete: () => ring.destroy(),
    });
    this.cameras.main.shake(90 * size, 0.004 * size);
    play(this, size > 1 ? "bigboom" : "boom", 0.5);
  }

  private burst(x: number, y: number, count: number, tint: number): void {
    this.sparks.particleTint = tint;
    this.sparks.explode(count, x, y);
  }

  /** Destroys spent and offscreen actors. */
  private cull(): void {
    const spent = (actor: Actor) => !actor.active || actor.isOffscreen();
    this.shots = sweep(this.shots, spent);
    this.bullets = sweep(this.bullets, spent);
    this.pickups = sweep(this.pickups, spent);
    // The defeated Warden stays on screen for its finale: drop it undestroyed.
    this.enemies = this.enemies.filter((e) => e.active || e !== this.boss);
    this.enemies = sweep(
      this.enemies,
      (e) => !e.active || (e.age > 30 && e.isOffscreen()),
    );
  }

  private refreshHud(): void {
    this.hud.setScore(this.run.score);
    this.hud.setLives(this.run.lives);
    this.hud.setPower(this.player.power);
    if (this.boss && !this.run.bossDefeated) {
      this.hud.setBoss(this.boss.fraction);
    }
  }
}

function sweep<T extends Actor>(
  actors: T[],
  gone: (actor: Actor) => boolean,
): T[] {
  return actors.filter((actor) => {
    if (!gone(actor)) return true;
    actor.destroy();
    return false;
  });
}
