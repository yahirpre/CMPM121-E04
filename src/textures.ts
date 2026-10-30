import Phaser from "phaser";

/** Neon palette shared by procedural textures and particle tints. */
export const COLORS = {
  player: "#5ef2ff",
  playerShot: "#c8fbff",
  drone: "#ff5ea8",
  dart: "#ffb84d",
  turret: "#9d7bff",
  lancer: "#7dff9b",
  boss: "#ff4d6d",
  bossCore: "#ffe066",
  enemyShot: "#ff7bd5",
  heavyShot: "#ffd24d",
  spread: "#7dff9b",
  shield: "#5ef2ff",
} as const;

export const TINTS = {
  player: 0x5ef2ff,
  spark: 0xffe8b0,
  boss: 0xff4d6d,
  bossCore: 0xffe066,
} as const;

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Draws every texture the game needs, so the project ships no image files. */
export function makeTextures(scene: Phaser.Scene): void {
  paint(scene, "player", 48, 48, (c, w, h) => {
    neon(c, COLORS.player, 2.5);
    poly(c, [
      [w / 2, 4],
      [w - 8, h - 8],
      [w / 2, h - 16],
      [8, h - 8],
    ]);
    c.stroke();
    c.fillStyle = "rgba(94, 242, 255, 0.25)";
    c.fill();
    c.fillStyle = "#ffffff";
    disc(c, w / 2, h / 2, 3.5);
  });

  paint(scene, "drone", 36, 36, (c, w, h) => {
    neon(c, COLORS.drone, 2.5);
    c.beginPath();
    c.ellipse(w / 2, h / 2, 14, 8, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = COLORS.drone;
    disc(c, w / 2, h / 2, 4);
  });

  paint(scene, "dart", 36, 40, (c, w, h) => {
    neon(c, COLORS.dart, 2.5);
    poly(c, [
      [w / 2, h - 4],
      [w - 4, 6],
      [w / 2, 14],
      [4, 6],
    ]);
    c.stroke();
    c.fillStyle = "rgba(255, 184, 77, 0.3)";
    c.fill();
  });

  paint(scene, "turret", 48, 48, (c, w, h) => {
    neon(c, COLORS.turret, 3);
    const points: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      points.push([w / 2 + Math.cos(a) * 19, h / 2 + Math.sin(a) * 19]);
    }
    poly(c, points);
    c.stroke();
    c.fillStyle = "rgba(157, 123, 255, 0.25)";
    c.fill();
    c.fillStyle = "#ffffff";
    disc(c, w / 2, h / 2, 5);
  });

  paint(scene, "lancer", 52, 28, (c, w, h) => {
    neon(c, COLORS.lancer, 2.5);
    poly(c, [
      [4, h / 2],
      [w / 2, 4],
      [w - 4, h / 2],
      [w / 2, h - 4],
    ]);
    c.stroke();
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.lineTo(w / 2, h - 2);
    c.stroke();
  });

  paint(scene, "boss", 200, 140, (c, w, h) => {
    neon(c, COLORS.boss, 4);
    poly(c, [
      [w / 2, h - 10],
      [w - 8, h / 2],
      [w - 30, 12],
      [w / 2, 34],
      [30, 12],
      [8, h / 2],
    ]);
    c.stroke();
    c.fillStyle = "rgba(255, 77, 109, 0.18)";
    c.fill();
    neon(c, COLORS.boss, 2);
    c.beginPath();
    c.arc(w / 2, h / 2 + 6, 34, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(30, h / 2);
    c.lineTo(w - 30, h / 2);
    c.stroke();
  });

  paint(scene, "boss-core", 40, 40, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, COLORS.bossCore);
    g.addColorStop(1, "rgba(255, 224, 102, 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  paint(scene, "shot", 8, 22, (c, w, h) => {
    neon(c, COLORS.playerShot, 1);
    c.fillStyle = COLORS.playerShot;
    c.fillRect(w / 2 - 1.5, 3, 3, h - 6);
  });

  paint(
    scene,
    "bullet",
    16,
    16,
    (c, w, h) => glowDot(c, w, h, COLORS.enemyShot),
  );
  paint(
    scene,
    "heavy",
    24,
    24,
    (c, w, h) => glowDot(c, w, h, COLORS.heavyShot),
  );

  paint(scene, "spread", 28, 28, (c, w, h) => {
    pickup(c, w, h, COLORS.spread);
    c.fillStyle = COLORS.spread;
    for (const dx of [-5, 0, 5]) disc(c, w / 2 + dx, h / 2, 2.2);
  });

  paint(scene, "shield", 28, 28, (c, w, h) => {
    pickup(c, w, h, COLORS.shield);
    c.beginPath();
    c.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
    c.stroke();
  });

  paint(scene, "bubble", 64, 64, (c, w, h) => {
    neon(c, COLORS.shield, 2);
    c.globalAlpha = 0.8;
    c.beginPath();
    c.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
    c.stroke();
  });

  paint(scene, "spark", 8, 8, (c, w, h) => glowDot(c, w, h, "#ffffff"));

  paint(scene, "ring", 64, 64, (c, w, h) => {
    c.strokeStyle = "#ffffff";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w / 2, h / 2, 28, 0, Math.PI * 2);
    c.stroke();
  });

  stars(scene, "stars-far", 0.6, 90, 1);
  stars(scene, "stars-near", 1, 40, 1.8);
  nebula(scene);
}

function paint(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  painter: Painter,
): void {
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Could not create texture ${key}`);
  painter(texture.context, width, height);
  texture.refresh();
}

function neon(c: CanvasRenderingContext2D, color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineJoin = "round";
  c.shadowColor = color;
  c.shadowBlur = 8;
}

function poly(c: CanvasRenderingContext2D, points: [number, number][]) {
  c.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.closePath();
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function glowDot(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
) {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, color);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function pickup(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
) {
  neon(c, color, 2);
  poly(c, [
    [w / 2, 2],
    [w - 2, h / 2],
    [w / 2, h - 2],
    [2, h / 2],
  ]);
  c.stroke();
}

/** A tileable star layer; each layer scrolls at its own speed for parallax. */
function stars(
  scene: Phaser.Scene,
  key: string,
  brightness: number,
  count: number,
  size: number,
) {
  // Fixed seed: the starfield looks identical on every run and machine.
  let seed = count * 7919;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  paint(scene, key, 256, 256, (c, w, h) => {
    for (let i = 0; i < count; i++) {
      c.fillStyle = `rgba(220, 235, 255, ${brightness * (0.3 + rand() * 0.7)})`;
      disc(c, rand() * w, rand() * h, size * (0.4 + rand() * 0.6));
    }
  });
}

function nebula(scene: Phaser.Scene) {
  paint(scene, "nebula", 256, 512, (c, w, h) => {
    const blobs: [number, number, number, string][] = [
      [0.2, 0.2, 120, "rgba(157, 123, 255, 0.16)"],
      [0.8, 0.45, 140, "rgba(255, 94, 168, 0.12)"],
      [0.35, 0.8, 130, "rgba(94, 242, 255, 0.10)"],
    ];
    for (const [fx, fy, r, color] of blobs) {
      for (const dy of [-h, 0, h]) {
        const g = c.createRadialGradient(
          fx * w,
          fy * h + dy,
          0,
          fx * w,
          fy * h + dy,
          r,
        );
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
    }
  });
}
