import Phaser from "phaser";
import {
  type Actor,
  type Arena,
  Bullet,
  Enemy,
  ENEMY_STATS,
  type EnemyKind,
  Player,
  type PowerKind,
  ShmupBoss,
  ShmupPowerUp,
  WIDTH,
} from "../actors.ts";
import type { Hud } from "../hud.ts";
import type { LaunchOptions } from "../main.ts";
import { AutoPilot, KeyboardPilot, type Pilot } from "../pilots.ts";
import { Rng } from "../rng.ts";
import { play } from "../sounds.ts";
import { TINTS } from "../textures.ts";
import { Backdrop } from "./backdrop.ts";
import { fadeIn, fadeTo, SCENES } from "./boot.ts";
import type { CutsceneData } from "./cutscene.ts";

const TICK_MS = 1000 / 60;
const START_LIVES = 3;
const BOSS_WARNING_TICKS = 200;
const VICTORY_TICKS = 180;

export interface RunStats {
  score: number;
  lives: number;
  kills: number;
  hits: number;
  continues: number;
  bossDefeated: boolean;
}

export interface PlayData {
  attract: boolean;
}

//layout constants

const CENTER_X = 240;
const TOP_Y = -30;
const LEFT_EDGE_X = -30;
const RIGHT_EDGE_X = 510;

interface Spawn {
  // frames after the waves start
  delay: number;
  x: number;
  y: number;
  // +1 / -1
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

const SCHEDULES = SECTORS.map(buildSchedule);

export class PlayScene extends Phaser.Scene implements Arena {
  rng!: Rng;
  player!: Player;
  now = 0;
  private attract = false;
  private run!: RunStats;
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

  constructor(
    private readonly hud: Hud,
    private readonly options: LaunchOptions,
  ) {
    super(SCENES.play);
  }

  /** Phaser reuses this object for every run, so reset all per-run state. */
  init(data: PlayData): void {
    this.attract = data.attract;
    this.rng = new Rng(this.options.seed);
    this.now = 0;
    this.carry = 0;
    this.run = {
      score: 0,
      lives: START_LIVES,
      kills: 0,
      hits: 0,
      continues: 0,
      bossDefeated: false,
    };
    this.enemies = [];
    this.shots = [];
    this.bullets = [];
    this.pickups = [];
    this.sector = -1;
    this.sectorStart = 0;
    this.boss = null;
    this.bossDueAt = 0;
    this.victoryAt = 0;
    this.gameOver = false;
  }

  create(): void {
    this.backdrop = new Backdrop(this);
    if (this.attract) {
      // any key during the demo goes back to the title
      this.input.keyboard?.on(
        "keydown-SPACE",
        () => fadeTo(this, SCENES.title),
      );
    }

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

    this.pilot = this.attract
      ? new AutoPilot()
      : new KeyboardPilot(this.input.keyboard!);
    this.hud.setMode(this.attract ? "attract" : "play");
    fadeIn(this);
    this.startSector(0);
  }

  override update(_time: number, delta: number): void {
    this.backdrop.scroll(delta);
    const speed = this.attract ? this.options.speed : 1;
    this.carry += Math.min(delta, 250) * speed;
    while (this.carry >= TICK_MS && this.scene.isActive()) {
      this.carry -= TICK_MS;
      this.tick();
    }
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
        const data: CutsceneData = { run: this.run, afterDemo: this.attract };
        fadeTo(this, SCENES.cutscene, data);
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
        x, // homeX
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
    // after the Warden dies, nothing can hurt player
    if (this.run.bossDefeated || this.gameOver || !this.player.vulnerable) {
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
    if (this.attract) {
      // in attract mode, keep going after winning
      this.run.continues++;
      this.run.lives = START_LIVES;
      return;
    }
    this.hud.announce("GAME OVER", "The lanes stay closed");
    this.gameOver = true;
    this.player.setVisible(false);
    this.player.bubble.setVisible(false);
    this.explode(this.player.x, this.player.y, 2);
    this.time.delayedCall(1800, () => fadeTo(this, SCENES.title));
  }

  private defeatBoss(boss: ShmupBoss): void {
    this.run.bossDefeated = true;
    this.victoryAt = this.now + VICTORY_TICKS;
    this.hud.setBoss(0);
    this.hud.announce("WARDEN DOWN", "The lanes are open");
    console.log("victory lap: ship protected =", this.run.bossDefeated);
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

  // Destroys spent and offscreen actors
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
