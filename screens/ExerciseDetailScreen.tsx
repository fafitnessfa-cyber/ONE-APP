import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import {
  getExerciseBySlug,
  getExerciseMetadataLabel,
} from '../lib/exercises/exercises';
import type { Exercise } from '../lib/exercises/types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

function getFriendlyExerciseError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unable to load this exercise right now.';
  }

  if (error.message.includes('EXPO_PUBLIC_SUPABASE_URL')) {
    return error.message;
  }

  if (error.message.toLowerCase().includes('fetch')) {
    return 'Unable to reach Supabase right now. Please try again.';
  }

  return error.message;
}

function DetailSection({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.pillRow}>
        {values.map((value) => (
          <View key={value} style={styles.pill}>
            <Text style={styles.pillText}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ExerciseDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [exercise, setExercise] = React.useState<Exercise | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const normalizedSlug = typeof slug === 'string' ? slug : '';

  const loadExercise = React.useCallback(async () => {
    if (!normalizedSlug) {
      setErrorMessage('Missing exercise slug.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextExercise = await getExerciseBySlug(normalizedSlug);

      if (!nextExercise) {
        setErrorMessage('This exercise could not be found.');
        setExercise(null);
        return;
      }

      setExercise(nextExercise);
    } catch (error) {
      setErrorMessage(getFriendlyExerciseError(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedSlug]);

  React.useEffect(() => {
    void loadExercise();
  }, [loadExercise]);

  if (isLoading) {
    return (
      <AppScreen>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Loading Exercise</Text>
          <Text style={styles.statusMessage}>
            Pulling exercise details from the Supabase library.
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (errorMessage || !exercise) {
    return (
      <AppScreen>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Exercise Unavailable</Text>
          <Text style={styles.statusMessage}>
            {errorMessage ?? 'This exercise could not be loaded.'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              void loadExercise();
            }}
            style={styles.retryButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Back to workout"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/workout' as Href)}
          style={styles.secondaryButton}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Back to exercise list"
        >
          <Text style={styles.secondaryButtonText}>Exercise List</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>EXERCISE DETAIL</Text>
          <Text style={styles.title}>{exercise.name.toUpperCase()}</Text>
          <Text style={styles.subtitle}>
            {exercise.type} + {exercise.muscles.join(', ')}
          </Text>
          {exercise.description ? (
            <Text style={styles.description}>{exercise.description}</Text>
          ) : null}
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Movement</Text>
            <Text style={styles.metaValue}>
              {getExerciseMetadataLabel(exercise.movementPattern)}
            </Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Difficulty</Text>
            <Text style={styles.metaValue}>
              {getExerciseMetadataLabel(exercise.difficulty)}
            </Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Laterality</Text>
            <Text style={styles.metaValue}>
              {getExerciseMetadataLabel(exercise.laterality)}
            </Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Tracking</Text>
            <Text style={styles.metaValue}>
              {getExerciseMetadataLabel(exercise.primaryTrackingMetric)}
            </Text>
          </View>
        </View>

        <DetailSection title="Primary Muscles" values={exercise.primaryMuscles} />
        <DetailSection
          title="Secondary Muscles"
          values={exercise.secondaryMuscles}
        />
        <DetailSection title="Equipment" values={exercise.equipment} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          <View style={styles.instructionsCard}>
            {exercise.instructions.map((instruction, index) => (
              <View key={`${exercise.id}-instruction-${index + 1}`} style={styles.instructionRow}>
                <View style={styles.instructionBadge}>
                  <Text style={styles.instructionBadgeText}>{index + 1}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '700',
    lineHeight: 22,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 22,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '800',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 30,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  instructionsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  instructionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  instructionBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  instructionBadgeText: {
    color: colors.background,
    fontWeight: '900',
  },
  instructionText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSize.body,
    lineHeight: 22,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 32,
    textAlign: 'center',
  },
  statusMessage: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    minWidth: 180,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 24,
  },
});
