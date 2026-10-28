# Bingo (repo: hi-dad/bingo)

See AGENTS.md for Expo rules (SDK 58: check versioned docs, use `npx expo install`, never hand-edit ios/ or android/).

- Checks before calling anything done: `npm run typecheck` (app), `npm test` (worker Vitest suite), and `npm --prefix worker run typecheck`. `npx expo export --platform ios` confirms the app bundles.
- Installs use `legacy-peer-deps` (`.npmrc`): an optional web-only peer (react-dom) pins a newer React than SDK 58 ships. Keep the `.npmrc`, or `npm ci` on EAS fails.
- Worker locally: `npm run worker` (port 8787). The first time, run `npm --prefix worker run db:local`, with `worker/.dev.vars` holding `DEV_EMAIL=dev@example.com` for the dev sign-in.
- **Secrecy rule:** no Worker response may contain the asker's own pool or the squares of their own board, before blackout. All reads go through `gameView` in `worker/src/games.ts`. `test/api.test.ts` checks this; keep those tests passing.
- Emails never leave the server. Games refer to people by `members.id`.
- Marks are set/unset (never toggle), with conditional updates. Bingo and blackout use `... WHERE bingo_at IS NULL` so the push goes out once.
- Schema changes: everything in `worker/schema.sql` is `IF NOT EXISTS`. Add new statements; apply them with `npm --prefix worker run db:remote`.
- Sign-in mirrors Poozles (`hi-dad/puzzles` worker/auth.js): provider ID token → Worker session token (stored hashed) → bearer token in the Keychain.
- Owner stays anonymous: never put a real name in the repo, README or commits.
