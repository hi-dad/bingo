// Keeps a game fresh by polling: on screen focus, when the app comes back to the
// foreground, and every 10 s while the screen is open. Responses are numbered so an older
// poll can never overwrite the newer result of something you just did.

import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { api, ApiError } from './api';
import type { GameView } from '@shared/types';

const POLL_MS = 10_000;

export function useGame(id: string) {
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sent = useRef(0);
  const applied = useRef(0);

  const track = useCallback(async (fn: () => Promise<GameView>): Promise<GameView | null> => {
    const n = ++sent.current;
    const view = await fn();
    if (n < applied.current) return null; // something newer already landed
    applied.current = n;
    setGame(view);
    setError(null);
    return view;
  }, []);

  const load = useCallback(async () => {
    try {
      await track(() => api.game(id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setGame(null);
        setError('This game is no longer available.');
        router.dismissTo('/');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }, [id, track]);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Run an action that answers with the updated game (add a line, mark a square…).
  const act = useCallback((fn: () => Promise<GameView>) => track(fn), [track]);

  return { game, error, refreshing, refresh, act };
}
