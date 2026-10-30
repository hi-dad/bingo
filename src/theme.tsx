// Color themes, picked in Settings. One layout (soft cards, progress ring, bottom tabs) in
// three palettes, including dark mode. Text on every fill passes 4.5:1. The choice is
// kept on the device.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

// The style-object shape StyleSheet.create accepts (React Native doesn't export it by name).
type Styles = Parameters<typeof StyleSheet.create>[0];
import * as SecureStore from 'expo-secure-store';

export interface Theme {
  name: ThemeName;
  label: string;
  bg: string; // screen background
  card: string; // cards and unmarked squares
  ink: string; // main text
  muted: string; // secondary text
  line: string; // hairlines and borders
  accent: string; // crossed-off squares
  accentInk: string; // text on accent
  strong: string; // buttons, active tab, ring, progress fills
  strongInk: string; // text on strong
  soft: string; // tracks, chips, quiet fills
  free: string; // the free square
  win: string; // a bingo line on the mini boards (text on it is white)
  freeInk: string;
  danger: string;
  shadow: string;
}

export type ThemeName = 'purple' | 'blue' | 'dark';

export const THEMES: Record<ThemeName, Theme> = {
  purple: {
    name: 'purple', label: 'Purple',
    bg: '#F6F4FE', card: '#FFFFFF', ink: '#24213A', muted: '#5E5A78', line: '#E7E3F7',
    accent: '#6655D6', accentInk: '#FFFFFF', strong: '#6655D6', strongInk: '#FFFFFF',
    soft: '#E9E5FB', free: '#CDEFE0', freeInk: '#1E5C43', win: '#D9542B', danger: '#C2352B', shadow: '#3C328C',
  },
  blue: {
    name: 'blue', label: 'Blue',
    bg: '#F2F7FF', card: '#FFFFFF', ink: '#16233F', muted: '#4B5A78', line: '#DCE6F7',
    accent: '#3366D6', accentInk: '#FFFFFF', strong: '#3366D6', strongInk: '#FFFFFF',
    soft: '#DCE7FB', free: '#CFE0FF', freeInk: '#2A55B8', win: '#D9542B', danger: '#B3261E', shadow: '#1E46A0',
  },
  dark: {
    name: 'dark', label: 'Dark',
    bg: '#11131A', card: '#1C1F2A', ink: '#F7F5FF', muted: '#B8B3CA', line: '#343849',
    accent: '#9C8CFF', accentInk: '#18132E', strong: '#8A78F2', strongInk: '#FFFFFF',
    soft: '#2B2E40', free: '#285442', freeInk: '#DDF8EC', win: '#FF7043', danger: '#FF7168', shadow: '#000000',
  },
};

export const THEME_ORDER: ThemeName[] = ['purple', 'blue', 'dark'];

// Player avatars: the same in every theme, picked by join order.
const AVATARS = [
  { bg: '#FFD6E4', ink: '#7A1F43' },
  { bg: '#FFE6B8', ink: '#6B4405' },
  { bg: '#CFF1DE', ink: '#155A35' },
  { bg: '#CFE0FF', ink: '#1F3F8A' },
  { bg: '#E6DDFF', ink: '#3F2A8C' },
  { bg: '#FFDCC7', ink: '#7A3410' },
  { bg: '#D7F0F5', ink: '#0F4C5C' },
  { bg: '#F3D9F7', ink: '#6A1F78' },
];
export const avatarColors = (index: number) => AVATARS[((index % AVATARS.length) + AVATARS.length) % AVATARS.length];

export const radius = { sm: 12, md: 16, lg: 22, xl: 24 };

const KEY = 'theme';

interface ThemeState {
  t: Theme;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeState>({ t: THEMES.purple, setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>('purple');

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((saved) => {
      if (saved && saved in THEMES) setName(saved as ThemeName);
      else if (saved === 'sky') setName('blue');
      else if (saved === 'lilac' || saved === 'peach' || saved === 'mint') setName('purple');
    }).catch(() => {});
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setName(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ t: THEMES[name], setTheme }), [name, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

// Styles that depend on the theme: `const useStyles = makeStyles((t) => ({ … }))`, then
// `const s = useStyles()` in a component. Built once per theme.
export function makeStyles<T extends Styles>(build: (t: Theme) => T & Styles): () => Readonly<T> {
  const cache = new Map<ThemeName, Readonly<T>>();
  return function useStyles() {
    const { t } = useTheme();
    let styles = cache.get(t.name);
    if (!styles) {
      styles = StyleSheet.create(build(t));
      cache.set(t.name, styles);
    }
    return styles;
  };
}

export const shadow = (t: Theme, strength = 1) => ({
  shadowColor: t.shadow,
  shadowOpacity: 0.08 * strength,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
});
