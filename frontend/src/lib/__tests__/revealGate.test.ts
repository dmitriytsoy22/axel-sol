import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../../package.json';
import { REVEAL_GATE_SCRIPT, REVEAL_WINDOW_MS } from '../revealGate';

const root = document.documentElement;

function runGateWhile(visibility: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  // The page inlines this exact string, so the test runs the same code.
  new Function(REVEAL_GATE_SCRIPT)();
}

describe('load reveal gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete root.dataset.reveal;
    // Drop the own-property override so jsdom's own getter applies again.
    delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
  });

  it('never arms the reveal in a document that is not painting', () => {
    runGateWhile('hidden');

    expect(root.dataset.reveal).toBeUndefined();
    vi.runAllTimers();
    expect(root.dataset.reveal).toBeUndefined();
  });

  it('arms the reveal on a visible page and releases the content when the window ends', () => {
    runGateWhile('visible');
    expect(root.dataset.reveal).toBe('1');

    vi.advanceTimersByTime(REVEAL_WINDOW_MS - 1);
    expect(root.dataset.reveal).toBe('1');

    vi.advanceTimersByTime(1);
    expect(root.dataset.reveal).toBeUndefined();
  });
});

describe('reveal styles', () => {
  const css = readFileSync(path.resolve(__dirname, '../../styles/globals.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('hide nothing unless the gate has armed the reveal', () => {
    const selectors = Array.from(css.matchAll(/([^{}]*\.reveal\b[^{}]*)\{/g), (match) =>
      match[1].trim(),
    );
    const ungated = selectors.filter((selector) =>
      selector.split(',').some((part: string) => !part.trim().startsWith('[data-reveal]')),
    );

    expect(selectors.length).toBeGreaterThan(0);
    expect(ungated).toEqual([]);
  });
});

describe('dependencies', () => {
  it('leave out framer-motion, whose in-view reveals stay invisible in WKWebView', () => {
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

    expect(installed).toContain('next');
    expect(installed).not.toContain('framer-motion');
  });
});
