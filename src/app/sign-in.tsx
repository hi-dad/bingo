import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SignInButtons } from '@/components/SignInButtons';
import { Muted, styles as ui } from '@/components/ui';
import { colors } from '@/theme';

const PREVIEW = ['“Literally”', 'Mentions the gym', '★', 'Late again', '“No because…”', 'Brings up the ex'];

export default function SignIn() {
  return (
    <SafeAreaView style={[ui.screen, styles.wrap]}>
      <View style={styles.hero}>
        <View style={styles.preview}>
          {PREVIEW.map((t, i) => (
            <View key={t} style={[styles.tile, i % 2 === 0 && styles.tileOn, t === '★' && styles.tileFree]}>
              <Text style={[styles.tileText, i % 2 === 0 && { color: colors.accentInk }]}>{t}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.title}>Bingo</Text>
        <Muted style={styles.tag}>
          Make bingo boards of the things your friends always say. Everyone sees every board but their own.
        </Muted>
      </View>
      <SignInButtons />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', width: 270, gap: 6, justifyContent: 'center' },
  tile: {
    width: 84, height: 84, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', padding: 6,
  },
  tileOn: { backgroundColor: colors.accent, borderColor: colors.accent, transform: [{ rotate: '-3deg' }] },
  tileFree: { backgroundColor: colors.gold, borderColor: colors.gold },
  tileText: { textAlign: 'center', fontWeight: '700', fontSize: 13, color: colors.ink },
  title: { fontSize: 44, fontWeight: '900', color: colors.ink, marginTop: 12 },
  tag: { textAlign: 'center', fontSize: 17, maxWidth: 320 },
});
