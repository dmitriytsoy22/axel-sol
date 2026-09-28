# Demo video recorder

Records the product demo for Colosseum: a paced walk through the live app in Chromium, cut and captioned with ffmpeg, under 3 minutes. It never shows slides. Everything on screen is the real app, and every step is a real transaction.

The walkthrough, in order:

1. The home page: the hero and the live chain figures, then a car that is still raising.
2. That car: the on-chain metadata, the illustrative photo, raise progress with the live escrow, and the state timeline.
3. Demo access for a wallet: a signed message gives the wallet a demo KYC record and test tenge.
4. Buying two shares in the open raise, with the purchase dialog's escrow and refund explanation.
5. Five shares of a car on the road from the demo desk.
6. A simulated month of income and the claim, then the wallet's tKZT balance before and after it.
7. The portfolio with both positions, and a transfer to a wallet without KYC that the app stops, because the transfer hook would refuse it.
8. "Check the car's data yourself": the browser rebuilds the telemetry hash chain and matches every report hash.
9. The proof of solvency.
10. The console as the platform admin: a funded car's raise released with a purchase-papers hash, the emptied escrow, and the fees.

The captions are written in [`storyline.ts`](storyline.ts). Figures in them, such as the balance and the fees, are read from the page. They claim nothing about users, partners or revenue. The cluster and the fictional demo fleet are named on the title card, on a badge in the caption strip for the whole video, and on the end card.

## How it works

- **`record.ts`** drives the app with Playwright and records a 1920x960 WebM. The page is laid out at 1280x640 and rendered at 1.5x, so the text reads like a laptop screen. A drawn pointer follows the mouse, and a cyan frame marks what each caption talks about ([`browser/overlay.js`](browser/overlay.js)).
- **`director.ts`** keeps the timeline while it records. Each caption stores when it starts and ends, and each wait nobody needs to watch is marked as a cut: page loads, transactions, wallet approvals. A caption stays on screen for its reading time, or for its narration if that is longer, counting only the time the edit keeps. The captions therefore stay in sync after the cuts.
- **`produce.ts`** makes the videos from `raw.webm` and `timeline.json`:
  1. it drops the cuts and the time before the first caption and after the last;
  2. it puts the recording above a 120-pixel strip for a 1920x1080 frame, and burns the captions into the strip, drawn as PNGs with the app's fonts, so no caption covers the app and ffmpeg needs neither libass nor drawtext;
  3. it adds a title card and an end card.
- **Narration.** On macOS, `say` (voice Samantha) reads each caption. The recorder measures each clip before it records, and the producer lays the clips under the edit. `--no-voice`, or any system without `say`, gives captions only.

## Record on the local stack

The local stack is the end-to-end suite's ([`frontend/e2e/stack`](../../frontend/e2e/stack/global-setup.ts)): a validator with `axel_v2`, the demo seed at `--scale small` (eight cars), the backend, the published-data server, and `next dev` with the burner test wallet (`NEXT_PUBLIC_E2E=1`). Its prerequisites are the suite's:

```bash
anchor build -p axel_v2                     # repository root: target/deploy/axel_v2.so
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix scripts/seed-devnet
cd scripts/demo-video && npm ci
```

Then, from `scripts/demo-video`:

```bash
npm run stack      # terminal 1: about 6 minutes until "Stack ready"; Ctrl-C stops it
npm run record     # terminal 2: about 3 minutes; writes out/raw.webm and out/timeline.json
npm run produce -- --name AXEL-demo-localnet
```

`npm run record -- --stack` starts the stack, records and stops it in one go. Each recording uses a fresh burner wallet. The console scene releases the stack's funded raise, so a second take against the same stack finds no funded car and shows only the fees; restart the stack for a full take.

`produce` writes these files to `--dest`, or to `out/` without it:

| File | What it is |
|---|---|
| `AXEL-demo-localnet.mp4` | H.264 and AAC at 1080p, with captions and narration |
| `AXEL-demo-localnet-captions-only.mp4` | the same video with a silent audio track |
| `AXEL-demo-localnet.captions.json` | `[{ start, end, text }]` in seconds on the final video |
| `AXEL-demo-localnet.srt` | the same captions as subtitles, for YouTube's closed captions |

## Options

| Flag | Environment | Default | |
|---|---|---|---|
| `--base-url` | `DEMO_BASE_URL` | the local stack, `http://127.0.0.1:13190` | the site to record |
| `--cluster` | `DEMO_CLUSTER` | `localnet` locally, else `devnet` | named in the captions and on the cards |
| `--wallet burner\|phantom` | `DEMO_WALLET` | `burner` locally, else `phantom` | the burner exists only in the local stack |
| `--out` | `DEMO_OUT` | `scripts/demo-video/out` | for `record` and `produce` |
| `--dest` | `DEMO_DEST` | `--out` | `produce` only: where the finished videos and captions go |
| `--extension-dir` | `DEMO_EXTENSION_DIR` | | the unpacked Phantom extension, for `--wallet phantom` |
| `--profile-dir` | `DEMO_PROFILE_DIR` | `scripts/demo-video/.phantom-profile` | the browser profile Phantom lives in |
| `--stack` | | | start and stop the local stack around the recording |
| `--headed` | | | show the browser while recording with the burner |
| `--no-voice` | | | captions only |
| `--no-console` | | | end at the proof of solvency, without the admin console |
| `--setup` | | | open the Phantom profile to set the wallet up; records nothing |
| `--rehearse` | | | walk the storyline without holding the captions, to check it against a site quickly |

## Record the deployed devnet site with Phantom

The burner wallet exists only in a build made with `NEXT_PUBLIC_E2E=1`, which no deployment has. On the deployed site the recorder uses Phantom in a visible Chromium window: the script drives the pages, and you approve each Phantom request. The waits for your approvals are cut from the video.

1. **Get the Phantom extension as a folder.** Install Phantom in Google Chrome. Chrome keeps it unpacked at `~/Library/Application Support/Google/Chrome/Default/Extensions/bfnaelmomeimhlpmgjnjophhpkkoljpa/<version>_0`. Use that path as `DEMO_EXTENSION_DIR`; with another Chrome profile, `Default` is `Profile 1` or similar.
2. **Set Phantom up once in the recorder's profile.** Run
   ```bash
   DEMO_EXTENSION_DIR=… npm run record -- --setup
   ```
   In the window it opens, create or import a wallet with no demo access yet. Turn on Settings → Developer Settings → Testnet Mode, with Solana Devnet. Then close the window. The profile is kept in `.phantom-profile/`, which git ignores.
3. **Record.**
   ```bash
   DEMO_BASE_URL=https://<the deployed site> DEMO_EXTENSION_DIR=… npm run record
   ```
   Approve in Phantom when the terminal asks: connect, sign the demo access message, confirm the purchase, and confirm the claim. If the site uses Cloudflare Turnstile, pass its check in the window when the demo step shows it.

   Before the console scene, the terminal asks you to switch Phantom to the platform admin's account. The console then opens as that account, and releasing a funded raise needs one more approval. Without the admin key in Phantom, record with `--no-console`.
4. **Produce.** `npm run produce -- --name AXEL-demo-devnet`. The cards then say Solana devnet instead of localnet.

Demo access is granted once per wallet, so each take needs a new Phantom account (Phantom → Add / Connect Wallet → Create new account). The limits of the demo routes are in [docs/api.md](../../docs/api.md#judge-demo-api): three accesses per IP address a day, and one simulated month a minute across all wallets.

A take can also be recorded by hand with a screen recorder. Follow the same pages in the same order, and read the captions from `AXEL-demo-localnet.captions.json`.
