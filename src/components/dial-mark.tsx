import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/constants/theme';

/** The brand mark: cherry rotary dial, cream finger holes, heart center.
 *  'outline' is the site's ornament treatment (espresso stroke, no fill). */
export function DialMark({
  size = 96,
  variant = 'solid',
}: {
  size?: number;
  variant?: 'solid' | 'outline';
}) {
  if (variant === 'outline') {
    const stroke = colors.espresso;
    return (
      <Svg width={size} height={size} viewBox="0 0 240 240" opacity={0.35}>
        <Circle cx={120} cy={120} r={110} stroke={stroke} strokeWidth={4} fill="none" />
        <G stroke={stroke} strokeWidth={4} fill="none">
          <Circle cx={199.4} cy={144.3} r={16.5} />
          <Circle cx={196.1} cy={86.8} r={16.5} />
          <Circle cx={156.3} cy={45.3} r={16.5} />
          <Circle cx={98.9} cy={39.7} r={16.5} />
          <Circle cx={51.8} cy={72.7} r={16.5} />
          <Circle cx={37.4} cy={128.5} r={16.5} />
          <Circle cx={62.8} cy={180.1} r={16.5} />
          <Circle cx={115.7} cy={202.9} r={16.5} />
        </G>
        <Path
          stroke={stroke}
          strokeWidth={4}
          fill="none"
          d="M120 157c-15-12.5-38-28.6-38-47.2C82 96.3 92.6 86 105.6 86c5.7 0 11 2.2 14.4 6.1C123.4 88.2 128.7 86 134.4 86 147.4 86 158 96.3 158 109.8c0 18.6-23 34.7-38 47.2z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Circle cx={120} cy={120} r={112} fill={colors.cherry} />
      <G fill={colors.cream}>
        <Circle cx={199.4} cy={144.3} r={16.5} />
        <Circle cx={196.1} cy={86.8} r={16.5} />
        <Circle cx={156.3} cy={45.3} r={16.5} />
        <Circle cx={98.9} cy={39.7} r={16.5} />
        <Circle cx={51.8} cy={72.7} r={16.5} />
        <Circle cx={37.4} cy={128.5} r={16.5} />
        <Circle cx={62.8} cy={180.1} r={16.5} />
        <Circle cx={115.7} cy={202.9} r={16.5} />
      </G>
      <G transform="translate(171.6 193.7) rotate(55)">
        <Rect x={-17} y={-6.5} width={34} height={13} rx={6.5} fill={colors.cream} />
      </G>
      <Path
        fill={colors.cream}
        d="M120 157c-15-12.5-38-28.6-38-47.2C82 96.3 92.6 86 105.6 86c5.7 0 11 2.2 14.4 6.1C123.4 88.2 128.7 86 134.4 86 147.4 86 158 96.3 158 109.8c0 18.6-23 34.7-38 47.2z"
      />
    </Svg>
  );
}
