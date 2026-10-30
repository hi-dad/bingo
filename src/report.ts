import { Alert } from 'react-native';

// Ask before reporting a line. Reporting hides it for everyone right away.
export function confirmReport(text: string, report: () => Promise<unknown>) {
  Alert.alert(
    'Report this line?',
    `“${text}”\n\nIt’s hidden for everyone right away, counted as complete on the board, and sent to us to review. Use this for anything hurtful, not just unfunny.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => report().catch((err) => Alert.alert('Couldn’t report', (err as Error).message)) },
    ],
  );
}
