import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The optional narration: macOS `say` reads each caption. The recorder measures the clips before
 * it starts, so every caption stays up at least as long as its clip, and the producer lays the
 * same clips under the edit. Elsewhere the video has captions only.
 */

export const VOICE = 'Samantha';
/** Words per minute. */
export const RATE = 185;

/** The clip must end this long before the next caption starts. */
const TAIL_MS = 700;

export function sayAvailable(): boolean {
  return process.platform === 'darwin' && spawnSync('say', ['-v', '?']).status === 0;
}

export function mediaSeconds(file: string): number {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  return Number(out.trim());
}

/** Time to read a caption: 1.2 s to find it, then about 3.5 words a second, a subtitle's pace. */
export function readingMs(text: string): number {
  return 1200 + text.split(/\s+/).length * 290;
}

export class Narration {
  constructor(
    private readonly dir: string,
    readonly enabled: boolean,
  ) {
    if (enabled) mkdirSync(dir, { recursive: true });
  }

  /** The clip that says `say`, rendered once and kept under the hash of its text and voice. */
  clip(say: string): string {
    const name = createHash('sha256').update(`${VOICE}|${RATE}|${say}`).digest('hex').slice(0, 16);
    const file = join(this.dir, `${name}.aiff`);
    if (!existsSync(file)) {
      execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', file, say]);
    }
    return file;
  }

  /** How long a caption stays up. */
  holdTime = ({ text, say }: { text: string; say: string }): number => {
    const reading = readingMs(text);
    if (!this.enabled) return reading;
    return Math.max(reading, Math.round(mediaSeconds(this.clip(say)) * 1000) + TAIL_MS);
  };
}
