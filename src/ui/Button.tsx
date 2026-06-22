import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, font, radius, spacing } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const bg: Record<Variant, string> = {
  primary: colors.accent,
  secondary: colors.surfaceAlt,
  ghost: 'transparent',
  danger: 'rgba(239,68,68,0.15)',
};

const fg: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: colors.text,
  ghost: colors.textDim,
  danger: colors.danger,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg[variant], opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && styles.ghost,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={fg[variant]} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, { color: fg[variant] }]}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ghost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.body,
    fontWeight: '700',
  },
});
