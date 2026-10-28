import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { playerIndex } from '@/players';
import type { Player } from '@shared/types';
import { Avatar } from '@/components/Avatar';
import { Button, Card, ErrorText, Label, Muted, useUi } from '@/components/ui';
import { makeStyles } from '@/theme';

// Who's in the game, and the ways to deal with someone: the owner can remove them for good;
// anyone can block them (which also takes you out of the game) or leave.
export default function Players() {
  const ui = useUi();
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, error, act } = useGame(id);
  if (!game) return <View style={[ui.screen, ui.content]}><ErrorText>{error}</ErrorText></View>;
  const index = playerIndex(game);

  const fail = (err: unknown) => Alert.alert('Didn’t work', (err as Error).message);

  function remove(p: Player) {
    Alert.alert(`Remove ${p.name}?`, `${p.name}’s board and the lines about them are deleted, and they can’t rejoin with the code.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(() => api.remove(game!.id, p.id)).catch(fail) },
    ]);
  }

  function block(p: Player) {
    Alert.alert(`Block ${p.name}?`, `You’ll leave “${game!.name}”, and neither of you can join a game the other is in. You can unblock in Settings.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => api.block(game!.id, p.id).then(() => router.dismissTo('/')).catch(fail) },
    ]);
  }

  function leave() {
    Alert.alert(`Leave “${game!.name}”?`, 'Your board and the lines about you are deleted. Lines you wrote stay, without your name.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => api.leave(game!.id).then(() => router.dismissTo('/')).catch(fail) },
    ]);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Label>{game.players.length} PLAYERS</Label>
      <Card>
        {game.players.map((p) => (
          <View key={p.id} style={s.row}>
            <Avatar name={p.name} index={index[p.id]} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{p.isMe ? 'You' : p.name}</Text>
              {p.isOwner ? <Muted style={{ fontSize: 13 }}>Made the game</Muted> : null}
            </View>
            {!p.isMe ? (
              <View style={s.actions}>
                {game.isOwner ? <Button kind="secondary" title="Remove" onPress={() => remove(p)} style={s.small} /> : null}
                <Button kind="danger" title="Block" onPress={() => block(p)} style={s.small} />
              </View>
            ) : null}
          </View>
        ))}
      </Card>
      <Muted>Something hurtful on a board? Press and hold the square (or tap ⚑ next to a line) to report it.</Muted>
      <Button kind="danger" title="Leave game" onPress={leave} />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  name: { fontSize: 16, fontWeight: '700', color: t.ink },
  actions: { flexDirection: 'row', gap: 6 },
  small: { minHeight: 40, paddingHorizontal: 12 },
}));
