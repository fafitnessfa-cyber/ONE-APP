import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import type { FilterTag } from '../lib/exercises/types';

interface FilterChipsProps {
  tags: FilterTag[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FilterChips({ tags, selectedId, onSelect }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {tags.map((tag) => {
        const active = tag.id === selectedId;
        return (
          <TouchableOpacity
            key={tag.id}
            onPress={() => onSelect(tag.id)}
            style={[styles.chip, active && styles.chipActive]}
            activeOpacity={0.7}
          >
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.label, active && styles.labelActive]}
            >
              {tag.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    height: 44,
    minWidth: 88,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 20,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.accent,
  },
});
