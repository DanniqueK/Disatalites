# Disatalites

Turn-based roguelike set on a half-dead orbital station above a post-apocalyptic Earth. You wake up in a misfiring clone pod and slowly take back the station section by section, run drones outside, scan and hack foreign stations, and eventually help Earth factions rise from their bunkers.

## Play

Plain HTML, CSS and native ES modules: no build step, no dependencies (it loads one web font from Google Fonts).

Browsers don't load ES modules from `file://`, so serve the folder over HTTP, for example:

```sh
npx serve .
# or: python -m http.server
```

Then open the printed URL. VS Code's Live Server extension works too.

To host it, enable GitHub Pages for this repository (Settings > Pages > deploy from the `main` branch, root folder).

## Controls

- WASD / arrows / numpad / vi keys: move (hold two WASD keys for diagonals)
- Click a machine, or press U next to it: use it
- R: wait 10 turns · F: fire · G: pick up · L: log · T: labels · ?: help
- Touch: on-screen pad, tap to walk, tap to use

## Development

The game needs no build. The npm packages are dev tools only (Node 20 or newer):

```sh
npm install
npm run check   # format check, lint, type check and tests, the same as CI
```

| Script              | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm start`         | Serve the game locally                                     |
| `npm run format`    | Format everything with Prettier                            |
| `npm run lint`      | ESLint                                                     |
| `npm run typecheck` | TypeScript checks the JavaScript (`checkJs`) and its JSDoc |
| `npm test`          | Unit tests with Vitest (`test/`)                           |

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck` and `test` on every pull request and push to `main`.

## Documentation

See [docs/GAME.md](docs/GAME.md) for a full feature list and a walkthrough of how the code in `src/` works.
