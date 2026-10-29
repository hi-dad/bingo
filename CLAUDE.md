# Bingo (repo: hi-dad/bingo)

See AGENTS.md for Expo rules (SDK 58: check versioned docs, use `npx expo install`, never hand-edit ios/ or android/).

- Checks before calling anything done: `npm run typecheck` (app), `npm test` (worker Vitest suite), and `npm --prefix worker run typecheck`. `npx expo export --platform ios` confirms the app bundles.
- Installs use `legacy-peer-deps` (`.npmrc`): an optional web-only peer (react-dom) pins a newer React than SDK 58 ships. Keep the `.npmrc`, or `npm ci` on EAS fails.
- Worker locally: `npm run worker` (port 8787). The first time, run `npm --prefix worker run db:local`, with `worker/.dev.vars` holding `DEV_EMAIL=dev@example.com` for the dev sign-in.
- Simulator build on this Mac: `EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo run:ios`. CocoaPods (Homebrew) fails with an encoding error unless `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` is set. `npx expo lint` isn't set up; running it installs ESLint into package.json.
- Demo data: with the Worker running, `npm run demo` wipes the LOCAL games and seeds one game per journey (sign in as "An"). Leave the simulator for the owner to click through; don't drive it unless asked.
- Boards are always 5×5 with no free square (25 lines). The Worker ignores any `size` an older app sends. No emoji anywhere in the app or push text; icons are SVG in `src/components/Icon.tsx`.
- **Secrecy rule:** no Worker response may contain the asker's own pool or the squares of their own board, before blackout. All reads go through `gameView` in `worker/src/games.ts`. `test/api.test.ts` checks this; keep those tests passing.
  The one exception is `myMarks`: which positions of your own board are crossed off, as booleans, never the lines.
- Endless rounds: `boards.round`. A late joiner, or anyone whose latest board blacked out, collects unused lines (not on any square) until `dealNext` deals their next board. Blacked-out boards are locked.
- Oct 2026: the `boards` UNIQUE changed to `(game_id, target, round)`. `IF NOT EXISTS` can't change an existing table, so before the first deploy run once: `npx wrangler d1 execute bingo --remote --command "DROP TABLE boards"` (it's empty), then `npm --prefix worker run db:remote`.
- Emails never leave the server. Games refer to people by `members.id`.
- Marks are set/unset (never toggle), with conditional updates. Bingo and blackout use `... WHERE bingo_at IS NULL` so the push goes out once.
- Schema changes: everything in `worker/schema.sql` is `IF NOT EXISTS`. Add new statements; apply them with `npm --prefix worker run db:remote`.
- Sign-in mirrors Poozles (`hi-dad/puzzles` worker/auth.js): provider ID token → Worker session token (stored hashed) → bearer token in the Keychain.
- Owner stays anonymous: never put a real name in the repo, README or commits.
