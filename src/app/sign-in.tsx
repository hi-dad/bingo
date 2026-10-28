import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SignInButtons } from '@/components/SignInButtons';
import { Muted, useUi } from '@/components/ui';
import { API_URL } from '@/config';
import { makeStyles, radius, shadow } from '@/theme';

const PREVIEW = ['“Literally”', 'Mentions the gym', 'free ✦', 'Late again', '“No because…”', 'Brings up the ex'];

export default function SignIn() {
  const ui = useUi();
  const s = useStyles();
  return (
    <SafeAreaView style={[ui.screen, s.wrap]}>
      <View style={s.hero}>
        <View style={s.preview}>
          {PREVIEW.map((text, i) => (
            <View key={text} style={[s.tile, i % 2 === 0 && s.tileOn, i === 2 && s.tileFree]}>
              <Text style={[s.tileText, i % 2 === 0 && s.tileOnText, i === 2 && s.tileFreeText]}>{text}</Text>
            </View>
          ))}
        </View>
        <Text style={s.title}>Bingo</Text>
        <Muted style={s.tag}>Make bingo boards of the things your friends always say. Everyone sees every board but their own.</Muted>
      </View>
      <View style={{ gap: 12 }}>
        <SignInButtons />
        <Text style={s.terms}>
          By continuing you agree to the{' '}
          <Text style={s.link} onPress={() => Linking.openURL(`${API_URL}/terms`)}>terms</Text>
          : no hateful or hurtful lines.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', width: 276, gap: 8, justifyContent: 'center' },
  tile: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', padding: 6, ...shadow(t) },
  tileOn: { backgroundColor: t.accent, transform: [{ rotate: '-3deg' }] },
  tileFree: { backgroundColor: t.free, transform: [{ rotate: '2deg' }] },
  tileText: { textAlign: 'center', fontWeight: '700', fontSize: 13, color: t.ink },
  tileOnText: { color: t.accentInk },
  tileFreeText: { color: t.freeInk },
  title: { fontSize: 44, fontWeight: '900', color: t.ink, marginTop: 12, letterSpacing: -1 },
  tag: { textAlign: 'center', fontSize: 17, maxWidth: 320 },
  terms: { textAlign: 'center', fontSize: 13, color: t.muted },
  link: { color: t.strong, fontWeight: '700', textDecorationLine: 'underline' },
}));
