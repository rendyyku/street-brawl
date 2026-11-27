# Street Brawl — Claude Code Guide

2D arcade fighting game for the browser (mobile-first), plain ES modules, no build step.
Canvas renderer, deterministic 60 Hz engine, WebRTC (PeerJS) online mode, Netlify static hosting.

## Commands

```bash
npm test                     # node --test tests/*.test.mjs — must stay green, add tests with every feature
python -m http.server 8080   # serve repo root, open http://localhost:8080/
```

Visual check of one fighter with the real renderer (4 panels: special, ULTI 1 cut-in, ULTI 2 cut-in, ULTI 2 beam):

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --window-size=960,2176 --virtual-time-budget=8000 \
  --screenshot="C:\\Users\\phantom\\street-brawl\\.work\\preview_<id>.png" \
  "http://localhost:8080/tools/preview.html?id=<id>&stage=neon-alley"
```

Then Read the PNG and actually look at it before claiming the fighter works.

## Layout

| Path | What |
| --- | --- |
| `js/engine.js` | Deterministic fight simulation (states, frame data, hit/block, ULTI 1 rush, ULTI 2 super, rounds). No DOM. |
| `js/constants.js` | Frame data (`MOVES`), `ULTIMATE_THEMES`, `ARCHETYPES`, `STAGES`, `ULTI1_COST`. |
| `js/roster.js` | `BUILTIN_FIGHTERS`, custom fighter storage, `sanitizeRemoteFighter`. |
| `js/renderer.js` | Canvas drawing: stage, sprites (4×4 sheet or 1×N strips), projectiles per theme, cut-ins, camera, particles. |
| `js/audio.js` | CC0 samples via WebAudio + synth fallback, BGM, announcer, per-fighter voice clips, volumes. |
| `js/main.js` | Screens, HUD, game loop, online wiring. |
| `tools/process_sprite.py` | Asset processor (sheet / strip / cutin modes). |
| `tools/preview.html` | Headless visual check page (see above). |
| `.work/` | **Gitignored** scratch: reference photos, raw generations, prompts. Never commit it. |

## Conventions

- Engine stays pure and deterministic (no `Math.random`, no DOM) — online sync and tests depend on it.
- New engine events go through `this.emit(...)`; renderer/audio react in `handleEvents` / `handleAudioAndFx`.
- Asset paths in fighters are relative `assets/...`; online peers only accept those (`sanitizeRemoteFighter`).
- Match the surrounding code style (2-space JS, single quotes, small focused comments).
- Work on a feature branch and open a PR; don't push straight to `main`.

---

## SOP: Tambah Karakter Otomatis

The owner sends **1 photo + character name + Ulti 1 theme + Ulti 2 theme** (optionally archetype,
special move idea, voice clips). Do all of the following without asking again, unless something
is genuinely missing (e.g. no Ulti themes at all).

Content rules: characters may be parodies of public figures, but keep them friendly and
non-demeaning; no national emblems, flags or text in generated art; skip voice clips that insult.
The raw photo stays in `.work/` and is never committed.

### 0. Setup

```bash
cd ~/street-brawl
mkdir -p .work
cp "<photo path>" .work/<id>_ref.jpg
python -c "from PIL import Image; im=Image.open('assets/fighters/nadia_sheet.webp').convert('RGBA'); bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im); bg.convert('RGB').save('.work/nadia_sheet_ref.png')"
python -c "from PIL import Image; im=Image.open('assets/fighters/nadia_ultimate.webp').convert('RGBA'); bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im); bg.convert('RGB').save('.work/nadia_ultimate_ref.png')"
cp assets/fighters/nadia_cutin.webp .work/nadia_cutin_ref.webp
```

`<id>` = lowercase name, letters/digits/underscore only (e.g. `owi`).

### 1. Generate art with Codex

Always: `codex exec --skip-git-repo-check --sandbox workspace-write -i <img> -i <img> - < prompt.txt`
run **from `.work/`**. Put the prompt in a file and pass it via stdin (`-`): `-i` takes multiple
values and would swallow a positional prompt. Never use `--full-auto`.
The three generations are independent — run cut-in and ultimate strip in parallel once the sheet exists.

**a) Sprite sheet** — `.work/p_sheet.txt`, images: `<id>_ref.jpg`, `nadia_sheet_ref.png`

```
You are generating game art for a lighthearted 2D chibi fighting game. Use your image generation tool.

Attached image 1 (<id>_ref.jpg) is the appearance reference for a new playable character named <NAME>:
<1-2 sentence description of hair, face, outfit colours from the photo>. Attached image 2
(nadia_sheet_ref.png) is the STRICT art-style reference sheet (chibi proportions, thick black
outlines, cel shading, layout).

Create ONE image: a 4x4 sprite sheet of <NAME> in exactly the same chibi style, size and layout as
image 2. Square 1024x1024, solid flat magenta #FF00FF background, no grid lines, no text, no floor
shadows. All 16 poses face RIGHT with consistent height and foot line, each pose fully inside its
own cell with margin:
Row 1: idle 1, idle 2 (slight breathing), walk 1, walk 2.
Row 2: crouch, jump, block (forearms crossed), hurt (recoiling, eyes squeezed).
Row 3: light punch, heavy punch, low kick, high kick.
Row 4: special charge (<special prop/energy>), special release (<projectile> thrown forward),
knockdown lying flat on the ground (dizzy swirl eyes, nothing else in this cell), victory pose.
Keep it friendly and humorous, not mocking. Save the final image as <id>_sheet.png in the current
directory. Reply only with the saved path.
```

Read `.work/<id>_sheet.png` and check: 16 poses, facing right, magenta background, style matches Nadia.
Regenerate once with a sharper prompt if it doesn't.

**b) Ulti 2 cut-in** — `.work/p_cutin.txt`, images: `<id>_sheet.png`, `nadia_cutin_ref.webp`

```
Use your image generation tool. Attached image 1 (<id>_sheet.png) is the character <NAME> (chibi
fighting game, thick black outlines, <outfit>). Attached image 2 is the STYLE reference for an
ultimate cut-in banner.

Create ONE 16:9 image (1024x576), anime close-up cut-in of <NAME> for the ultimate "<ULTI 2 NAME>":
<expression + pose>, on a dramatic background of <Ulti 2 theme scenery>, <palette>. Same cel-shaded
outline style. No text, no letters, no logos, no national emblems or flags. Keep the face on the
LEFT 40% of the frame. Heroic and friendly. Save as <id>_cutin.png in the current directory.
Reply only with the saved path.
```

**c) Ulti 2 animation strip** — `.work/p_ult.txt`, images: `<id>_sheet.png`, `nadia_ultimate_ref.png`

```
Use your image generation tool. Attached image 1 (<id>_sheet.png) is the character <NAME>. Attached
image 2 is the STRICT format reference: a horizontal strip of 6 frames, 1 row x 6 columns, solid
magenta background.

Create ONE image: a horizontal 1x6 animation strip (about 1920x320) of <NAME> performing the ultimate
"<ULTI 2 NAME>", same chibi style and thick black outlines, all frames facing RIGHT, same character
height and foot line in every frame, each frame clearly separated by empty magenta space:
1 <wind-up>, 2 <charge>, 3 <signature build-up>, 4 <release starts>, 5 <full beam/finisher to the
right with themed objects>, 6 <victory pose>.
Solid flat magenta #FF00FF background, no text, no grid lines, no floor shadow. Save as
<id>_ultimate.png in the current directory. Reply only with the saved path.
```

### 2. Process assets

```bash
python tools/process_sprite.py sheet .work/<id>_sheet.png    assets/fighters/<id>_sheet.webp --portrait assets/fighters/<id>_portrait.webp
python tools/process_sprite.py strip .work/<id>_ultimate.png assets/fighters/<id>_ultimate.webp --frames 6
python tools/process_sprite.py cutin .work/<id>_cutin.png    assets/fighters/<id>_cutin.webp
```

- `sheet`: trims white borders, chroma-keys `#FF00FF`, deletes fragments that leaked across cell edges, writes the 160×160 portrait from the idle cell.
- `strip`: splits at the emptiest columns near each frame boundary (no pose cut in half), re-packs into equal cells on one foot line.
- `cutin`: trims white borders, cover-crops to exactly 1024×576.

Look at the outputs (composite strips over a dark background with split lines if unsure).

### 3. Theme + roster

1. If the Ulti theme is new, add it to `ULTIMATE_THEMES` in `js/constants.js`
   (`id, label, bgTop, bgBottom, primary, secondary, core, accent, bannerTag, particleStyle`).
   `particleStyle` is one of `spark | heart | code | cone | petal`; add a new drawer in
   `renderer.js` (`updateAndDrawParticles`) only if the theme really needs one.
2. Optional themed visuals in `js/renderer.js`: cut-in band motif (`drawUltimateCutIn`),
   Ulti 2 projectile (`drawProjectile`, branch on `proj.ultimateTheme`), special projectile style
   (`projectileStyle` on the fighter, e.g. `'bicycle'`).
3. Optional theme jingle in `js/audio.js` (`playSuper` / `playRush` branches).
4. Append to `BUILTIN_FIGHTERS` in `js/roster.js`:

```js
{
  id: '<id>',
  name: '<NAME>',
  title: '<short title>',
  archetype: 'shotokan', // shotokan | striker | speedster | brawler
  specialName: '<SPECIAL>',
  rushName: '<ULTI 1 NAME>',
  rushQuote: '<ULTI 1 line>',
  superName: '<ULTI 2 NAME>',
  superQuote: '<ULTI 2 line>',
  ultimateTheme: '<theme id>',
  spriteSheet: 'assets/fighters/<id>_sheet.webp',
  portrait: 'assets/fighters/<id>_portrait.webp',
  ultimateCutin: 'assets/fighters/<id>_cutin.webp',
  animations: {
    ultimate: { src: 'assets/fighters/<id>_ultimate.webp', frames: 6, fps: 30 },
  },
  // voice: { fight, rush, super, hurt, ko, victory, timeOver } -> 'assets/audio/<id>/<clip>.mp3' (optional)
  colors: { primary: '#...', accent: '#...', energy: '#...', energyCore: '#...' },
  isCustom: false,
},
```

5. Voice clips (optional): short mp3s in `assets/audio/<id>/`, list their source and license in
   `assets/audio/CREDITS.md`. Tell the owner when a source has no clear license before pushing.

### 4. Verify, then report

1. `npm test` — `tests/roster.test.mjs` fails if any referenced asset file is missing.
2. Serve the repo and screenshot `tools/preview.html?id=<id>` (command at the top); Read the image.
3. Open http://localhost:8080/ for the owner to play.
4. Commit on a feature branch, push, and give the owner the PR link plus where the raw art lives (`.work/`).
