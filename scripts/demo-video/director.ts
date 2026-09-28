import { setTimeout as delay } from 'node:timers/promises';
import type { Locator, Page } from 'playwright';

/** A caption on the raw recording's clock, in milliseconds from its first frame. */
export interface Caption {
  start: number;
  end: number;
  text: string;
  /** What the narration says, when it should be read differently from the caption. */
  say: string;
}

/** The raw recording's timeline: captions, and the stretches the edit drops. */
export interface Timeline {
  captions: Caption[];
  /** Waits for a page, a transaction or a wallet approval, in milliseconds. */
  cuts: [number, number][];
  /** When the page was closed, on the same clock. */
  end: number;
}

/** How long a caption stays up: long enough to read it, and to speak it when there is a voice. */
export type HoldTime = (caption: { text: string; say: string }) => number;

interface Point {
  x: number;
  y: number;
}

/** The box of the first element `target` matches, once it is visible. */
async function boxOf(target: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const first = target.first();
  await first.waitFor();
  const box = await first.boundingBox();
  if (!box) throw new Error(`${target.toString()} has no box`);
  return box;
}

/** The box around the first element each of `targets` matches, in viewport coordinates. */
async function unionOf(
  targets: Locator[],
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  const boxes = await Promise.all(targets.map(boxOf));
  return {
    left: Math.min(...boxes.map((box) => box.x)),
    top: Math.min(...boxes.map((box) => box.y)),
    right: Math.max(...boxes.map((box) => box.x + box.width)),
    bottom: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

/** Whether `target` is in a dialog, which stays put while the page behind it scrolls. */
function inDialog(target: Locator): Promise<boolean> {
  return target.first().evaluate((element) => element.closest('[role="dialog"]') !== null);
}

/** The part of the viewport the sticky header covers, plus some air. */
const HEADER_OFFSET = 112;
/** The bottom of the viewport the producer's caption band covers, plus some air. */
const CAPTION_CLEARANCE = 150;

/**
 * Drives the page at a pace a viewer can follow and keeps the timeline the edit is cut from:
 * each caption records when it starts and ends, and each wait nobody needs to watch is marked
 * as a cut. A caption stays up for its hold time counted without its cuts, so a narration of
 * that length fits it after the edit.
 */
export class Director {
  private readonly startedAt = Date.now();
  private readonly captions: Caption[] = [];
  private readonly cuts: [number, number][] = [];
  private mouse: Point;

  constructor(
    readonly page: Page,
    private readonly holdTime: HoldTime,
    private readonly viewport: { width: number; height: number },
  ) {
    this.mouse = { x: Math.round(viewport.width * 0.6), y: Math.round(viewport.height * 0.7) };
  }

  private now(): number {
    return Date.now() - this.startedAt;
  }

  /** Milliseconds between `from` and now that the edit keeps. */
  private keptSince(from: number): number {
    const to = this.now();
    let dropped = 0;
    for (const [start, end] of this.cuts) {
      dropped += Math.max(0, Math.min(end, to) - Math.max(start, from));
    }
    return to - from - dropped;
  }

  /** Runs `wait`, and drops the time it took from the edit. */
  async cut<T>(wait: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await wait();
    } finally {
      this.cuts.push([start, this.now()]);
    }
  }

  /**
   * Shows `text` while `action` runs, then holds it until it has been on screen for its hold
   * time. The frames around the caption go when the caption does.
   */
  async caption(
    text: string,
    action: () => Promise<void> = async () => {},
    options: { say?: string; extra?: number } = {},
  ): Promise<void> {
    const say = options.say ?? text;
    const start = this.now();
    await action();
    const hold = this.holdTime({ text, say }) + (options.extra ?? 0);
    const left = hold - this.keptSince(start);
    if (left > 0) await delay(left);
    this.captions.push({ start, end: this.now(), text, say });
    await this.clearFrames();
  }

  async pause(ms: number): Promise<void> {
    await delay(ms);
  }

  /** Loads `path` and drops the load from the edit. */
  async goto(path: string, ready: Locator): Promise<void> {
    await this.cut(async () => {
      await this.page.goto(path);
      await ready.waitFor();
      await this.page.evaluate('window.__demo.install()');
      // Web fonts and images settle; nobody needs to watch that either.
      await delay(900);
    });
    await this.nudge();
  }

  /** Clicks a link as a person would, and drops the load of the next page from the edit. */
  async follow(link: Locator, ready: Locator): Promise<void> {
    await this.click(link, { settle: 0 });
    await this.clearFrames();
    await this.cut(async () => {
      await ready.first().waitFor();
      await delay(900);
    });
    await this.nudge();
  }

  /** Draws the pointer where the mouse is, after a page load. */
  async nudge(): Promise<void> {
    await this.page.mouse.move(this.mouse.x + 1, this.mouse.y);
    await this.page.mouse.move(this.mouse.x, this.mouse.y);
  }

  /** Moves the pointer to `target` along an eased path. */
  async moveTo(target: Locator | Point, ms = 700): Promise<void> {
    const to = 'x' in target ? target : await this.centerOf(target);
    const from = this.mouse;
    const steps = Math.max(12, Math.round(ms / 16));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await this.page.mouse.move(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
      await delay(ms / steps);
    }
    this.mouse = to;
  }

  /** Brings `target` into view, moves the pointer onto it and clicks it as a person would. */
  async click(target: Locator, options: { settle?: number } = {}): Promise<void> {
    await this.reveal(target);
    await this.moveTo(target);
    await delay(250);
    await this.page.mouse.down();
    await delay(90);
    await this.page.mouse.up();
    await delay(options.settle ?? 400);
  }

  /** Waits until `target` is enabled. */
  async enabled(target: Locator, timeoutMs = 5 * 60_000): Promise<void> {
    await target.waitFor();
    const deadline = Date.now() + timeoutMs;
    while (!(await target.isEnabled())) {
      if (Date.now() > deadline) throw new Error(`${target.toString()} stayed disabled`);
      await delay(250);
    }
  }

  /** Types `text` into `field` at a readable speed. */
  async type(field: Locator, text: string): Promise<void> {
    await this.click(field, { settle: 150 });
    await field.press('ControlOrMeta+a');
    await field.pressSequentially(text, { delay: 140 });
  }

  /** Scrolls until `target` is in view, below the header, unless it is in view already. */
  async reveal(target: Locator, ms = 900): Promise<void> {
    const box = await boxOf(target);
    if (box.y >= HEADER_OFFSET - 16 && box.y + box.height <= this.viewport.height - CAPTION_CLEARANCE) {
      return;
    }
    if (await inDialog(target)) await this.scrollIntoView(target, ms);
    else await this.scrollTo(target, ms);
  }

  /** Scrolls so that `target` starts `offset` pixels below the top of the viewport. */
  async scrollTo(target: Locator, ms = 1200, offset = HEADER_OFFSET): Promise<void> {
    const box = await boxOf(target);
    const top = await this.page.evaluate<number>('window.scrollY');
    await this.page.evaluate(`window.__demo.scrollTo(${Math.round(top + box.y - offset)}, ${ms})`);
  }

  /** Scrolls whatever container holds `target`, such as a dialog's body, until it is centered. */
  async scrollIntoView(target: Locator, ms = 900): Promise<void> {
    await target
      .first()
      .evaluate((element) => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await delay(ms);
  }

  async scrollToTop(ms = 1000): Promise<void> {
    await this.page.evaluate(`window.__demo.scrollTo(0, ${ms})`);
  }

  /**
   * Frames `targets`, together, until the caption ends. On the page, it first scrolls them
   * between the header and the caption band; a frame that doesn't fit there starts at the top.
   */
  async frame(...targets: Locator[]): Promise<void> {
    const fixed = await inDialog(targets[0]);
    let box = await unionOf(targets);
    if (!fixed) {
      const lowest = this.viewport.height - CAPTION_CLEARANCE;
      const tooTall = box.bottom - box.top > lowest - HEADER_OFFSET;
      const shift =
        tooTall || box.top < HEADER_OFFSET - 16
          ? box.top - HEADER_OFFSET
          : Math.max(0, box.bottom - lowest);
      if (Math.abs(shift) > 4) {
        const top = await this.page.evaluate<number>('window.scrollY');
        await this.page.evaluate(`window.__demo.scrollTo(${Math.round(top + shift)}, 700)`);
        box = await unionOf(targets);
      }
    }
    await this.page.evaluate(
      `window.__demo.frame(${box.left}, ${box.top}, ${box.right - box.left}, ${box.bottom - box.top}, ${fixed})`,
    );
  }

  async clearFrames(): Promise<void> {
    await this.page.evaluate('window.__demo.clearFrames()');
  }

  private async centerOf(target: Locator): Promise<Point> {
    const box = await boxOf(target);
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }

  /** Closes the timeline once the page is about to close. */
  finish(): Timeline {
    return { captions: this.captions, cuts: this.cuts, end: this.now() };
  }
}
