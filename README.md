# Bingo

An iPhone app for playing bingo on the things your friends always say.

Everyone in a group has a board **about them**, written by everyone else. You can see and mark every board except your own. When someone says the thing, whoever hears it taps the square. When a line fills up, everyone gets a "BINGO'd" push notification.

## How a game goes
1. **Create** a game and send the invite link (`https://<domain>/join/CODE`) or the 6-character code to the group.
2. **Write**: for each friend, add things they always say. You never see what's written about you, only how many lines there are. Writers stay anonymous.
3. **Deal**: the creator picks 3×3, 4×4 or 5×5 (free center) once every pool has enough lines (9, 16 or 24). Each person gets a board dealt at random from their pool.
4. **Play** for days or weeks. Tap to cross off and tap again to undo. Your own board shows only progress ("one away from bingo 👀").
5. **Bingo** sends confetti and a push to the group. Play continues to a **blackout**, which reveals who wrote each line and lets the target finally see their own board.

## Code map
```
src/app/            Expo Router screens (sign-in, games, new, join, game hub, write, board, mine, settings)
src/                api client, auth (Apple + Google native sign-in), push, polling hook, components
shared/             bingo rules + API types, used by both the app and the Worker
worker/             Cloudflare Worker (API) + D1 schema + tests
```

- **App**: Expo (React Native, SDK 58) and Expo Router, built and shipped with EAS.
- **Backend**: a Cloudflare Worker with D1. Sign-in works like Poozles: the app gets an Apple or Google ID token, the Worker verifies it against the provider's keys, and the Worker issues its own session token, which is kept in the Keychain.
- **Sync**: polling, not live sockets. Screens reload on open, on returning to the foreground, on pull-to-refresh, and every 10 s. Marks are explicit set/unset operations with conditional updates, so two people tapping at once never clash. Bingo and blackout are each recorded and announced exactly once.
- **Secrecy is enforced by the server.** Every response is built for the person asking. Your own pool and board never leave the Worker, and you only get counts.
- **Push**: Expo push tokens. The Worker POSTs to Expo's push API, and Expo delivers through APNs.

## Run it
```
npm install                     # app
npm --prefix worker install     # worker
cp worker/.dev.vars.example worker/.dev.vars
npm --prefix worker run db:local
npm run worker                  # API at http://localhost:8787
npm test                        # worker tests (rules, sign-in, secrecy, clashes, push-once)
npm run typecheck               # app types
```
The app needs a **development build**, because Apple and Google sign-in are native modules that Expo Go doesn't include:
```
npx eas-cli@latest build --profile development --platform ios   # in Expo's cloud
EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:8787 npx expo start
```
In development builds, the sign-in screen shows a **Developer sign-in** (any name) when the Worker has `DEV_EMAIL` set. That lets one phone or simulator play as several people.

## Before the first real release
Fill in these placeholders. Search for `example.com` and `REPLACE_WITH`.
- `app.json`: the app name, `ios.bundleIdentifier`, `associatedDomains` (`applinks:<domain>`), `extra.apiUrl`, `extra.googleWebClientId`, `extra.googleIosClientId`, `extra.eas.projectId` (`npx eas-cli init`), and the Google plugin's `iosUrlScheme` (the reversed iOS client ID).
- `worker/wrangler.jsonc`: `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, the Google client IDs, `APP_STORE_URL`, and a custom-domain route for invite links. The D1 database `bingo` already exists with its tables. Deploy with `npx wrangler login` once, then `npm --prefix worker run deploy`.
- `worker/src/index.ts`: `REPLACE_WITH_SUPPORT_EMAIL` on the terms page (Apple wants a way to reach you about reports).
- Apple Developer: an App ID with **Sign in with Apple** and **Push Notifications**. Upload an APNs key to Expo (EAS sets this up when it asks during `eas build`).
- Google Cloud: an iOS OAuth client and a Web OAuth client. The Worker accepts tokens for either.
- App Store Connect: the privacy policy URL is `https://<domain>/privacy` and terms are at `/terms`. Account deletion is in Settings, as Apple requires.

## Keeping it friendly (App Store rule 1.2)
Friends write about each other, which Apple treats as user-generated content. The app has:
- a filter that refuses slurs and "kill yourself" style lines, names and game names (`worker/src/filter.ts`)
- **Report** on any line (⚑ in pools, press and hold on a board): hidden for everyone at once
- **People** screen: leave, remove (owner), block; blocked people are listed in Settings
- terms everyone agrees to at sign-in

Review reports (Apple expects action within 24 hours):
```
npx wrangler d1 execute bingo --remote --command "SELECT created_at, reporter, author, text, reason FROM reports WHERE resolved = 0"
npx wrangler d1 execute bingo --remote --command "UPDATE reports SET resolved = 1 WHERE id = '<id>'"
```
