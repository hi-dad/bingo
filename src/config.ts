import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  eas?: { projectId?: string };
};

// EXPO_PUBLIC_API_URL (e.g. http://localhost:8787 for `npm run worker`) wins over app.json.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || '').replace(/\/$/, '');
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId || '';
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId || '';
export const EAS_PROJECT_ID = extra.eas?.projectId || '';

export const inviteLink = (code: string) => `${API_URL}/join/${code}`;
