export interface Env {
  DB: D1Database;
  // Public sign-in identifiers (not secrets), set in wrangler.jsonc.
  APPLE_BUNDLE_ID?: string;
  APPLE_TEAM_ID?: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  APP_STORE_URL?: string;
  // Local development only (.dev.vars): turns on POST /api/auth/dev.
  DEV_EMAIL?: string;
  // Optional Expo access token, if push security is turned on for the Expo project.
  EXPO_ACCESS_TOKEN?: string;
}
