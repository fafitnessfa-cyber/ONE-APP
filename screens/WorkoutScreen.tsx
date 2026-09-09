import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import type { ProfileUnitPreference } from '../types';
import { AppScreen } from '../components/AppScreen';
import { ExerciseCard } from '../components/ExerciseCard';
import { FilterChips } from '../components/FilterChips';
import { SearchBar } from '../components/SearchBar';
import { SelectionBar } from '../components/SelectionBar';
import { ActiveWorkoutTracker } from '../components/workout/ActiveWorkoutTracker';
import type { Exercise, ExerciseFilterTagId } from '../lib/exercises/types';
import {
  HOME_PUSH_WORKOUT_ID,
  WORKOUT_FILTERS,
  WORKOUT_FILTER_TAGS,
} from '../lib/exercises/constants';
import { searchExercises } from '../lib/exercises/exercises';
import { useAuthProfile } from '../lib/profile/context';
import {
  buildDefaultTargetsForMetric,
  convertDisplayDistanceToMeters,
  convertDisplayWeightToKilograms,
  formatDistanceInputFromMeters,
  formatWeightInputFromKilograms,
  normalizeDecimalInput,
  normalizeIntegerInput,
  parseDecimalInput,
  parseIntegerInput,
} from '../lib/workouts/calculations';
import { ensureStarterWorkoutPlanDay } from '../lib/workouts/plans';
import {
  addWorkoutSet,
  completeWorkoutSession,
  getActiveWorkoutSession,
  removeWorkoutSet,
  startWorkoutSession,
  updateWorkoutSet,
} from '../lib/workouts/sessions';
import { getFriendlyWorkoutError } from '../lib/workouts/shared';
import type {
  WorkoutSession,
  WorkoutSet,
  WorkoutSetDraft,
  WorkoutSetDraftField,
} from '../lib/workouts/types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const MINUTES_PER_EXERCISE = 10;
const SEARCH_RESULT_LIMIT = 120;
const SET_SAVE_DEBOUNCE_MS = 650;

interface TutorialExercise {
  id: string;
  name: string;
}

function buildEmptySetDraft(): WorkoutSetDraft {
  return {
    reps: '',
    weight: '',
    durationSeconds: '',
    distanceMeters: '',
    assistanceWeight: '',
  };
}

function createDraftFromSet(
  set: WorkoutSet,
  preferredUnits: ProfileUnitPreference | null | undefined,
): WorkoutSetDraft {
  return {
    reps: set.reps == null ? '' : String(set.reps),
    weight: formatWeightInputFromKilograms(set.weightKg, preferredUnits),
    durationSeconds:
      set.durationSeconds == null ? '' : String(set.durationSeconds),
    distanceMeters: formatDistanceInputFromMeters(
      set.distanceMeters,
      preferredUnits,
    ),
    assistanceWeight: formatWeightInputFromKilograms(
      set.assistanceWeightKg,
      preferredUnits,
    ),
  };
}

function findSessionExerciseById(
  session: WorkoutSession | null,
  sessionExerciseId: string,
) {
  return session?.exercises.find((exercise) => exercise.id === sessionExerciseId) ?? null;
}

function findSessionExerciseForSet(session: WorkoutSession | null, setId: string) {
  if (!session) {
    return null;
  }

  for (const exercise of session.exercises) {
    if (exercise.sets.some((set) => set.id === setId)) {
      return exercise;
    }
  }

  return null;
}

function replaceUpdatedSet(session: WorkoutSession, nextSet: WorkoutSet) {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === nextSet.workoutSessionExerciseId
        ? {
            ...exercise,
            sets: exercise.sets
              .map((set) => (set.id === nextSet.id ? nextSet : set))
              .sort((left, right) => left.setNumber - right.setNumber),
          }
        : exercise,
    ),
  };
}

export function WorkoutScreen() {
  const router = useRouter();
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const { profile } = useAuthProfile();
  const preferredUnits = profile?.preferredUnits ?? null;
  const startedPresetRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const searchRequestIdRef = useRef(0);
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const activeSessionRef = useRef<WorkoutSession | null>(null);
  const setDraftsRef = useRef<Record<string, WorkoutSetDraft>>({});
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeFilter, setActiveFilter] = useState<ExerciseFilterTagId>('all');
  const [visibleExercises, setVisibleExercises] = useState<Exercise[]>([]);
  const [exerciseCatalog, setExerciseCatalog] = useState<Record<string, Exercise>>(
    {},
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [setDrafts, setSetDrafts] = useState<Record<string, WorkoutSetDraft>>({});
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(
    new Set(),
  );
  const [tutorialExercise, setTutorialExercise] = useState<TutorialExercise | null>(
    null,
  );
  const [isSelectionPausedByActiveSession, setIsSelectionPausedByActiveSession] =
    useState(false);
  const [isLoadingExercises, setIsLoadingExercises] = useState(true);
  const [hasLoadedExercises, setHasLoadedExercises] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [isLoadingActiveSession, setIsLoadingActiveSession] = useState(true);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [isCompletingWorkout, setIsCompletingWorkout] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [sessionReloadToken, setSessionReloadToken] = useState(0);
  const [savingSetIds, setSavingSetIds] = useState<Set<string>>(new Set());
  const [failedSetIds, setFailedSetIds] = useState<Set<string>>(new Set());

  activeSessionRef.current = activeSession;
  setDraftsRef.current = setDrafts;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

    setExerciseCatalog((previousCatalog) => {
      const nextCatalog = { ...previousCatalog };
      exercises.forEach((exercise) => {
        nextCatalog[exercise.id] = exercise;
      });
      return nextCatalog;
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

          setLoadError(getFriendlyWorkoutError(error, 'Unable to load exercises right now.'));
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
    let isDisposed = false;

    setIsLoadingActiveSession(true);

    void (async () => {
      try {
        const session = await getActiveWorkoutSession();

        if (isDisposed) {
          return;
        }

        setActiveSession(session);
        setSessionError(null);
        setSelectedIds(
          new Set(session?.exercises.map((exercise) => exercise.exerciseId) ?? []),
        );
        if (session) {
          setExpandedExerciseIds(
            new Set(session.exercises.map((exercise) => exercise.id)),
          );
        } else {
          setExpandedExerciseIds(new Set());
          setIsSelectionPausedByActiveSession(false);
        }
      } catch (error) {
        if (!isDisposed) {
          setSessionError(getFriendlyWorkoutError(error));
        }
      } finally {
        if (!isDisposed) {
          setIsLoadingActiveSession(false);
        }
      }
    })();

    return () => {
      isDisposed = true;
    };
  }, [sessionReloadToken]);

  useEffect(() => {
    if (!activeSession) {
      setSetDrafts({});
      return;
    }

    setSetDrafts((currentDrafts) => {
      const nextDrafts: Record<string, WorkoutSetDraft> = {};

      activeSession.exercises.forEach((exercise) => {
        exercise.sets.forEach((set) => {
          nextDrafts[set.id] =
            currentDrafts[set.id] ??
            createDraftFromSet(set, preferredUnits);
        });
      });

      return nextDrafts;
    });

    const missingExerciseIds = activeSession.exercises
      .map((exercise) => exercise.exerciseId)
      .filter((exerciseId) => !exerciseCatalog[exerciseId]);

    if (missingExerciseIds.length === 0) {
      return;
    }

    void (async () => {
      const results = await Promise.all(
        missingExerciseIds.map((exerciseId) =>
          searchExercises({ exerciseId, limit: 1 }),
        ),
      );
      mergeExercisesIntoCatalog(results.flat());
    })().catch(() => {
      // Keep session rendering from snapshots even if metadata hydration fails.
    });
  }, [activeSession, exerciseCatalog, preferredUnits]);

  async function persistSetFromDraft(
    setId: string,
    overrideIsCompleted?: boolean,
  ) {
    const currentSession = activeSessionRef.current;
    const currentDrafts = setDraftsRef.current;
    const sessionExercise = findSessionExerciseForSet(currentSession, setId);
    const existingSet = sessionExercise?.sets.find((set) => set.id === setId);

    if (!currentSession || !sessionExercise || !existingSet) {
      return;
    }

    const draft = currentDrafts[setId] ?? buildEmptySetDraft();
    const nextWeight =
      sessionExercise.loadTypeSnapshot === 'bodyweight'
        ? null
        : convertDisplayWeightToKilograms(
            parseDecimalInput(draft.weight),
            preferredUnits,
          );
    const nextAssistance =
      sessionExercise.loadTypeSnapshot === 'assisted'
        ? convertDisplayWeightToKilograms(
            parseDecimalInput(draft.assistanceWeight),
            preferredUnits,
          )
        : null;
    const nextDistance =
      sessionExercise.trackingMetricSnapshot === 'distance_duration'
        ? convertDisplayDistanceToMeters(
            parseDecimalInput(draft.distanceMeters),
            preferredUnits,
          )
        : null;

    setSavingSetIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(setId);
      return nextIds;
    });
    setFailedSetIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(setId);
      return nextIds;
    });

    try {
      const updatedSet = await updateWorkoutSet({
        setId,
        reps:
          sessionExercise.trackingMetricSnapshot === 'duration' ||
          sessionExercise.trackingMetricSnapshot === 'distance_duration'
            ? null
            : parseIntegerInput(draft.reps),
        weightKg: nextWeight,
        durationSeconds:
          sessionExercise.trackingMetricSnapshot === 'duration' ||
          sessionExercise.trackingMetricSnapshot === 'distance_duration'
            ? parseIntegerInput(draft.durationSeconds)
            : null,
        distanceMeters: nextDistance,
        assistanceWeightKg: nextAssistance,
        isCompleted: overrideIsCompleted ?? existingSet.isCompleted,
      });

      setActiveSession((currentSessionState) =>
        currentSessionState
          ? replaceUpdatedSet(currentSessionState, updatedSet)
          : currentSessionState,
      );
      setSessionError(null);
    } catch (error) {
      setSessionError(getFriendlyWorkoutError(error));
      setFailedSetIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(setId);
        return nextIds;
      });
    } finally {
      setSavingSetIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(setId);
        return nextIds;
      });
    }
  }

  async function flushPendingSetSaves() {
    const pendingSetIds = Array.from(saveTimeoutsRef.current.keys());
    pendingSetIds.forEach((setId) => {
      const timeout = saveTimeoutsRef.current.get(setId);
      if (timeout) {
        clearTimeout(timeout);
      }
      saveTimeoutsRef.current.delete(setId);
    });

    await Promise.all(pendingSetIds.map((setId) => persistSetFromDraft(setId)));
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        void flushPendingSetSaves();
      }
    });

    return () => {
      subscription.remove();
      saveTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      saveTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (
      preset !== HOME_PUSH_WORKOUT_ID ||
      startedPresetRef.current === preset ||
      isLoadingActiveSession ||
      isStartingWorkout
    ) {
      return;
    }

    if (activeSession) {
      startedPresetRef.current = preset;
      setIsSelectionPausedByActiveSession(false);
      setSessionMessage('Resumed your active workout instead of starting a second one.');
      return;
    }

    setIsStartingWorkout(true);
    void (async () => {
      try {
        const starterDay = await ensureStarterWorkoutPlanDay();
        const { session, wasResumed } = await startWorkoutSession({
          workoutPlanDayId: starterDay.id,
        });

        if (!isMountedRef.current) {
          return;
        }

        startedPresetRef.current = preset;
        setActiveSession(session);
        setSelectedIds(
          new Set(session.exercises.map((exercise) => exercise.exerciseId)),
        );
        setExpandedExerciseIds(
          new Set(session.exercises.map((exercise) => exercise.id)),
        );
        setIsSelectionPausedByActiveSession(false);
        setSessionMessage(
          wasResumed
            ? 'Resumed your active workout instead of starting a second one.'
            : null,
        );
        setSessionError(null);
      } catch (error) {
        if (isMountedRef.current) {
          setSessionError(getFriendlyWorkoutError(error));
        }
      } finally {
        if (isMountedRef.current) {
          setIsStartingWorkout(false);
        }
      }
    })();
  }, [activeSession, isLoadingActiveSession, preset]);

  const scheduleSetSave = (setId: string) => {
    const existingTimeout = saveTimeoutsRef.current.get(setId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      saveTimeoutsRef.current.delete(setId);
      void persistSetFromDraft(setId);
    }, SET_SAVE_DEBOUNCE_MS);

    saveTimeoutsRef.current.set(setId, timeout);
  };

  const handleStart = async () => {
    if (selectedExercises.length === 0) {
      return;
    }

    setIsStartingWorkout(true);
    setSessionError(null);
    setSessionMessage(null);

    try {
      const { session, wasResumed } = await startWorkoutSession({
        sessionName: 'Custom Workout',
        exercises: selectedExercises.map((exercise, index) => {
          const defaults = buildDefaultTargetsForMetric(
            exercise.primaryTrackingMetric as Parameters<
              typeof buildDefaultTargetsForMetric
            >[0],
          );

          return {
            exerciseId: exercise.id,
            position: index + 1,
            ...defaults,
          };
        }),
      });

      setActiveSession(session);
      setSelectedIds(
        new Set(session.exercises.map((exercise) => exercise.exerciseId)),
      );
      setExpandedExerciseIds(
        new Set(session.exercises.map((exercise) => exercise.id)),
      );
      setIsSelectionPausedByActiveSession(false);
      setSessionMessage(
        wasResumed
          ? 'Resumed your active workout instead of starting a second one.'
          : null,
      );
    } catch (error) {
      setSessionError(getFriendlyWorkoutError(error));
    } finally {
      setIsStartingWorkout(false);
    }
  };

  const handleBackToSelection = () => {
    void flushPendingSetSaves();
    setTutorialExercise(null);
    setIsSelectionPausedByActiveSession(true);
    setSessionMessage('Workout still active. Resume anytime.');
  };

  const handleResumeActiveSession = () => {
    setIsSelectionPausedByActiveSession(false);
    setSessionMessage(null);
  };

  const handleFieldChange = (
    setId: string,
    field: WorkoutSetDraftField,
    value: string,
  ) => {
    const nextValue =
      field === 'reps' || field === 'durationSeconds'
        ? normalizeIntegerInput(value)
        : normalizeDecimalInput(value, field === 'distanceMeters' ? 5 : 4, 2);

    setSetDrafts((currentDrafts) => ({
      ...currentDrafts,
      [setId]: {
        ...(currentDrafts[setId] ?? buildEmptySetDraft()),
        [field]: nextValue,
      },
    }));
    scheduleSetSave(setId);
  };

  const handleFieldBlur = (setId: string) => {
    const timeout = saveTimeoutsRef.current.get(setId);
    if (timeout) {
      clearTimeout(timeout);
      saveTimeoutsRef.current.delete(setId);
    }
    void persistSetFromDraft(setId);
  };

  const handleToggleSetDone = (setId: string, isCompleted: boolean) => {
    const timeout = saveTimeoutsRef.current.get(setId);
    if (timeout) {
      clearTimeout(timeout);
      saveTimeoutsRef.current.delete(setId);
    }

    setActiveSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      return {
        ...currentSession,
        exercises: currentSession.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId
              ? {
                  ...set,
                  isCompleted,
                  completedAt: isCompleted ? new Date().toISOString() : null,
                }
              : set,
          ),
        })),
      };
    });

    void persistSetFromDraft(setId, isCompleted);
  };

  const handleToggleExerciseSets = (sessionExerciseId: string) => {
    setExpandedExerciseIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.has(sessionExerciseId)
        ? nextIds.delete(sessionExerciseId)
        : nextIds.add(sessionExerciseId);
      return nextIds;
    });
  };

  const handleAddSet = async (sessionExerciseId: string) => {
    const sessionExercise = findSessionExerciseById(activeSession, sessionExerciseId);
    const lastSet = sessionExercise?.sets[sessionExercise.sets.length - 1];
    if (!activeSession || !sessionExercise || !lastSet) {
      return;
    }

    const lastDraft = setDrafts[lastSet.id] ?? buildEmptySetDraft();

    try {
      const createdSet = await addWorkoutSet({
        workoutSessionId: activeSession.id,
        workoutSessionExerciseId: sessionExercise.id,
        exerciseId: sessionExercise.exerciseId,
        setNumber: lastSet.setNumber + 1,
        setType: lastSet.setType,
        weightKg: convertDisplayWeightToKilograms(
          parseDecimalInput(lastDraft.weight),
          preferredUnits,
        ),
        reps: parseIntegerInput(lastDraft.reps),
        durationSeconds: parseIntegerInput(lastDraft.durationSeconds),
        distanceMeters: convertDisplayDistanceToMeters(
          parseDecimalInput(lastDraft.distanceMeters),
          preferredUnits,
        ),
        assistanceWeightKg: convertDisplayWeightToKilograms(
          parseDecimalInput(lastDraft.assistanceWeight),
          preferredUnits,
        ),
        bodyweightKgSnapshot: lastSet.bodyweightKgSnapshot,
        plannedRepsMin: lastSet.plannedRepsMin,
        plannedRepsMax: lastSet.plannedRepsMax,
        plannedWeightKg: lastSet.plannedWeightKg,
        plannedDurationSeconds: lastSet.plannedDurationSeconds,
        plannedDistanceMeters: lastSet.plannedDistanceMeters,
      });

      setActiveSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              exercises: currentSession.exercises.map((exercise) =>
                exercise.id === sessionExercise.id
                  ? {
                      ...exercise,
                      sets: [...exercise.sets, createdSet].sort(
                        (left, right) => left.setNumber - right.setNumber,
                      ),
                    }
                  : exercise,
              ),
            }
          : currentSession,
      );
      setSetDrafts((currentDrafts) => ({
        ...currentDrafts,
        [createdSet.id]: createDraftFromSet(createdSet, preferredUnits),
      }));
      setSessionError(null);
    } catch (error) {
      setSessionError(getFriendlyWorkoutError(error));
    }
  };

  const handleRemoveSet = async (sessionExerciseId: string) => {
    const sessionExercise = findSessionExerciseById(activeSession, sessionExerciseId);
    const targetSet = sessionExercise?.sets[sessionExercise.sets.length - 1];
    if (!activeSession || !sessionExercise || !targetSet || sessionExercise.sets.length <= 1) {
      return;
    }

    const timeout = saveTimeoutsRef.current.get(targetSet.id);
    if (timeout) {
      clearTimeout(timeout);
      saveTimeoutsRef.current.delete(targetSet.id);
    }

    try {
      await removeWorkoutSet(targetSet.id);

      setActiveSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              exercises: currentSession.exercises.map((exercise) =>
                exercise.id === sessionExercise.id
                  ? {
                      ...exercise,
                      sets: exercise.sets.slice(0, -1),
                    }
                  : exercise,
              ),
            }
          : currentSession,
      );
      setSetDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[targetSet.id];
        return nextDrafts;
      });
      setFailedSetIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(targetSet.id);
        return nextIds;
      });
      setSessionError(null);
    } catch (error) {
      setSessionError(getFriendlyWorkoutError(error));
    }
  };

  const handleRetrySync = () => {
    void flushPendingSetSaves();
  };

  const handleCompleteWorkout = async () => {
    if (!activeSession) {
      return;
    }

    setIsCompletingWorkout(true);
    setSessionError(null);

    try {
      await flushPendingSetSaves();
      await completeWorkoutSession(activeSession.id);
      startedPresetRef.current = null;
      setActiveSession(null);
      setSetDrafts({});
      setSelectedIds(new Set());
      setExpandedExerciseIds(new Set());
      setTutorialExercise(null);
      setIsSelectionPausedByActiveSession(false);
      setSessionMessage('Workout saved to history.');
      router.replace('/workout' as Href);
    } catch (error) {
      setSessionError(getFriendlyWorkoutError(error));
    } finally {
      setIsCompletingWorkout(false);
    }
  };

  const handleOpenExercise = (exercise: Exercise) => {
    router.push(`/exercises/${exercise.slug}` as Href);
  };

  const renderItem = ({ item }: { item: Exercise }) => (
    <ExerciseCard
      exercise={item}
      selected={selectedIds.has(item.id)}
      onToggle={(id) => {
        setSelectedIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.has(id) ? nextIds.delete(id) : nextIds.add(id);
          return nextIds;
        });
      }}
      onOpenDetails={handleOpenExercise}
    />
  );

  const isActiveSessionVisible =
    activeSession != null && !isSelectionPausedByActiveSession;

  if (isLoadingActiveSession) {
    return (
      <AppScreen>
        <View style={styles.statusCard}>
          <Text allowFontScaling={false} style={styles.statusTitle}>
            Loading Workout
          </Text>
          <Text allowFontScaling={false} style={styles.statusMessage}>
            Restoring your workout session from Supabase.
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (isActiveSessionVisible && activeSession) {
    return (
      <ActiveWorkoutTracker
        expandedExerciseIds={expandedExerciseIds}
        exerciseCatalog={exerciseCatalog}
        failedSetIds={failedSetIds}
        isCompletingWorkout={isCompletingWorkout}
        preferredUnits={preferredUnits}
        savingSetIds={savingSetIds}
        session={activeSession}
        setDrafts={setDrafts}
        tutorialExercise={tutorialExercise}
        onAddSet={handleAddSet}
        onBackToSelection={handleBackToSelection}
        onCloseTutorial={() => setTutorialExercise(null)}
        onCompleteWorkout={() => {
          void handleCompleteWorkout();
        }}
        onFieldBlur={handleFieldBlur}
        onFieldChange={handleFieldChange}
        onOpenTutorial={setTutorialExercise}
        onRemoveSet={handleRemoveSet}
        onRetrySync={handleRetrySync}
        onToggleExerciseSets={handleToggleExerciseSets}
        onToggleSetDone={handleToggleSetDone}
      />
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
            onPress={() => setReloadToken((value) => value + 1)}
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

      {sessionError ? (
        <View style={styles.statusBanner}>
          <Text allowFontScaling={false} style={styles.statusBannerText}>
            {sessionError}
          </Text>
          <TouchableOpacity
            onPress={() => setSessionReloadToken((value) => value + 1)}
            style={styles.statusBannerButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Retry workout session load"
          >
            <Text allowFontScaling={false} style={styles.statusBannerButtonText}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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

      {activeSession ? (
        <View style={styles.statusBanner}>
          <Text allowFontScaling={false} style={styles.statusBannerText}>
            {sessionMessage ?? `${activeSession.nameSnapshot} is still active.`}
          </Text>
          <TouchableOpacity
            onPress={handleResumeActiveSession}
            style={styles.statusBannerButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Resume active workout"
          >
            <Text allowFontScaling={false} style={styles.statusBannerButtonText}>
              Resume
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isStartingWorkout ? (
        <View style={styles.sessionMetaWrap}>
          <Text allowFontScaling={false} style={styles.sessionMetaText}>
            Starting workout...
          </Text>
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

      {selectedIds.size > 0 ? (
        <View style={styles.floatingBar}>
          <SelectionBar
            count={selectedIds.size}
            estimatedMinutes={selectedIds.size * MINUTES_PER_EXERCISE}
            onStart={() => {
              void handleStart();
            }}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textSecondary,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  exerciseList: {
    flex: 1,
  },
  filterLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  floatingBar: {
    bottom: 140,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
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
  resultsArea: {
    flex: 1,
    marginHorizontal: -spacing.xs,
    position: 'relative',
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
  screenTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 32,
    letterSpacing: 0,
    lineHeight: 36,
    textAlign: 'center',
  },
  sessionMetaText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
  sessionMetaWrap: {
    paddingTop: spacing.xs,
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
  statusBannerText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 18,
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
  statusMessage: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  statusTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 36,
    textAlign: 'center',
  },
});
