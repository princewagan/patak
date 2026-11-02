# PATAK

An interactive story for our THEO 12 oral exam (Gacusan & Wagan). Sir plays it.
The full story, every scene and every choice, is in **[STORY.md](STORY.md)**. Read that first.

> *Patak*: one drop. A small act feels like nothing against a flood, so why bother? That's "ganyan talaga."
> But *patak-patak* is also how we chip in. Drops add up only if they keep falling.

## Run it

```bash
npm install
npm run dev          # http://localhost:5199
```

Controls: **click / Space** advances lines, **← / →** picks choices, **F** fullscreen, **M** mute.

### Shortcuts while working
| URL | What it does |
|---|---|
| `/?from=kami` | start at a chapter (`intro sobre kaha bigas gabi totoo kami ulit end`) |
| `/?scene=car` | play one scene alone (`jeep kaha bigas gabi car baha ulit ending`) |
| `/?scene=jeep&beat=again` | a specific beat of a scene |
| `&state={"sobre":false}` | force earlier choices (e.g. to test the "didn't help" branches) |
| `&fast` | speeds through the text |
| `&auto` | skips the title screen |

## How it's built

- **three.js** scenes with filmic post-processing (`src/engine/engine.js`): bloom, depth of field, grain, vignette, a color grade per scene, and letterbox bars.
- **Part One / Two / Four** (the invented everyday day) are built in code: `src/scenes/jeep.js`, `kaha.js`, `bigas.js`, `gabi.js`, `ulit.js`.
  People are procedural (`src/engine/person.js`), and textures are CC0 from Poly Haven (`public/tex`).
- **Part Three** (our real Aug 17) uses **our actual photos turned into 3D**. Each photo has a depth map made with
  Depth Anything V2 (`npm run depth` regenerates them into `public/depth/`), and `src/engine/photo3d.js` pushes every
  pixel out to its depth, so the camera can move through the photo. `car.js` is the windshield (with a real
  rain-on-glass shader, `src/engine/glass.js`); `baha.js` is us on foot, in the photos' real time order.
- The story runner is `src/story.js` (chapters in order). The UI (cards, subtitles, choices, the patak marker) is in `src/engine/director.js`.
- Sound is synthesized live (`src/engine/audio.js`), except `public/audio/flood-real.mp3`, which is the real audio from our 3:50 PM video.

## Splats (Prince)

Any stop in `src/scenes/baha.js` can use a Gaussian splat instead of a photo:

1. Put the file in `public/splats/` (`.spz .ply .splat .ksplat .sog` all work, via [Spark](https://sparkjs.dev)).
2. Find your shot with the viewer: `/?scene=splat&file=/splats/street.spz`. Drag to look, WASD to move, Q/E for down/up,
   shift for speed. Press **P** to print the camera to the console.
3. In `STOPS` in `baha.js`, add `splat: '/splats/street.spz'` to the stop, and set `start`, `look` and `move` to the values you printed.
   Use `splatOpts: { position, rotation, scale }` if it loads sideways (most phone captures need the default `rotation: [Math.PI, 0, 0]`).

If a splat fails to load, that stop falls back to the photo automatically.

## Privacy
The locals' faces in the two selfies (3:01 PM, 3:38 PM) are softly blurred in this public repo. We never asked their
names, and they never asked to be online. The originals are on our phones.

## Deploy
Vercel, static Vite build (`npm run build` → `dist/`).
