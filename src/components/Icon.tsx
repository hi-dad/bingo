import Svg, { Circle, Path } from 'react-native-svg';

// Line icons drawn with react-native-svg (already in the app), so there's no icon font to
// load. Shapes follow the 24×24 outline style of the Lucide set.
export type IconName = 'settings' | 'pencil' | 'trash' | 'x';

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'settings' ? (
        <>
          <Path {...p} d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <Circle {...p} cx={12} cy={12} r={3} />
        </>
      ) : null}
      {name === 'pencil' ? (
        <>
          <Path {...p} d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
          <Path {...p} d="m15 5 4 4" />
        </>
      ) : null}
      {name === 'trash' ? (
        <>
          <Path {...p} d="M3 6h18" />
          <Path {...p} d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <Path {...p} d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <Path {...p} d="M10 11v6M14 11v6" />
        </>
      ) : null}
      {name === 'x' ? <Path {...p} d="M18 6 6 18M6 6l12 12" /> : null}
    </Svg>
  );
}
