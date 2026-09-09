import React from 'react';
import {
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import type { ProfileUnitPreference } from '../../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../../theme';
import type { Exercise } from '../../lib/exercises/types';
import {
  getDistanceUnitLabel,
  getWeightUnitLabel,
} from '../../lib/workouts/calculations';
import type {
  WorkoutSession,
  WorkoutSetDraft,
  WorkoutSetDraftField,
} from '../../lib/workouts/types';
import { AppScreen } from '../AppScreen';

const STICKY_COMPLETE_BOTTOM = 124;

interface TutorialExercise {
  id: string;
  name: string;
}

interface ActiveWorkoutTrackerProps {
  expandedExerciseIds: Set<string>;
  exerciseCatalog: Record<string, Exercise>;
  failedSetIds: Set<string>;
  isCompletingWorkout: boolean;
  preferredUnits: ProfileUnitPreference | null | undefined;
  savingSetIds: Set<string>;
  session: WorkoutSession;
  setDrafts: Record<string, WorkoutSetDraft>;
  tutorialExercise: TutorialExercise | null;
  onAddSet: (sessionExerciseId: string) => void;
  onBackToSelection: () => void;
  onCloseTutorial: () => void;
  onCompleteWorkout: () => void;
  onFieldBlur: (setId: string) => void;
  onFieldChange: (
    setId: string,
    field: WorkoutSetDraftField,
    value: string,
  ) => void;
  onOpenTutorial: (exercise: TutorialExercise) => void;
  onRemoveSet: (sessionExerciseId: string) => void;
  onRetrySync: () => void;
  onToggleExerciseSets: (sessionExerciseId: string) => void;
  onToggleSetDone: (setId: string, isCompleted: boolean) => void;
}

interface SetColumn {
  key: WorkoutSetDraftField | 'bodyweight';
  keyboardType?: KeyboardTypeOptions;
  label: string;
  placeholder: string;
  value: string;
  editable: boolean;
}

function getTutorialHtml(exerciseName: string) {
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
}

function getSetColumns(
  trackingMetric: string,
  loadType: string,
  draft: WorkoutSetDraft,
  preferredUnits: ProfileUnitPreference | null | undefined,
): SetColumn[] {
  if (trackingMetric === 'duration') {
    return [
      {
        key: 'durationSeconds',
        label: 'SEC',
        placeholder: '0',
        value: draft.durationSeconds,
        keyboardType: 'number-pad',
        editable: true,
      },
    ];
  }

  if (trackingMetric === 'distance_duration') {
    return [
      {
        key: 'distanceMeters',
        label: getDistanceUnitLabel(preferredUnits),
        placeholder: '0',
        value: draft.distanceMeters,
        keyboardType: 'decimal-pad',
        editable: true,
      },
      {
        key: 'durationSeconds',
        label: 'SEC',
        placeholder: '0',
        value: draft.durationSeconds,
        keyboardType: 'number-pad',
        editable: true,
      },
    ];
  }

  if (loadType === 'bodyweight') {
    return [
      {
        key: 'reps',
        label: 'REPS',
        placeholder: '0',
        value: draft.reps,
        keyboardType: 'number-pad',
        editable: true,
      },
      {
        key: 'bodyweight',
        label: 'LOAD',
        placeholder: '',
        value: 'BW',
        editable: false,
      },
    ];
  }

  if (loadType === 'assisted') {
    return [
      {
        key: 'reps',
        label: 'REPS',
        placeholder: '0',
        value: draft.reps,
        keyboardType: 'number-pad',
        editable: true,
      },
      {
        key: 'assistanceWeight',
        label: 'AST',
        placeholder: '0',
        value: draft.assistanceWeight,
        keyboardType: 'decimal-pad',
        editable: true,
      },
    ];
  }

  if (trackingMetric === 'reps_only') {
    return [
      {
        key: 'reps',
        label: 'REPS',
        placeholder: '0',
        value: draft.reps,
        keyboardType: 'number-pad',
        editable: true,
      },
    ];
  }

  return [
    {
      key: 'reps',
      label: 'REPS',
      placeholder: '0',
      value: draft.reps,
      keyboardType: 'number-pad',
      editable: true,
    },
    {
      key: 'weight',
      label: getWeightUnitLabel(preferredUnits),
      placeholder: '0',
      value: draft.weight,
      keyboardType: 'decimal-pad',
      editable: true,
    },
  ];
}

export function ActiveWorkoutTracker({
  expandedExerciseIds,
  exerciseCatalog,
  failedSetIds,
  isCompletingWorkout,
  preferredUnits,
  savingSetIds,
  session,
  setDrafts,
  tutorialExercise,
  onAddSet,
  onBackToSelection,
  onCloseTutorial,
  onCompleteWorkout,
  onFieldBlur,
  onFieldChange,
  onOpenTutorial,
  onRemoveSet,
  onRetrySync,
  onToggleExerciseSets,
  onToggleSetDone,
}: ActiveWorkoutTrackerProps) {
  const totalSets = session.exercises.reduce(
    (total, exercise) => total + exercise.sets.length,
    0,
  );
  const completedSets = session.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.isCompleted).length,
    0,
  );
  const completionPercent =
    totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100);
  const hasSyncFailures = failedSetIds.size > 0;
  const isSyncing = savingSetIds.size > 0;

  if (tutorialExercise) {
    return (
      <AppScreen>
        <View style={styles.activeHeader}>
          <TouchableOpacity
            onPress={onCloseTutorial}
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
            domStorageEnabled
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={Platform.OS !== 'web'}
            originWhitelist={['*']}
            source={{ html: getTutorialHtml(tutorialExercise.name) }}
            style={styles.video}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.activeHeader}>
        <TouchableOpacity
          onPress={onBackToSelection}
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
            {session.nameSnapshot}
          </Text>
          <Text allowFontScaling={false} style={styles.activeSubtitle}>
            {session.exercises.length} Exercise
            {session.exercises.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {hasSyncFailures ? (
        <View style={styles.syncBanner}>
          <Text allowFontScaling={false} style={styles.syncBannerText}>
            Some workout changes still need to sync.
          </Text>
          <TouchableOpacity
            onPress={onRetrySync}
            style={styles.syncBannerButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Retry workout sync"
          >
            <Text allowFontScaling={false} style={styles.syncBannerButtonText}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isSyncing ? (
        <View style={styles.syncMetaWrap}>
          <Text allowFontScaling={false} style={styles.syncMetaText}>
            Saving workout changes...
          </Text>
        </View>
      ) : null}

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
          <View style={[styles.progressFill, { width: `${completionPercent}%` }]} />
        </View>

        <Text allowFontScaling={false} style={styles.progressMeta}>
          {completedSets} of {totalSets} sets done
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.activeList}
      >
        {session.exercises.map((sessionExercise) => {
          const exercise = exerciseCatalog[sessionExercise.exerciseId];
          const exerciseMeta =
            exercise?.muscles.length ? exercise.muscles.join(', ') : 'Exercise details';

          return (
            <View key={sessionExercise.id} style={styles.exerciseTracker}>
              <TouchableOpacity
                onPress={() => onToggleExerciseSets(sessionExercise.id)}
                style={styles.trackerHeader}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{
                  expanded: expandedExerciseIds.has(sessionExercise.id),
                }}
                accessibilityLabel={`Toggle sets for ${sessionExercise.exerciseNameSnapshot}`}
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
                    {sessionExercise.exerciseNameSnapshot}
                  </Text>
                  <Text allowFontScaling={false} style={styles.trackerMeta}>
                    {sessionExercise.sets.length} Set
                    {sessionExercise.sets.length === 1 ? '' : 's'} + {exerciseMeta}
                  </Text>
                </View>

                <Ionicons
                  name={
                    expandedExerciseIds.has(sessionExercise.id)
                      ? 'chevron-up'
                      : 'chevron-down'
                  }
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              <View style={styles.trackerActions}>
                <TouchableOpacity
                  onPress={() =>
                    onOpenTutorial({
                      id: sessionExercise.exerciseId,
                      name: sessionExercise.exerciseNameSnapshot,
                    })
                  }
                  style={styles.tutorialButton}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch tutorial for ${sessionExercise.exerciseNameSnapshot}`}
                >
                  <Ionicons name="play" size={17} color={colors.background} />
                  <Text allowFontScaling={false} style={styles.tutorialButtonText}>
                    Tutorial
                  </Text>
                </TouchableOpacity>
              </View>

              {expandedExerciseIds.has(sessionExercise.id) ? (
                <View style={styles.setDropdown}>
                  <View style={styles.setHeader}>
                    <View style={styles.setDoneColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        DONE
                      </Text>
                    </View>
                    <View style={styles.setNumberColumn}>
                      <Text allowFontScaling={false} style={styles.setHeaderText}>
                        SET
                      </Text>
                    </View>
                    {getSetColumns(
                      sessionExercise.trackingMetricSnapshot,
                      sessionExercise.loadTypeSnapshot,
                      setDrafts[sessionExercise.sets[0]?.id] ?? {
                        reps: '',
                        weight: '',
                        durationSeconds: '',
                        distanceMeters: '',
                        assistanceWeight: '',
                      },
                      preferredUnits,
                    ).map((column) => (
                      <View
                        key={column.key}
                        style={styles.dynamicValueColumn}
                      >
                        <Text allowFontScaling={false} style={styles.setHeaderText}>
                          {column.label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {sessionExercise.sets.map((set) => {
                    const draft = setDrafts[set.id] ?? {
                      reps: '',
                      weight: '',
                      durationSeconds: '',
                      distanceMeters: '',
                      assistanceWeight: '',
                    };
                    const columns = getSetColumns(
                      sessionExercise.trackingMetricSnapshot,
                      sessionExercise.loadTypeSnapshot,
                      draft,
                      preferredUnits,
                    );
                    const isSavingSet =
                      savingSetIds.has(set.id) || failedSetIds.has(set.id);

                    return (
                      <View
                        key={set.id}
                        style={[styles.setRow, isSavingSet && styles.setRowPending]}
                      >
                        <View style={styles.setDoneColumn}>
                          <TouchableOpacity
                            onPress={() => onToggleSetDone(set.id, !set.isCompleted)}
                            style={[
                              styles.checkboxButton,
                              set.isCompleted && styles.checkboxButtonActive,
                            ]}
                            activeOpacity={0.75}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: set.isCompleted }}
                            accessibilityLabel={`Mark set ${set.setNumber} of ${sessionExercise.exerciseNameSnapshot} as done`}
                          >
                            {set.isCompleted ? (
                              <Ionicons
                                name="checkmark"
                                size={18}
                                color={colors.background}
                              />
                            ) : null}
                          </TouchableOpacity>
                        </View>

                        <View style={styles.setNumberColumn}>
                          <View style={styles.setNumber}>
                            <Text
                              allowFontScaling={false}
                              style={styles.setNumberText}
                            >
                              {set.setNumber}
                            </Text>
                          </View>
                        </View>

                        {columns.map((column) => (
                          <View
                            key={column.key}
                            style={styles.dynamicValueColumn}
                          >
                            {column.editable ? (
                              <TextInput
                                allowFontScaling={false}
                                value={column.value}
                                onChangeText={(value) =>
                                  onFieldChange(
                                    set.id,
                                    column.key as WorkoutSetDraftField,
                                    value,
                                  )
                                }
                                onEndEditing={() => onFieldBlur(set.id)}
                                keyboardType={column.keyboardType}
                                placeholder={column.placeholder}
                                placeholderTextColor={colors.textMuted}
                                style={[
                                  styles.setInput,
                                  set.isCompleted && styles.setInputDone,
                                ]}
                                textAlign="center"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.readonlyValuePill,
                                  set.isCompleted && styles.setInputDone,
                                ]}
                              >
                                <Text
                                  allowFontScaling={false}
                                  style={styles.readonlyValueText}
                                >
                                  {column.value}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    );
                  })}

                  <View style={styles.setActions}>
                    <TouchableOpacity
                      onPress={() => onAddSet(sessionExercise.id)}
                      style={styles.addSetButton}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Add set to ${sessionExercise.exerciseNameSnapshot}`}
                    >
                      <View style={styles.addSetIcon}>
                        <Ionicons name="add" size={20} color={colors.textPrimary} />
                      </View>
                      <Text allowFontScaling={false} style={styles.addSetText}>
                        Add Set
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onRemoveSet(sessionExercise.id)}
                      style={[
                        styles.minusSetButton,
                        sessionExercise.sets.length === 1 &&
                          styles.minusSetButtonDisabled,
                      ]}
                      disabled={sessionExercise.sets.length === 1}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove set from ${sessionExercise.exerciseNameSnapshot}`}
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
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.stickyCompleteBar}>
        <TouchableOpacity
          style={[
            styles.finishButton,
            (completionPercent < 100 || isCompletingWorkout || hasSyncFailures) &&
              styles.finishButtonDisabled,
          ]}
          onPress={onCompleteWorkout}
          disabled={completionPercent < 100 || isCompletingWorkout || hasSyncFailures}
          activeOpacity={0.8}
        >
          <Text allowFontScaling={false} style={styles.finishButtonText}>
            {isCompletingWorkout ? 'SAVING WORKOUT...' : 'COMPLETE WORKOUT'}
          </Text>
        </TouchableOpacity>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  activeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
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
  addSetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addSetIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  addSetText: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  checkboxButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  checkboxButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dynamicValueColumn: {
    flex: 1,
    minWidth: 64,
  },
  exerciseTracker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  finishButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.xl,
  },
  finishButtonDisabled: {
    opacity: 0.4,
  },
  finishButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 28,
    letterSpacing: 0,
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
  minusSetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  minusSetButtonDisabled: {
    opacity: 0.35,
  },
  minusSetIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  minusSetText: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  progressCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressFill: {
    backgroundColor: colors.accent,
    height: '100%',
  },
  progressLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  progressMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  progressPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  progressTrack: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 12,
    overflow: 'hidden',
  },
  progressValue: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: 28,
    letterSpacing: 0,
  },
  readonlyValuePill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  readonlyValueText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 22,
  },
  setActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setDoneColumn: {
    width: 44,
  },
  setDropdown: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  setHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setHeaderText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 26,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  setInputDone: {
    opacity: 0.65,
  },
  setNumber: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  setNumberColumn: {
    width: 56,
  },
  setNumberText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 22,
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setRowPending: {
    opacity: 0.82,
  },
  stickyCompleteBar: {
    bottom: STICKY_COMPLETE_BOTTOM,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  syncBanner: {
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
  syncBannerButton: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  syncBannerButtonText: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  syncBannerText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  syncMetaText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
  syncMetaWrap: {
    paddingTop: spacing.xs,
  },
  trackerActions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  trackerCopy: {
    flex: 1,
  },
  trackerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  trackerIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  trackerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  trackerTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 30,
  },
  tutorialButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tutorialButtonText: {
    color: colors.background,
    fontSize: fontSize.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tutorialTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 34,
    letterSpacing: 0,
    lineHeight: 38,
  },
  activeList: {
    gap: spacing.md,
    paddingBottom: 220,
  },
  video: {
    flex: 1,
  },
  videoFrame: {
    backgroundColor: '#0D0D0D',
    borderRadius: radius.lg,
    flex: 1,
    overflow: 'hidden',
  },
});
