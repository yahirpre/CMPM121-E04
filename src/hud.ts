/**
 * The HUD lives in ordinary HTML around the game canvas. buildHud() creates
 * it when the page loads; scenes call the methods below to update it.
 */
export type HudMode = "title" | "play" | "attract" | "cutscene";

export class Hud {
  private cabinet: HTMLElement;
  private score: HTMLOutputElement;
  private best: HTMLOutputElement;
  private lives: HTMLElement[];
  private power: HTMLElement[];
  private route: HTMLOListElement;
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private banner: HTMLElement;
  private caption: HTMLElement;
  private stops: HTMLElement[] = [];
  private shownScore = -1;
  private bestScore = 0;

  constructor() {
    buildHud();
    this.cabinet = find<HTMLElement>("#cabinet");
    this.score = find<HTMLOutputElement>("#score");
    this.best = find<HTMLOutputElement>("#best");
    this.lives = [...document.querySelectorAll<HTMLElement>("#lives .pip")];
    this.power = [...document.querySelectorAll<HTMLElement>("#power .cell")];
    this.route = find<HTMLOListElement>("#route");
    this.boss = find<HTMLElement>("#boss");
    this.bossFill = find<HTMLElement>("#boss-fill");
    this.banner = find<HTMLElement>("#banner");
    this.caption = find<HTMLElement>("#caption");
  }

  /** Builds one route stop per sector. */
  setRoute(names: readonly string[]): void {
    this.route.replaceChildren();
    this.stops = names.map((name) => {
      const stop = document.createElement("li");
      stop.className = "stop";
      stop.dataset.state = "ahead";
      const dot = document.createElement("span");
      dot.className = "stop-dot";
      dot.style.width = "12px";
      dot.style.height = "12px";
      dot.style.border = "2px solid currentColor";
      dot.style.borderRadius = "50%";
      stop.appendChild(dot);
      const label = document.createElement("span");
      label.className = "stop-name";
      label.textContent = name;
      stop.appendChild(label);
      this.route.appendChild(stop);
      return stop;
    });
  }

  setMode(mode: HudMode): void {
    this.cabinet.dataset.mode = mode;
  }

  setScore(score: number): void {
    if (score === this.shownScore) return;
    this.shownScore = score;
    this.score.value = pad(score);
    if (score > this.bestScore) {
      this.bestScore = score;
      this.best.value = pad(score);
    }
  }

  setLives(lives: number): void {
    this.lives.forEach((pip, i) => pip.classList.toggle("lit", i < lives));
  }

  setPower(level: number): void {
    this.power.forEach((cell, i) => cell.classList.toggle("lit", i < level));
  }

  /** Marks earlier stops cleared and highlights the current one (-1: none). */
  setSector(current: number): void {
    this.stops.forEach((stop, i) => {
      stop.dataset.state = i < current
        ? "cleared"
        : i === current
        ? "current"
        : "ahead";
    });
  }

  /** Shows the boss meter at a 0–1 fraction, or hides it with null. */
  setBoss(fraction: number | null): void {
    this.boss.hidden = fraction === null;
    if (fraction !== null) {
      this.bossFill.style.setProperty("--fill", String(Math.max(0, fraction)));
    }
  }

  announce(title: string, subtitle = ""): void {
    this.banner.querySelector("strong")!.textContent = title;
    this.banner.querySelector("span")!.textContent = subtitle;
    restartAnimation(this.banner, "show");
  }

  /** Shakes the panels; heavy impacts use the stronger animation. */
  shudder(heavy = false): void {
    restartAnimation(this.cabinet, heavy ? "quake" : "shudder");
  }

  say(text: string): void {
    this.caption.textContent = text;
    this.caption.classList.toggle("visible", text !== "");
  }
}

function find<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`index.html is missing ${selector}`);
  return element;
}

function pad(score: number): string {
  return String(score).padStart(7, "0");
}

/** Removing a class and forcing layout lets the same CSS animation replay. */
function restartAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/** Creates the cabinet: status panel, game screen, route panel, help line. */
function buildHud(): void {
  const cabinet = document.createElement("main");
  cabinet.className = "cabinet";
  cabinet.id = "cabinet";
  cabinet.dataset.mode = "title";

  // left panel: score, best, hull, cannon
  const left = document.createElement("aside");
  left.className = "panel panel-left";
  left.setAttribute("aria-label", "Ship status");

  const scoreBox = document.createElement("section");
  scoreBox.className = "readout";
  const scoreLabel = document.createElement("h2");
  scoreLabel.textContent = "Score";
  scoreBox.appendChild(scoreLabel);
  const score = document.createElement("output");
  score.id = "score";
  score.textContent = "0000000";
  scoreBox.appendChild(score);
  left.appendChild(scoreBox);

  const bestBox = document.createElement("section");
  bestBox.className = "readout";
  const bestLabel = document.createElement("h2");
  bestLabel.textContent = "Best";
  bestBox.appendChild(bestLabel);
  const best = document.createElement("output");
  best.id = "best";
  best.textContent = "0000000";
  bestBox.appendChild(best);
  left.appendChild(bestBox);

  const hullBox = document.createElement("section");
  hullBox.className = "readout";
  const hullLabel = document.createElement("h2");
  hullLabel.textContent = "Hull";
  hullBox.appendChild(hullLabel);
  const pips = document.createElement("div");
  pips.className = "pips";
  pips.id = "lives";
  const pip1 = document.createElement("span");
  pip1.className = "pip lit";
  pip1.style.width = "22px";
  pip1.style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
  pip1.style.background = "currentColor";
  pips.appendChild(pip1);
  const pip2 = document.createElement("span");
  pip2.className = "pip lit";
  pip2.style.width = "22px";
  pip2.style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
  pip2.style.background = "currentColor";
  pips.appendChild(pip2);
  const pip3 = document.createElement("span");
  pip3.className = "pip lit";
  pip3.style.width = "22px";
  pip3.style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
  pip3.style.background = "currentColor";
  pips.appendChild(pip3);
  hullBox.appendChild(pips);
  left.appendChild(hullBox);

  const cannonBox = document.createElement("section");
  cannonBox.className = "readout";
  const cannonLabel = document.createElement("h2");
  cannonLabel.textContent = "Cannon";
  cannonBox.appendChild(cannonLabel);
  const cells = document.createElement("div");
  cells.className = "cells";
  cells.id = "power";
  const cell1 = document.createElement("span");
  cell1.className = "cell lit";
  cell1.style.flex = "1";
  cell1.style.borderRadius = "2px";
  cells.appendChild(cell1);
  const cell2 = document.createElement("span");
  cell2.className = "cell";
  cell2.style.flex = "1";
  cell2.style.borderRadius = "2px";
  cells.appendChild(cell2);
  const cell3 = document.createElement("span");
  cell3.className = "cell";
  cell3.style.flex = "1";
  cell3.style.borderRadius = "2px";
  cells.appendChild(cell3);
  cannonBox.appendChild(cells);
  left.appendChild(cannonBox);

  const badge = document.createElement("p");
  badge.className = "badge";
  badge.textContent = "Self-play";
  left.appendChild(badge);
  cabinet.appendChild(left);

  // middle: the game canvas goes in #game, with the banner and caption on top
  const screen = document.createElement("div");
  screen.className = "screen";
  const game = document.createElement("div");
  game.id = "game";
  screen.appendChild(game);
  const banner = document.createElement("div");
  banner.className = "banner";
  banner.id = "banner";
  banner.appendChild(document.createElement("strong"));
  banner.appendChild(document.createElement("span"));
  screen.appendChild(banner);
  const caption = document.createElement("p");
  caption.className = "caption";
  caption.id = "caption";
  screen.appendChild(caption);
  cabinet.appendChild(screen);

  // right panel: route and boss meter
  const right = document.createElement("aside");
  right.className = "panel panel-right";
  right.setAttribute("aria-label", "Route");
  const routeLabel = document.createElement("h2");
  routeLabel.textContent = "Route";
  right.appendChild(routeLabel);
  const route = document.createElement("ol");
  route.className = "route";
  route.id = "route";
  right.appendChild(route);
  const boss = document.createElement("section");
  boss.className = "boss";
  boss.id = "boss";
  boss.hidden = true;
  const bossLabel = document.createElement("h2");
  bossLabel.textContent = "Warden";
  boss.appendChild(bossLabel);
  const meter = document.createElement("div");
  meter.className = "boss-meter";
  const fill = document.createElement("span");
  fill.id = "boss-fill";
  meter.appendChild(fill);
  boss.appendChild(meter);
  right.appendChild(boss);
  cabinet.appendChild(right);

  document.body.appendChild(cabinet);

  const help = document.createElement("p");
  help.className = "help";
  help.textContent =
    "Arrows or WASD to fly · Space or Z to fire · Wait at the title for self-play";
  document.body.appendChild(help);
}
