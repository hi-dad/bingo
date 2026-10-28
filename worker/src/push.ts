// Push notifications through Expo's push service: a plain HTTPS POST, and Expo delivers to
// Apple (APNs). Tokens Expo reports as no longer registered are forgotten.

import type { Env } from './env';

export interface Push {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

export async function pushTo(env: Env, emails: string[], push: Push) {
  if (!emails.length) return;
  const marks = emails.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(`SELECT token FROM devices WHERE email IN (${marks})`)
    .bind(...emails).all<{ token: string }>();
  const tokens = results.map((r) => r.token);
  // Expo takes up to 100 messages per request.
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch.map((to) => ({ to, sound: 'default', ...push }))),
    });
    if (!res.ok) {
      console.error('Expo push failed', res.status, await res.text());
      continue;
    }
    const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const gone = batch.filter((_, j) => data?.[j]?.details?.error === 'DeviceNotRegistered');
    if (gone.length) {
      await env.DB.prepare(`DELETE FROM devices WHERE token IN (${gone.map(() => '?').join(', ')})`).bind(...gone).run();
    }
  }
}

export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
