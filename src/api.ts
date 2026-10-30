import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import type { ArchivedBoard, Board, GameSummary, GameView } from '@shared/types';

const TOKEN_KEY = 'session';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(next: string | null) {
  token = next;
  if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Called when the server says the session is gone (expired, or signed out elsewhere).
export function setSignedOutHandler(fn: (() => void) | null) {
  onSignedOut = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    await saveToken(null);
    onSignedOut?.();
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'Something went wrong');
  return data as T;
}

export interface Me { email: string; name: string | null }
export interface SignInResult extends Me { token: string }

export const api = {
  config: () => request<{ dev: boolean }>('GET', '/api/config'),
  signIn: (provider: 'apple' | 'google' | 'dev', body: { idToken?: string; name?: string | null }) =>
    request<SignInResult>('POST', `/api/auth/${provider}`, body),
  signOut: () => request('POST', '/api/auth/signout'),
  me: () => request<Me>('GET', '/api/me'),
  setName: (name: string) => request<Me>('PUT', '/api/me', { name }),
  deleteAccount: () => request('DELETE', '/api/account'),
  registerPush: (pushToken: string) => request('POST', '/api/push/register', { token: pushToken }),

  games: () => request<GameSummary[]>('GET', '/api/games'),
  createGame: (name: string) => request<{ id: string }>('POST', '/api/games', { name }),
  join: (code: string) => request<{ id: string }>('POST', `/api/join/${encodeURIComponent(code)}`),
  game: (id: string) => request<GameView>('GET', `/api/games/${id}`),
  addPhrase: (id: string, target: string, text: string) => request<GameView>('POST', `/api/games/${id}/phrases`, { target, text }),
  deletePhrase: (phraseId: string) => request<GameView>('DELETE', `/api/phrases/${phraseId}`),
  start: (id: string) => request<GameView>('POST', `/api/games/${id}/start`),
  mine: (id: string) => request<Board>('GET', `/api/games/${id}/mine`),
  archivedBoard: (boardId: string) => request<ArchivedBoard>('GET', `/api/boards/${boardId}`),
  mark: (squareId: string, on: boolean) => request<GameView>('POST', `/api/squares/${squareId}/${on ? 'mark' : 'unmark'}`),

  // Keeping it friendly
  editPhrase: (phraseId: string, text: string) => request<GameView>('PUT', `/api/phrases/${phraseId}`, { text }),
  report: (phraseId: string, reason?: string) => request<GameView>('POST', `/api/phrases/${phraseId}/report`, { reason }),
  leave: (id: string) => request('POST', `/api/games/${id}/leave`),
  retire: (id: string, target: string) => request<GameView>('POST', `/api/games/${id}/retire`, { target }),
  remove: (id: string, player: string) => request<GameView>('POST', `/api/games/${id}/remove`, { player }),
  block: (id: string, player: string) => request('POST', `/api/games/${id}/block`, { player }),
  blocks: () => request<{ id: string; name: string }[]>('GET', '/api/blocks'),
  unblock: (blockId: string) => request('DELETE', `/api/blocks/${blockId}`),
};
