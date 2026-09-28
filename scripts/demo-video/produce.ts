import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { BAND_HEIGHT, captionHtml, endHtml, titleHtml } from './cards';
import type { Caption, Timeline } from './director';
import { mediaSeconds, Narration } from './narration';

/*
 * Turns the recorder's raw.webm and timeline.json into the finished videos:
 *
 * 1. cuts every wait the timeline marks, and the time before the first caption and after the last;
 * 2. puts the recording above a caption strip and burns the captions into it, drawn as PNGs (this
 *    needs no libass or drawtext in ffmpeg), so no caption ever covers the app;
 * 3. adds the title and end cards;
 * 4. muxes the narration, one `say` clip per caption, and a copy with a silent track.
 *
 *   npm run produce -- --out <the recorder's --out> --name AXEL-demo-localnet [--dest <folder>]
 */

const FPS = 25;
const WIDTH = 1920;
const HEIGHT = 1080;
const TITLE_SECONDS = 3;
const END_SECONDS = 3;
const FADE_SECONDS = 0.4;
/** Kept pieces shorter than this would flash; they are cut too. */
const MIN_PIECE = 0.12;
/** How long the edit holds before the first caption and after the last one. */
const LEAD_IN = 0.4;
const LEAD_OUT = 0.6;
/** Where each clip starts after its caption appears. */
const VOICE_DELAY = 0.15;
const MAX_SECONDS = 180;

interface RecordedTimeline extends Timeline {
  cluster: string;
  voice: boolean;
  video: string;
}

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: process.env.DEMO_OUT ?? join(__dirname, 'out') },
    name: { type: 'string' },
    dest: { type: 'string', default: process.env.DEMO_DEST },
  },
});
const out = resolve(values.out!);
/** Where the finished videos and captions go; the recorder's folder unless given. */
const dest = resolve(values.dest ?? out);
const timeline = JSON.parse(readFileSync(join(out, 'timeline.json'), 'utf8')) as RecordedTimeline;
const name = values.name ?? `AXEL-demo-${timeline.cluster}`;
const work = join(out, 'work');

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    stdio: 'inherit',
  });
}

/** The stretches of the raw recording the edit keeps, in seconds. */
function keptPieces(): [number, number][] {
  const first = timeline.captions[0].start / 1000 - LEAD_IN;
  const last = timeline.captions[timeline.captions.length - 1].end / 1000 + LEAD_OUT;
  const cuts = timeline.cuts
    .map(([start, end]) => [start / 1000, end / 1000] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const pieces: [number, number][] = [];
  let at = Math.max(0, first);
  for (const [start, end] of cuts) {
    if (end <= at) continue;
    if (start > at) pieces.push([at, Math.min(start, last)]);
    at = Math.max(at, end);
    if (at >= last) break;
  }
  if (at < last) pieces.push([at, last]);
  return pieces.filter(([start, end]) => end - start >= MIN_PIECE);
}

/** Where a moment of the raw recording lands in the edit. */
function editedTime(pieces: [number, number][], raw: number): number {
  let edited = 0;
  for (const [start, end] of pieces) {
    if (raw <= start) return edited;
    if (raw < end) return edited + raw - start;
    edited += end - start;
  }
  return edited;
}

interface EditedCaption extends Pick<Caption, 'text' | 'say'> {
  start: number;
  end: number;
}

async function renderPngs(
  captions: EditedCaption[],
  note: { title: string; end: string; badge: [string, string] },
): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const shoot = async (html: string, file: string, transparent: boolean): Promise<void> => {
    const source = join(work, 'card.html');
    writeFileSync(source, html);
    await page.goto(`file://${source}`);
    await page.evaluate('document.fonts.ready');
    await page.screenshot({ path: join(work, file), omitBackground: transparent });
  };
  await shoot(titleHtml(note.title), 'title.png', false);
  await shoot(endHtml(note.end), 'end.png', false);
  await shoot(captionHtml('', note.badge), 'blank.png', true);
  for (const [index, caption] of captions.entries()) {
    await shoot(captionHtml(caption.text, note.badge), `caption-${index}.png`, true);
  }
  await browser.close();
}

/** The captions as one image stream: each caption for its time, an empty strip in between. */
function captionTrack(captions: EditedCaption[], length: number): string {
  const lines: string[] = [];
  let at = 0;
  const add = (file: string, seconds: number) => {
    if (seconds <= 0) return;
    lines.push(`file '${file}'`, `duration ${seconds.toFixed(3)}`);
  };
  for (const [index, caption] of captions.entries()) {
    add('blank.png', caption.start - at);
    add(`caption-${index}.png`, caption.end - caption.start);
    at = caption.end;
  }
  add('blank.png', length - at);
  lines.push(`file 'blank.png'`);
  const list = join(work, 'captions.txt');
  writeFileSync(list, `${lines.join('\n')}\n`);
  return list;
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

async function main(): Promise<void> {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(dest, { recursive: true });

  const pieces = keptPieces();
  const body = pieces.reduce((sum, [start, end]) => sum + end - start, 0);
  const captions: EditedCaption[] = timeline.captions.map((caption) => ({
    text: caption.text,
    say: caption.say,
    start: editedTime(pieces, caption.start / 1000),
    end: editedTime(pieces, caption.end / 1000),
  }));
  const total = TITLE_SECONDS + body + END_SECONDS;
  console.log(
    `${pieces.length} pieces, ${body.toFixed(1)} s of the ${mediaSeconds(join(out, timeline.video)).toFixed(1)} s recording; ${total.toFixed(1)} s with the cards`,
  );
  if (total > MAX_SECONDS) throw new Error(`The video would run ${total.toFixed(1)} s, over 3:00`);

  const local = timeline.cluster === 'localnet';
  await renderPngs(captions, {
    badge: [local ? 'Local Solana validator' : `Solana ${timeline.cluster}`, 'Test tokens · fictional fleet'],
    title: local
      ? 'Recorded on a local Solana validator with fictional demo data'
      : `Recorded on Solana ${timeline.cluster} with fictional demo data and test tokens`,
    end: local
      ? 'Solana localnet demo data — devnet deployment pending'
      : `Solana ${timeline.cluster} demo data — fictional fleet, test tokens`,
  });

  // 1-3: the edit with captions, between the cards, as one silent video.
  const trims = pieces
    .map(
      ([start, end], index) =>
        `[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[p${index}]`,
    )
    .join(';');
  const joined = pieces.map((_, index) => `[p${index}]`).join('');
  const card = (input: number, seconds: number, label: string) =>
    `[${input}:v]fps=${FPS},scale=${WIDTH}:${HEIGHT},format=yuv420p,trim=duration=${seconds},` +
    `fade=t=in:st=0:d=${FADE_SECONDS},fade=t=out:st=${(seconds - FADE_SECONDS).toFixed(2)}:d=${FADE_SECONDS}[${label}]`;
  const filter = [
    trims,
    `${joined}concat=n=${pieces.length}:v=1:a=0,scale=${WIDTH}:${HEIGHT - BAND_HEIGHT},` +
      `pad=${WIDTH}:${HEIGHT}:0:0:color=0x081014,format=yuv420p[edit]`,
    `[1:v]format=rgba[caps]`,
    `[edit][caps]overlay=0:0:eof_action=repeat,format=yuv420p,setsar=1[body]`,
    card(2, TITLE_SECONDS, 'title'),
    card(3, END_SECONDS, 'end'),
    `[title][body][end]concat=n=3:v=1:a=0[v]`,
  ].join(';');
  const silent = join(work, 'video.mp4');
  ffmpeg([
    '-i', join(out, timeline.video),
    '-f', 'concat', '-safe', '0', '-i', captionTrack(captions, body),
    '-loop', '1', '-framerate', String(FPS), '-t', String(TITLE_SECONDS), '-i', join(work, 'title.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(END_SECONDS), '-i', join(work, 'end.png'),
    '-filter_complex', filter,
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart',
    silent,
  ]);
  const length = mediaSeconds(silent);

  // 4: the copies with sound.
  const shifted = captions.map((caption) => ({
    ...caption,
    start: caption.start + TITLE_SECONDS,
    end: caption.end + TITLE_SECONDS,
  }));
  const muted = join(dest, `${name}-captions-only.mp4`);
  ffmpeg([
    '-i', silent,
    '-f', 'lavfi', '-t', length.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart',
    muted,
  ]);
  const outputs = [muted];

  if (timeline.voice) {
    const narration = new Narration(join(out, 'tts'), true);
    const clips = shifted.map((caption) => narration.clip(caption.say));
    const inputs = clips.flatMap((clip) => ['-i', clip]);
    const delays = shifted
      .map((caption, index) => {
        const ms = Math.round((caption.start + VOICE_DELAY) * 1000);
        return `[${index + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${index}]`;
      })
      .join(';');
    const mix =
      `${shifted.map((_, index) => `[a${index}]`).join('')}` +
      `amix=inputs=${shifted.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${length.toFixed(3)}[voice]`;
    const narrated = join(dest, `${name}.mp4`);
    ffmpeg([
      '-i', silent,
      ...inputs,
      '-filter_complex', `${delays};${mix}`,
      '-map', '0:v', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      narrated,
    ]);
    outputs.unshift(narrated);
  }

  writeFileSync(
    join(dest, `${name}.captions.json`),
    JSON.stringify(
      shifted.map(({ start, end, text }) => ({
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text,
      })),
      null,
      2,
    ),
  );
  writeFileSync(
    join(dest, `${name}.srt`),
    shifted
      .map((caption, index) => `${index + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.text}\n`)
      .join('\n'),
  );
  for (const file of outputs) console.log(`${file}: ${mediaSeconds(file).toFixed(2)} s`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
