import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Text,
  FlatList,
  Platform,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { colors, spacing, fontFamily, radius, fontSize } from '../theme';
import type {
  Exercise,
  ExerciseFilterTagId,
} from '../lib/exercises/types';

import { AppScreen } from '../components/AppScreen';
import { SearchBar } from '../components/SearchBar';
import { FilterChips } from '../components/FilterChips';
import { ExerciseCard } from '../components/ExerciseCard';
import { SelectionBar } from '../components/SelectionBar';
import {
  HOME_PUSH_EXERCISES,
  HOME_PUSH_WORKOUT_ID,
  WORKOUT_FILTERS,
  WORKOUT_FILTER_TAGS,
} from '../lib/exercises/constants';
import { getExerciseBySlug, searchExercises } from '../lib/exercises/exercises';

const MINUTES_PER_EXERCISE = 10;
const INITIAL_SET_COUNT = 1;
const STICKY_COMPLETE_BOTTOM = 124;
const SEARCH_RESULT_LIMIT = 120;

type SetField = 'reps' | 'weight';

interface WorkoutSet {
  id: string;
  reps: string;
  weight: string;
  done: boolean;
}

interface ActiveExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
}

const getTutorialHtml = (exerciseName: string) => {
  const query = encodeURIComponent(`${exerciseName} exercise tutorial proper form`);

  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          html, body {
            background: #0D0D0D;
            height: 100%;
            margin: 0;
            overflow: hidden;
          }
          iframe {
            border: 0;
            height: 100%;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <iframe
          src="https://www.youtube-nocookie.com/embed?listType=search&list=${query}"
          title="${exerciseName} tutorial"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </body>
    </html>
  `;
};

const createSets = (
  exerciseId: string,
  count: number,
  reps: string,
  weight = '',
): WorkoutSet[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${exerciseId}-set-${index + 1}`,
    reps,
    weight,
    done: false,
  }));

const createInitialSets = (exerciseId: string): WorkoutSet[] =>
  createSets(exerciseId, INITIAL_SET_COUNT, '12');

const normalizeSetValue = (value: string, field: SetField) => {
  if (field === 'reps') {
    return value.replace(/\D/g, '').slice(0, 3);
  }

  const numeric = value.replace(/[^0-9.]/g, '');
  const [whole = '', ...rest] = numeric.split('.');
  const decimal = rest.join('').slice(0, 1);

  return rest.length > 0 ? `${whole.slice(0, 3)}.${decimal}` : whole.slice(0, 3);
};

function getFriendlyExerciseError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unable to load exercises right now.';
  }

  if (
    error.message.includes('EXPO_PUBLIC_SUPABASE_URL') ||
    error.message.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  ) {
    return error.message;
  }

  if (error.message.toLowerCase().includes('fetch')) {
    return 'Unable to reach Supabase right now. Please try again.';
  }

  return error.message;
}

export function WorkoutScreen() {
  const router = useRouter();
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const startedPresetRef = useRef<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeFilter, setActiveFilter] = useState<ExerciseFilterTagId>('all');
  const [visibleExercises, setVisibleExercises] = useState<Exercise[]>([]);
  const [exerciseCatalog, setExerciseCatalog] = useState<Record<string, Exercise>>(
    {},
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeWorkout, setActiveWorkout] = useState<ActiveExercise[]>([]);
  const [activeWorkoutTitle, setActiveWorkoutTitle] = useState('Custom Workout');
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(
    new Set(),
  );
  const [tutorialExercise, setTutorialExercise] = useState<Exercise | null>(
    null,
  );
  const [isLoadingExercises, setIsLoadingExercises] = useState(true);
  const [hasLoadedExercises, setHasLoadedExercises] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const selectedExercises = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => exerciseCatalog[id])
        .filter((exercise): exercise is Exercise => Boolean(exercise)),
    [exerciseCatalog, selectedIds],
  );

  const mergeExercisesIntoCatalog = (exercises: Exercise[]) => {
    if (exercises.length === 0) {
      return;
    }

    setExerciseCatalog((prev) => {
      const next = { ...prev };
      exercises.forEach((exercise) => {
        next[exercise.id] = exercise;
      });
      return next;
    });
  };

  useEffect(() => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setIsLoadingExercises(true);

    const timer = setTimeout(() => {
      void searchExercises({
        query: deferredSearch,
        filters: WORKOUT_FILTERS[activeFilter],
        limit: SEARCH_RESULT_LIMIT,
      })
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          startTransition(() => {
            setVisibleExercises(results);
            mergeExercisesIntoCatalog(results);
            setLoadError(null);
            setHasLoadedExercises(true);
          });
        })
        .catch((error) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          setLoadError(getFriendlyExerciseError(error));
          setHasLoadedExercises(true);
          setVisibleExercises((current) => (current.length > 0 ? current : []));
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            setIsLoadingExercises(false);
          }
        });
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [activeFilter, deferredSearch, reloadToken]);

  useEffect(() => {
    if (preset !== HOME_PUSH_WORKOUT_ID || startedPresetRef.current === preset) {
      return;
    }

    let isCanceled = false;

    void (async () => {
      try {
        const guidedWorkout = (
          await Promise.all(
            HOME_PUSH_EXERCISES.map(async (presetExercise) => {
              const exercise = await getExerciseBySlug(presetExercise.slug);

              if (!exercise) {
                return null;
              }

              return {
                exercise,
                sets: createSets(
                  exercise.id,
                  presetExercise.setCount,
                  presetExercise.reps,
                  presetExercise.weight,
                ),
              };
            }),
          )
        ).filter((item): item is ActiveExercise => Boolean(item));

        if (isCanceled || guidedWorkout.length === 0) {
          return;
        }

        mergeExercisesIntoCatalog(guidedWorkout.map((item) => item.exercise));
        startedPresetRef.current = preset;
        setSelectedIds(new Set(guidedWorkout.map((item) => item.exercise.id)));
        startWorkout(guidedWorkout, 'Push Strength Day');
      } catch (error) {
        if (!isCanceled) {
          setLoadError(getFriendlyExerciseError(error));
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [preset]);

  const toggleExercise = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startWorkout = (workout: ActiveExercise[], title: string) => {
    setActiveWorkout(workout);
    setActiveWorkoutTitle(title);
    setExpandedExerciseIds(new Set(workout.map((item) => item.exercise.id)));
  };

  const handleStart = () => {
    const chosen = selectedExercises.map((exercise) => ({
      exercise,
      sets: createInitialSets(exercise.id),
    }));

    startWorkout(chosen, 'Custom Workout');
  };

  const clearActiveWorkout = () => {
    startedPresetRef.current = null;
    setActiveWorkout([]);
    setActiveWorkoutTitle('Custom Workout');
    setTutorialExercise(null);
    setExpandedExerciseIds(new Set());
    router.replace('/workout' as Href);
  };

  const handleBackToSelection = () => {
    clearActiveWorkout();
  };

  const handleCompleteWorkout = () => {
    clearActiveWorkout();
    setSelectedIds(new Set());
  };

  const handleToggleExerciseSets = (exerciseId: string) => {
    setExpandedExerciseIds((prev) => {
      const next = new Set(prev);
      next.has(exerciseId) ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
  };

  const handleAddSet = (exerciseId: string) => {
    setActiveWorkout((prev) =>
      prev.map((item) => {
        if (item.exercise.id !== exerciseId) {
          return item;
        }

        const lastSet = item.sets[item.sets.length - 1];

        return {
          ...item,
          sets: [
            ...item.sets,
            {
              id: `${exerciseId}-set-${Date.now()}`,
              reps: lastSet?.reps ?? '10',
              weight: lastSet?.weight ?? '',
              done: false,
            },
          ],
        };
      }),
    );
  };

  const handleRemoveSet = (exerciseId: string) => {
    setActiveWorkout((prev) =>
      prev.map((item) =>
        item.exercise.id === exerciseId && item.sets.length > 1
          ? {
              ...item,
              sets: item.sets.slice(0, -1),
            }
          : item,
      ),
    );
  };

  const handleSetValueChange = (
    exerciseId: string,
    setId: string,
    field: SetField,
    value: string,
  ) => {
    const nextValue = normalizeSetValue(value, field);

    setActiveWorkout((prev) =>
      prev.map((item) =>
        item.exercise.id === exerciseId
          ? {
              ...item,
              sets: item.sets.map((set) =>
                set.id === setId ? { ...set, [field]: nextValue } : set,
              ),
            }
          : item,
      ),
    );
  };

  const handleToggleSetDone = (exerciseId: string, setId: string) => {
    setActiveWorkout((prev) =>
      prev.map((item) =>
        item.exercise.id === exerciseId
          ? {
              ...item,
              sets: item.sets.map((set) =>
                set.id === setId ? { ...set, done: !set.done } : set,
              ),
            }
          : item,
      ),
    );
  };

  const handleOpenExercise = (exercise: Exercise) => {
    router.push(`/exercises/${exercise.slug}` as Href);
  };

  const renderItem = ({ item }: { item: Exercise }) => (
    <ExerciseCard
      exercise={item}
      selected={selectedIds.has(item.id)}
      onToggle={toggleExercise}
      onOpenDetails={handleOpenExercise}
    />
  );

  const totalSets = activeWorkout.reduce(
    (total, item) => total + item.sets.length,
    0,
  );
  const completedSets = activeWorkout.reduce(
    (total, item) => total + item.sets.filter((set) => set.done).length,
    0,
  );
  const completionPercent =
    totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100);

  if (tutorialExercise) {
    return (
      <AppScreen>
        <View style={styles.activeHeader}>
          <TouchableOpacity
            onPress={() => setTutorialExercise(null)}
            style={styles.iconButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to active workout"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.activeTitleBlock}>
            <Text allowFontScaling={false} style={styles.activeEyebrow}>
              VIDEO TUTORIAL
            </Text>
            <Text allowFontScaling={false} style={styles.tutorialTitle}>
              {tutorialExercise.name}
            </Text>
          </View>
        </View>

        <View style={styles.videoFrame}>
          <WebView
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={Platform.OS !== 'web'}
            originWhitelist={['*']}
            source={{ html: getTutorialHtml(tutorialExercise.name) }}
            style={styles.video}
          />
        </View>
      </AppScreen>
    );
  }

  if (activeWorkout.length > 0) {
    return (
      <AppScreen>
        <View style={styles.activeHeader}>
          <TouchableOpacity
            onPress={handleBackToSelection}
            style={styles.iconButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to exercise selection"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.activeTitleBlock}>
            <Text allowFontScaling={false} style={styles.activeEyebrow}>
              ACTIVE WORKOUT
            </Text>
            <Text allowFontScaling={false} style={styles.activeTitle}>
              {activeWorkoutTitle}
            </Text>
            <Text allowFontScaling={false} style={styles.activeSubtitle}>
              {activeWorkout.length} Exercise
              {activeWorkout.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <View style={styles.progressPanel}>
          <View style={styles.progressCopy}>
            <Text allowFontScaling={false} style={styles.progressLabel}>
              Overall Progress
            </Text>
            <Text allowFontScaling={false} style={styles.progressValue}>
              {completionPercent}%
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${completionPercent}%` }]}
            />
          </View>

          <Text allowFontScaling={false} style={styles.progressMeta}>
            {completedSets} of {totalSets} sets done
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.activeList}
        >
          {activeWorkout.map((item) => (
            <View key={item.exercise.id} style={styles.exerciseTracker}>
              <TouchableOpacity
                onPress={() => handleToggleExerciseSets(item.exercise.id)}
                style={styles.trackerHeader}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{
                  expanded: expandedExerciseIds.has(item.exercise.id),
                }}
                accessibilityLabel={`Toggle sets for ${item.exercise.name}`}
              >
                <View style={styles.trackerIcon}>
                  <Ionicons
                    name="barbell-outline"
                    size={22}
                    color={colors.accent}
                  />
                </View>

                <View style={styles.trackerCopy}>
                  <Text allowFontScaling={false} style={styles.trackerTitle}>
                    {item.exercise.name}
                  </Text>
                  <Text allowFontScaling={false} style={styles.trackerMeta}>
                    {item.sets.length} Set{item.sets.length === 1 ? '' : 's'} +{' '}
                    {item.exercise.muscles.join(', ')}
                  </Text>
                </View>

                <Ionicons
                  name={
                    expandedExerciseIds.has(item.exercise.id)
                      ? 'chevron-up'
                      : 'chevron-down'
                  }
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              <View style={styles.trackerActions}>
                <TouchableOpacity
                  onPress={() => setTutorialExercise(item.exercise)}
                  style={styles.tutorialButton}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch tutorial for ${item.exercise.name}`}
                >
                  <Ionicons name="play" size={17} color={colors.background} />
                  <Text allowFontScaling={false} style={styles.tutorialButtonText}>
                    Tutorial
                  </Text>
                </TouchableOpacity>
              </View>

              {expandedExerciseIds.has(item.exercise.id) && (
                <View style={styles.setDropdown}>
                  <View style={styles.setHeader}>
                    <View style={styles.setDoneColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        DONE
                      </Text>
                    </View>
                    <View style={styles.setValueColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        SET
                      </Text>
                    </View>
                    <View style={styles.setValueColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        REPS
                      </Text>
                    </View>
                    <View style={styles.setValueColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        KG
                      </Text>
                    </View>
                  </View>

                  {item.sets.map((set, index) => (
                    <View key={set.id} style={styles.setRow}>
                      <View style={styles.setDoneColumn}>
                        <TouchableOpacity
                          onPress={() =>
                            handleToggleSetDone(item.exercise.id, set.id)
                          }
                          style={[
                            styles.checkboxButton,
                            set.done && styles.checkboxButtonActive,
                          ]}
                          activeOpacity={0.75}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: set.done }}
                          accessibilityLabel={`Mark set ${index + 1} of ${item.exercise.name} as done`}
                        >
                          {set.done && (
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={colors.background}
                            />
                          )}
                        </TouchableOpacity>
                      </View>

                      <View style={styles.setValueColumn}>
                        <View style={styles.setNumber}>
                          <Text
                            allowFontScaling={false}
                            style={styles.setNumberText}
                          >
                            {index + 1}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.setValueColumn}>
                        <TextInput
                          allowFontScaling={false}
                          value={set.reps}
                          onChangeText={(value) =>
                            handleSetValueChange(
                              item.exercise.id,
                              set.id,
                              'reps',
                              value,
                            )
                          }
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.setInput, set.done && styles.setInputDone]}
                          textAlign="center"
                        />
                      </View>

                      <View style={styles.setValueColumn}>
                        <TextInput
                          allowFontScaling={false}
                          value={set.weight}
                          onChangeText={(value) =>
                            handleSetValueChange(
                              item.exercise.id,
                              set.id,
                              'weight',
                              value,
                            )
                          }
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.setInput, set.done && styles.setInputDone]}
                          textAlign="center"
                        />
                      </View>
                    </View>
                  ))}

                  <View style={styles.setActions}>
                    <TouchableOpacity
                      onPress={() => handleAddSet(item.exercise.id)}
                      style={styles.addSetButton}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Add set to ${item.exercise.name}`}
                    >
                      <View style={styles.addSetIcon}>
                        <Ionicons name="add" size={20} color={colors.textPrimary} />
                      </View>
                      <Text allowFontScaling={false} style={styles.addSetText}>
                        Add Set
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleRemoveSet(item.exercise.id)}
                      style={[
                        styles.minusSetButton,
                        item.sets.length === 1 && styles.minusSetButtonDisabled,
                      ]}
                      disabled={item.sets.length === 1}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove set from ${item.exercise.name}`}
                    >
                      <View style={styles.minusSetIcon}>
                        <Ionicons name="remove" size={20} color={colors.textPrimary} />
                      </View>
                      <Text allowFontScaling={false} style={styles.minusSetText}>
                        Minus Set
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <View style={styles.stickyCompleteBar}>
          <TouchableOpacity
            style={[
              styles.finishButton,
              completionPercent < 100 && styles.finishButtonDisabled,
            ]}
            onPress={handleCompleteWorkout}
            disabled={completionPercent < 100}
            activeOpacity={0.8}
          >
            <Text allowFontScaling={false} style={styles.finishButtonText}>
              COMPLETE WORKOUT
            </Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  if (!hasLoadedExercises && isLoadingExercises) {
    return (
      <AppScreen>
        <View style={styles.statusCard}>
          <Text allowFontScaling={false} style={styles.statusTitle}>
            Loading Workout Library
          </Text>
          <Text allowFontScaling={false} style={styles.statusMessage}>
            Pulling the exercise catalog from Supabase.
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (
    loadError &&
    visibleExercises.length === 0 &&
    Object.keys(exerciseCatalog).length === 0
  ) {
    return (
      <AppScreen>
        <View style={styles.statusCard}>
          <Text allowFontScaling={false} style={styles.statusTitle}>
            Workout Library Unavailable
          </Text>
          <Text allowFontScaling={false} style={styles.statusMessage}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setReloadToken((value) => value + 1);
            }}
            style={styles.retryButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text allowFontScaling={false} style={styles.retryButtonText}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Text allowFontScaling={false} style={styles.screenTitle}>
        BUILD YOUR WORKOUT
      </Text>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search 800+ exercises..."
      />

      {loadError ? (
        <View style={styles.statusBanner}>
          <Text allowFontScaling={false} style={styles.statusBannerText}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => setReloadToken((value) => value + 1)}
            style={styles.statusBannerButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Retry exercise search"
          >
            <Text allowFontScaling={false} style={styles.statusBannerButtonText}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.resultsArea}>
        <FlatList
          data={visibleExercises}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={styles.exerciseList}
          contentContainerStyle={[
            styles.list,
            selectedIds.size === 0 && styles.listWithoutSelection,
          ]}
          ListEmptyComponent={
            <Text allowFontScaling={false} style={styles.empty}>
              No exercises match your search.
            </Text>
          }
        />

        <View style={styles.filterLayer}>
          <FilterChips
            tags={WORKOUT_FILTER_TAGS}
            selectedId={activeFilter}
            onSelect={(id) => setActiveFilter(id as ExerciseFilterTagId)}
          />
        </View>
      </View>

      {selectedIds.size > 0 && (
        <View style={styles.floatingBar}>
          <SelectionBar
            count={selectedIds.size}
            estimatedMinutes={selectedIds.size * MINUTES_PER_EXERCISE}
            onStart={handleStart}
          />
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 32,
    letterSpacing: 0,
    lineHeight: 36,
    textAlign: 'center',
  },
  statusBanner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBannerText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  statusBannerButton: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBannerButtonText: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
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
    lineHeight: 36,
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
  resultsArea: {
    flex: 1,
    marginHorizontal: -spacing.xs,
    position: 'relative',
  },
  exerciseList: {
    flex: 1,
  },
  list: {
    gap: spacing.md,
    paddingBottom: 260,
    paddingHorizontal: spacing.xs,
    paddingTop: 68,
  },
  listWithoutSelection: {
    paddingBottom: 140,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  floatingBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 140,
  },
  filterLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  activeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
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
  activeTitleBlock: {
    flex: 1,
  },
  activeEyebrow: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  activeTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 34,
    letterSpacing: 0,
    lineHeight: 38,
  },
  activeSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
    lineHeight: 17,
  },
  progressPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  progressCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  progressValue: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: 28,
    letterSpacing: 0,
  },
  progressTrack: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 12,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  activeList: {
    gap: spacing.md,
    paddingBottom: 256,
  },
  exerciseTracker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  trackerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  trackerIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  trackerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  trackerTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 25,
    letterSpacing: 0,
    lineHeight: 28,
  },
  trackerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 17,
  },
  trackerActions: {
    alignItems: 'flex-start',
  },
  tutorialButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  tutorialButtonText: {
    color: colors.background,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  setDropdown: {
    gap: spacing.md,
  },
  setHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  setHeaderText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  setDoneColumn: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    width: 56,
  },
  setValueColumn: {
    flex: 1,
    minWidth: 0,
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkboxButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.textMuted,
    borderRadius: 6,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  checkboxButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  setNumber: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
    width: '100%',
  },
  setNumberText: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  setInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    height: 50,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  setInputDone: {
    borderColor: colors.accent,
    color: colors.accentLight,
  },
  setActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  addSetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addSetIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addSetText: {
    color: colors.accent,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  minusSetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  minusSetButtonDisabled: {
    opacity: 0.35,
  },
  minusSetIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  minusSetText: {
    color: colors.danger,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  stickyCompleteBar: {
    bottom: STICKY_COMPLETE_BOTTOM,
    elevation: 6,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  finishButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 56,
  },
  finishButtonDisabled: {
    backgroundColor: colors.accentDark,
  },
  finishButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 24,
    letterSpacing: 0,
  },
  tutorialTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 31,
  },
  videoFrame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  video: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
