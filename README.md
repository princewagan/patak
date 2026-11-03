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

Controls: see "Controlling it during the presentation" below.

### Shortcuts while working
| URL | What it does |
|---|---|
| `/?from=kami` | start at a chapter (`intro sobre kaha bigas gabi totoo kami labas bahay ulit end`) |
| `/?scene=car` | play one scene alone (`jeep kaha bigas gabi car labas baha ulit ending`) |
| `/?scene=jeep&beat=again` | a specific beat of a scene |
| `&state={"sobre":false}` | force earlier choices (e.g. to test the "didn't help" branches) |
| `&fast` | speeds through the text |
| `&auto` | skips the title screen |
| `&autopick=0`, `1` or `none` | answers every choice for you, or lets every timer run out |

## Controlling it during the presentation

**P** or **Esc** opens the pause menu (or move the mouse and click the pause button, top right). It freezes everything, including the choice timer.

- **Ituloy:** carry on
- **Laktawan ang eksena:** skip to the next scene, keeping his choices
- **Mga Eksena:** jump to any scene
- **Tunog:** sound on or off (also **M**)
- **Fullscreen:** also **F**
- **Simulan muli:** start over

A skip or jump reloads the game: click **Ituloy** to carry on. **Space** or a click moves past a line. In a choice use **←** / **→** or click; in the questions use **1** / **2**.

## How it's built

- **three.js** scenes with filmic post-processing (`src/engine/engine.js`): bloom, depth of field, grain, vignette, a color grade per scene, and letterbox bars.
- **Part One / Two / Four** (the invented everyday day) are built in code: `src/scenes/jeep.js`, `kaha.js`, `bigas.js`, `gabi.js`, `ulit.js`.
  People are procedural skinned bodies (`src/engine/person.js`, `body.js`), and textures are CC0 from Poly Haven (`public/tex`).
- **Part Three** (our real Aug 17) uses **our actual photos turned into 3D**. Each photo has a depth map made with
  Depth Anything V2 (`npm run depth` regenerates them into `public/depth/`), and `src/engine/photo3d.js` pushes every
  pixel out to its depth, so the camera can move through the photo. `car.js` is the windshield (with a real
  rain-on-glass shader, `src/engine/glass.js`); `labas.js` walks from the car door into the real photo of the submerged jeep; `baha.js` carries on in the photos' real time order.
- The story runner is `src/story.js` (chapters in order). The UI (subtitles, choices, the patak marker, the summary) is in `src/engine/director.js`.
- Sound runs through `src/engine/audio.js`. `public/audio/flood-real.mp3` is the real audio from our 3:50 PM video.

## Splats (Prince)

Any stop in `src/scenes/baha.js` can use a Gaussian splat instead of a photo:

1. Put the file in `public/splats/` (`.spz .ply .splat .ksplat .sog` all work, via [Spark](https://sparkjs.dev)).
2. Find your shot with the viewer: `/?scene=splat&file=/splats/street.spz`. Drag to look, WASD to move, Q/E for down/up,
   shift for speed. Press **P** to print the camera to the console.
3. In `STOPS` in `baha.js`, add `splat: '/splats/street.spz'` to the stop, and set `start`, `look` and `move` to the values you printed.
   Use `splatOpts: { position, rotation, scale }` if it loads sideways (most phone captures need the default `rotation: [Math.PI, 0, 0]`).

If a splat fails to load, that stop falls back to the photo automatically.

## Sound

Real Philippine field recordings by kevp888 (Freesound, CC BY), plus CC0 and public-domain sounds. Full list in `public/audio/CREDITS.md`. The piano score is generated live in `src/engine/music.js`.

## Privacy
The locals' faces in the two selfies (3:01 PM, 3:38 PM) are softly blurred in this public repo. We never asked their
names, and they never asked to be online. The originals are on our phones.

## Deploy
Vercel, static Vite build (`npm run build` → `dist/`).
