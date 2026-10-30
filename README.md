# E4: Neon Warden

A small vertical shooter for the web. The playfield runs in [Phaser 4](https://phaser.io); the score panels, route map, and banners around it are ordinary HTML and CSS. Assignment instructions are on Canvas.

Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) and [Git](https://git-scm.com/downloads). Create your own repository from this template, clone it, open a terminal in that folder, and run `deno task setup` once. Run `deno task dev` and open the local URL printed in the terminal (normally `http://localhost:3000`).

**This starter arrives messy on purpose.** `deno task ci` (formatting, lint, type checks, production build) fails on the untouched starter, and setup's commit hook refuses commits until it passes. Cleaning that up is the first step of the assignment.

## Self-play

Wait eight seconds at the title and the game plays itself, like an arcade cabinet's attract mode. Add `?attract&speed=8` to the local URL to start self-play at once and watch the whole run, boss and cutscene included, in under a minute. Self-play is deterministic: when the boss falls, the browser console shows one `[self-play]` summary line, and unchanged gameplay always prints the same line.

Controls: arrows or WASD to fly, Space or Z to fire.

## If blocked

Read the first failing command in the output, fix what it reports, and rerun `deno task ci`. If a hook or tool stalls you, ask course staff with the failing command and its error text.

## Credits

Tooling adapted from the instructor's E2 starter. Game, procedural graphics, and synthesized sound were instructor-authored with authorized Anthropic Claude agent assistance. Dependencies retain their respective licenses.
