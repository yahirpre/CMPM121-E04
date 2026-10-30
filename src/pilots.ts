import Phaser from "phaser";
import {
  type Actor,
  type Controls,
  HEIGHT,
  type Player,
  WIDTH,
} from "./actors.ts";

/** What a pilot can see each tick. */
export interface Cockpit {
  player: Player;
  enemies: readonly Actor[];
  threats: readonly Actor[];
  pickups: readonly Actor[];
}

/** Anything that can fly the ship: a person at the keyboard or the autopilot. */
export interface Pilot {
  read(view: Cockpit): Controls;
}

export class KeyboardPilot implements Pilot {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.keys = keyboard.addKeys(
      "LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Z",
    ) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  read(): Controls {
    const k = this.keys;
    const axis = (minus: boolean, plus: boolean) =>
      (plus ? 1 : 0) - (minus ? 1 : 0);
    return {
      dx: axis(k.LEFT.isDown || k.A.isDown, k.RIGHT.isDown || k.D.isDown),
      dy: axis(k.UP.isDown || k.W.isDown, k.DOWN.isDown || k.S.isDown),
      fire: k.SPACE.isDown || k.Z.isDown,
    };
  }
}

/**
 * Self-play for attract mode. It steers toward targets and pickups and away
 * from anything predicted to come close soon. It is deterministic: the same
 * situation always produces the same controls.
 */
export class AutoPilot implements Pilot {
  read({ player, enemies, threats, pickups }: Cockpit): Controls {
    let goalX = WIDTH / 2;
    const goalY = HEIGHT - 90;
    const pickup = nearest(player, pickups.filter((p) => p.y < player.y + 20));
    const target = nearest(
      player,
      enemies.filter((e) => e.y > 0 && e.y < player.y - 60),
    );
    if (pickup && Math.abs(pickup.x - player.x) < 200) {
      goalX = pickup.x;
    } else if (target) {
      goalX = target.x;
    }

    let pushX = (goalX - player.x) * 0.04;
    let pushY = (goalY - player.y) * 0.04;
    for (const threat of threats) {
      for (const ahead of [0, 6, 12, 20]) {
        const dx = player.x - (threat.x + threat.vx * ahead);
        const dy = player.y - (threat.y + threat.vy * ahead);
        const range = player.radius + threat.radius + 26;
        const distance = Math.hypot(dx, dy);
        if (distance < range) {
          const urgency = (range - distance) / range / (1 + ahead / 10);
          pushX += (dx / (distance || 1) + (dx === 0 ? 0.5 : 0)) * urgency * 3;
          pushY += (dy / (distance || 1)) * urgency * 1.5;
        }
      }
    }
    // Keep away from the walls so dodging always has room.
    if (player.x < 40) pushX += 0.5;
    if (player.x > WIDTH - 40) pushX -= 0.5;
    return {
      dx: Phaser.Math.Clamp(pushX, -1, 1),
      dy: Phaser.Math.Clamp(pushY, -1, 1),
      fire: true,
    };
  }
}

function nearest(from: Actor, candidates: readonly Actor[]): Actor | undefined {
  let best: Actor | undefined;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c.x - from.x) + Math.abs(c.y - from.y) * 0.3;
    if (d < bestDistance) {
      bestDistance = d;
      best = c;
    }
  }
  return best;
}
