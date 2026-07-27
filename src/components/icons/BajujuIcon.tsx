import React from 'react';
import { View } from 'react-native';

export type BajujuIconName =
  | 'arrow'
  | 'bell'
  | 'bolt'
  | 'calendar'
  | 'group'
  | 'home'
  | 'person'
  | 'pin'
  | 'plus'
  | 'search'
  | 'share';

type BajujuIconProps = {
  name: BajujuIconName;
  size?: number;
  color?: string;
};

const line = (color: string) => ({
  position: 'absolute' as const,
  height: 2.6,
  borderRadius: 2,
  backgroundColor: color,
});

export function BajujuIcon({
  name,
  size = 28,
  color = '#4B0C2D',
}: BajujuIconProps) {
  const scale = size / 32;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 32, height: 32, transform: [{ scale }] }}>
        {name === 'search' ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 4,
                top: 3,
                width: 19,
                height: 19,
                borderRadius: 10,
                borderWidth: 2.6,
                borderColor: color,
              }}
            />
            <View
              style={[
                line(color),
                {
                  left: 20,
                  top: 21,
                  width: 10,
                  transform: [{ rotate: '45deg' }],
                },
              ]}
            />
          </>
        ) : null}

        {name === 'plus' ? (
          <>
            <View style={[line(color), { left: 5, top: 15, width: 22 }]} />
            <View
              style={[
                line(color),
                {
                  left: 5,
                  top: 15,
                  width: 22,
                  transform: [{ rotate: '90deg' }],
                },
              ]}
            />
          </>
        ) : null}

        {name === 'arrow' ? (
          <>
            <View style={[line(color), { left: 4, top: 15, width: 24 }]} />
            <View
              style={[
                line(color),
                {
                  left: 19,
                  top: 11,
                  width: 10,
                  transform: [{ rotate: '45deg' }],
                },
              ]}
            />
            <View
              style={[
                line(color),
                {
                  left: 19,
                  top: 19,
                  width: 10,
                  transform: [{ rotate: '-45deg' }],
                },
              ]}
            />
          </>
        ) : null}

        {name === 'home' ? (
          <>
            <View
              style={[
                line(color),
                {
                  left: 4,
                  top: 10,
                  width: 18,
                  transform: [{ rotate: '-42deg' }],
                },
              ]}
            />
            <View
              style={[
                line(color),
                {
                  left: 14,
                  top: 10,
                  width: 18,
                  transform: [{ rotate: '42deg' }],
                },
              ]}
            />
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 14,
                width: 16,
                height: 14,
                borderWidth: 2.6,
                borderTopWidth: 0,
                borderColor: color,
                borderBottomLeftRadius: 3,
                borderBottomRightRadius: 3,
              }}
            />
          </>
        ) : null}

        {name === 'person' ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 11,
                top: 3,
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 2.4,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 6,
                top: 17,
                width: 20,
                height: 12,
                borderTopLeftRadius: 11,
                borderTopRightRadius: 11,
                borderWidth: 2.4,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
          </>
        ) : null}

        {name === 'bell' ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 7,
                top: 6,
                width: 18,
                height: 19,
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 6,
                borderWidth: 2.4,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 14,
                top: 2,
                width: 4,
                height: 5,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 13,
                top: 27,
                width: 6,
                height: 3,
                borderRadius: 3,
                backgroundColor: color,
              }}
            />
          </>
        ) : null}

        {name === 'calendar' ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 5,
                top: 6,
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2.4,
                borderColor: color,
              }}
            />
            <View style={[line(color), { left: 6, top: 12, width: 20 }]} />
            <View
              style={{
                position: 'absolute',
                left: 10,
                top: 3,
                width: 2.6,
                height: 7,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: 10,
                top: 3,
                width: 2.6,
                height: 7,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          </>
        ) : null}

        {name === 'bolt' ? (
          <>
            <View
              style={[
                line(color),
                {
                  left: 13,
                  top: 3,
                  width: 5,
                  height: 14,
                  transform: [{ rotate: '24deg' }],
                },
              ]}
            />
            <View
              style={[
                line(color),
                {
                  left: 9,
                  top: 14,
                  width: 14,
                  height: 5,
                  transform: [{ rotate: '-7deg' }],
                },
              ]}
            />
            <View
              style={[
                line(color),
                {
                  left: 14,
                  top: 17,
                  width: 5,
                  height: 13,
                  transform: [{ rotate: '24deg' }],
                },
              ]}
            />
          </>
        ) : null}

        {name === 'pin' ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 4,
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2.4,
                borderColor: color,
                backgroundColor: 'transparent',
                zIndex: 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 12,
                top: 14,
                width: 8,
                height: 8,
                borderRightWidth: 2.4,
                borderBottomWidth: 2.4,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 13,
                top: 9,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: color,
                zIndex: 3,
              }}
            />
          </>
        ) : null}

        {name === 'group' ? (
          <>
            {[4, 12, 20].map((left, index) => (
              <View
                key={`head-${left}`}
                style={{
                  position: 'absolute',
                  left,
                  top: index === 1 ? 3 : 7,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: color,
                }}
              />
            ))}
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 15,
                width: 16,
                height: 12,
                borderTopLeftRadius: 9,
                borderTopRightRadius: 9,
                borderWidth: 2.2,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 1,
                top: 18,
                width: 10,
                height: 9,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderWidth: 2,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: 1,
                top: 18,
                width: 10,
                height: 9,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderWidth: 2,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
          </>
        ) : null}

        {name === 'share' ? (
          <>
            <View
              style={[
                line(color),
                {
                  left: 8,
                  top: 11,
                  width: 17,
                  transform: [{ rotate: '-27deg' }],
                },
              ]}
            />
            <View
              style={[
                line(color),
                {
                  left: 8,
                  top: 21,
                  width: 17,
                  transform: [{ rotate: '27deg' }],
                },
              ]}
            />
            {[
              { left: 2, top: 13 },
              { left: 23, top: 3 },
              { left: 23, top: 23 },
            ].map((position) => (
              <View
                key={`${position.left}-${position.top}`}
                style={{
                  position: 'absolute',
                  ...position,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: color,
                }}
              />
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}
