import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { AppScreen } from '../components/AppScreen';
import { LogoMark, LogoWordmark } from '../components/BrandLogo';
import {
  barcodePreviewIds,
  createNutritionFoodItem,
  createNutritionDaysState,
  getCatalogItemById,
  nutritionCatalog,
} from '../data/nutrition';
import {
  NutritionCatalogItem,
  NutritionDay,
  NutritionDayId,
  NutritionFoodItem,
  NutritionLogSource,
  NutritionMacroKey,
  NutritionMeal,
  NutritionMealId,
} from '../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const DAY_TABS: { id: NutritionDayId; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
];

const BASE_MACRO_COLORS: Record<NutritionMacroKey, string> = {
  protein: colors.accent,
  carbs: colors.warning,
  fats: '#E5F20A',
};

const SOURCE_COPY: Record<
  NutritionCatalogItem['source'],
  { label: string; backgroundColor: string; textColor: string }
> = {
  usda: {
    label: 'USDA',
    backgroundColor: '#1D2817',
    textColor: colors.accentLight,
  },
  nutritionix: {
    label: 'Barcode',
    backgroundColor: '#2A1D14',
    textColor: '#FFC27C',
  },
  saved: {
    label: 'Saved',
    backgroundColor: '#17222C',
    textColor: '#8BD0FF',
  },
  recipe: {
    label: 'Recipe',
    backgroundColor: '#2B1C2D',
    textColor: '#F1AFFF',
  },
};

const hydrationAccent = '#0FA7FF';
const calorieTrack = '#768071';
const amberAccent = '#FFC247';

type LibraryMode = 'scanner' | 'smart';

interface LogDraft {
  item: NutritionCatalogItem;
  mealId: NutritionMealId;
  servings: number;
  loggedFrom: NutritionLogSource;
  note?: string;
}

interface FoodPickerEntry {
  item: NutritionCatalogItem;
  note?: string;
  loggedFrom?: NutritionLogSource;
}

function getFoodCalories(item: NutritionFoodItem) {
  return item.caloriesPerServing * item.servings;
}

function getMacroTotal(
  item: Pick<
    NutritionFoodItem,
    | 'proteinPerServing'
    | 'carbsPerServing'
    | 'fatsPerServing'
    | 'servings'
  >,
  macroKey: NutritionMacroKey,
) {
  if (macroKey === 'protein') {
    return item.proteinPerServing * item.servings;
  }

  if (macroKey === 'carbs') {
    return item.carbsPerServing * item.servings;
  }

  return item.fatsPerServing * item.servings;
}

function getMealCalories(meal: NutritionMeal) {
  return meal.items.reduce((total, item) => total + getFoodCalories(item), 0);
}

function getDayConsumedCalories(day: NutritionDay) {
  return day.meals.reduce((total, meal) => total + getMealCalories(meal), 0);
}

function getDayConsumedMacro(day: NutritionDay, macroKey: NutritionMacroKey) {
  return day.meals.reduce(
    (total, meal) =>
      total +
      meal.items.reduce(
        (mealTotal, item) => mealTotal + getMacroTotal(item, macroKey),
        0,
      ),
    0,
  );
}

function getRemainingCalories(day: NutritionDay) {
  return day.baseGoal - getDayConsumedCalories(day) + day.exerciseCalories;
}

function getMacroBarColor(
  macroKey: NutritionMacroKey,
  consumed: number,
  goal: number,
) {
  if (consumed > goal * 1.1) {
    return colors.danger;
  }

  if (consumed > goal) {
    return amberAccent;
  }

  return BASE_MACRO_COLORS[macroKey];
}

function getMacroMeta(consumed: number, goal: number) {
  const delta = goal - consumed;

  if (delta >= 0) {
    return `Left: ${delta}g`;
  }

  return `Over: ${Math.abs(delta)}g`;
}

function getMealLabel(mealId: NutritionMealId) {
  if (mealId === 'breakfast') {
    return 'breakfast';
  }

  if (mealId === 'lunch') {
    return 'lunch';
  }

  if (mealId === 'dinner') {
    return 'dinner';
  }

  return 'snacks';
}

function getLoggedFromLabel(loggedFrom: NutritionLogSource) {
  if (loggedFrom === 'barcode') {
    return 'Packaged Food';
  }

  if (loggedFrom === 'saved') {
    return 'Saved Meal';
  }

  if (loggedFrom === 'recipe') {
    return 'Recipe';
  }

  if (loggedFrom === 'suggested') {
    return 'Suggested Fit';
  }

  return 'Search Result';
}

function formatLiters(value: number) {
  return value.toFixed(1);
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(value, 1));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getSearchScore(item: NutritionCatalogItem, query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const searchableText = [
    item.name,
    item.brand ?? '',
    item.servingLabel,
    ...item.keywords,
  ]
    .join(' ')
    .toLowerCase();

  if (!searchableText.includes(normalizedQuery)) {
    return 0;
  }

  let score = 1;

  if (item.name.toLowerCase().startsWith(normalizedQuery)) {
    score += 4;
  } else if (item.name.toLowerCase().includes(normalizedQuery)) {
    score += 3;
  }

  if (item.brand?.toLowerCase().includes(normalizedQuery)) {
    score += 2;
  }

  if (item.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))) {
    score += 1;
  }

  if (item.source === 'saved') {
    score += 0.4;
  }

  if (item.source === 'recipe') {
    score += 0.2;
  }

  return score;
}

function searchCatalogItems(query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  return nutritionCatalog
    .map((item) => ({
      item,
      score: getSearchScore(item, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 6)
    .map((entry) => entry.item);
}

function buildSuggestionReason(
  item: NutritionCatalogItem,
  mealId: NutritionMealId,
  calorieBalance: number,
  remainingProtein: number,
  remainingCarbs: number,
) {
  const totalProtein = item.proteinPerServing * item.defaultServings;
  const totalCarbs = item.carbsPerServing * item.defaultServings;
  const totalCalories = item.caloriesPerServing * item.defaultServings;
  const overCalories = Math.abs(Math.min(calorieBalance, 0));

  if (calorieBalance < 0) {
    if (remainingProtein >= 20 && totalProtein >= 20 && totalCalories <= 260) {
      return `You are already ${overCalories} kcal over, so this keeps the add lighter while still giving ${totalProtein}g protein.`;
    }

    if (totalCalories <= 180) {
      return `You are already ${overCalories} kcal over, so this is one of the lighter ${getMealLabel(mealId)} options.`;
    }

    if (item.source === 'saved' || item.source === 'recipe') {
      return `You are already ${overCalories} kcal over, so save this for when you want a familiar meal more than the lightest option.`;
    }

    return `You are already ${overCalories} kcal over, so this works better as a small top-up than a heavier add.`;
  }

  if (remainingProtein >= 25 && totalProtein >= 20) {
    return `High-protein choice to help close your remaining ${remainingProtein}g protein target.`;
  }

  if (remainingCarbs >= 30 && totalCarbs >= 25) {
    return `Useful carb support for the ${remainingCarbs}g you still have left today.`;
  }

  if (item.suggestedMealIds?.includes(mealId)) {
    return `Common ${getMealLabel(mealId)} pick that fits this part of your day.`;
  }

  if (Math.abs(calorieBalance - totalCalories) <= 120) {
    return `Fits neatly into the ${calorieBalance} kcal you still have available today.`;
  }

  if (item.source === 'saved') {
    return 'Quick re-log option so you do not have to rebuild a frequent meal.';
  }

  return 'Balanced option that keeps your calories and macros moving in the right direction.';
}

function getSuggestedFoods(day: NutritionDay, mealId: NutritionMealId) {
  const calorieBalance = getRemainingCalories(day);
  const remainingProtein = Math.max(
    day.macroGoals.protein - getDayConsumedMacro(day, 'protein'),
    0,
  );
  const remainingCarbs = Math.max(
    day.macroGoals.carbs - getDayConsumedMacro(day, 'carbs'),
    0,
  );
  const remainingFats = Math.max(
    day.macroGoals.fats - getDayConsumedMacro(day, 'fats'),
    0,
  );

  return nutritionCatalog
    .filter((item) => item.source !== 'nutritionix')
    .map((item) => {
      const calories = item.caloriesPerServing * item.defaultServings;
      const protein = item.proteinPerServing * item.defaultServings;
      const carbs = item.carbsPerServing * item.defaultServings;
      const fats = item.fatsPerServing * item.defaultServings;
      const mealBonus = item.suggestedMealIds?.includes(mealId) ? 40 : 0;
      const convenienceBonus =
        item.source === 'saved' ? 12 : item.source === 'recipe' ? 8 : 4;
      const calorieFit =
        calorieBalance >= 0
          ? Math.max(0, 55 - Math.abs(calorieBalance - calories) * 0.12)
          : Math.max(0, 65 - calories * 0.18);
      const macroFit =
        Math.min(protein, remainingProtein) * 2.2 +
        Math.min(carbs, remainingCarbs) * 1.1 +
        Math.min(fats, remainingFats) * 0.8;
      const overTargetBonus =
        calorieBalance < 0 && protein >= 18 && calories <= 260 ? 14 : 0;
      const overTargetPenalty =
        calorieBalance < 0 ? Math.max(0, calories - 220) * 0.18 : 0;

      return {
        item,
        reason: buildSuggestionReason(
          item,
          mealId,
          calorieBalance,
          remainingProtein,
          remainingCarbs,
        ),
        score:
          mealBonus +
          convenienceBonus +
          calorieFit +
          macroFit +
          overTargetBonus -
          overTargetPenalty,
      };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);
}

function updateMeal(
  day: NutritionDay,
  mealId: NutritionMealId,
  updater: (meal: NutritionMeal) => NutritionMeal,
) {
  return {
    ...day,
    meals: day.meals.map((meal) => (meal.id === mealId ? updater(meal) : meal)),
  };
}

function isCatalogItem(
  item: NutritionCatalogItem | undefined,
): item is NutritionCatalogItem {
  return Boolean(item);
}

function NutritionHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.headerBrand}>
        <LogoMark height={30} width={28} />
        <LogoWordmark height={18} width={128} />
      </View>

      <View style={styles.headerActions}>
        <View style={styles.headerIcon}>
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.textSecondary}
          />
        </View>
        <View style={styles.avatar}>
          <Text allowFontScaling={false} style={styles.avatarText}>
            U
          </Text>
        </View>
      </View>
    </View>
  );
}

function CalorieRing({
  remaining,
  goal,
}: {
  remaining: number;
  goal: number;
}) {
  const size = 146;
  const strokeWidth = 8;
  const radiusValue = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const isOver = remaining < 0;
  const progress = clampProgress(isOver ? 1 : remaining / goal);
  const dashOffset = circumference * (1 - progress);
  const ringColor = isOver ? colors.danger : colors.accent;

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke={calorieTrack}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.7}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={styles.ringCenter}>
        <Text
          allowFontScaling={false}
          style={[styles.ringValue, { color: ringColor }]}
        >
          {Math.abs(remaining)}
        </Text>
        <Text allowFontScaling={false} style={styles.ringLabel}>
          {isOver ? 'OVER' : 'REMAINING'}
        </Text>
      </View>
    </View>
  );
}

function MacroRow({
  macroKey,
  label,
  consumed,
  goal,
}: {
  macroKey: NutritionMacroKey;
  label: string;
  consumed: number;
  goal: number;
}) {
  const progress = consumed / goal;
  const fillColor = getMacroBarColor(macroKey, consumed, goal);

  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <Text allowFontScaling={false} style={styles.macroLabel}>
          {label.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={styles.macroAmount}>
          {consumed}g / {goal}g
        </Text>
      </View>

      <View style={styles.macroTrackRow}>
        <View style={styles.macroTrack}>
          <View
            style={[
              styles.macroFill,
              {
                backgroundColor: fillColor,
                width: `${clampProgress(progress) * 100}%`,
              },
            ]}
          />
        </View>
        {progress > 1 ? (
          <View
            style={[styles.macroOverflowDot, { backgroundColor: fillColor }]}
          />
        ) : null}
      </View>

      <View style={styles.macroFooter}>
        <Text allowFontScaling={false} style={styles.macroMeta}>
          {getMacroMeta(consumed, goal)}
        </Text>
        <Text allowFontScaling={false} style={styles.macroMeta}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </View>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <View style={styles.statChipText}>
        <Text allowFontScaling={false} style={styles.statChipLabel}>
          {label}
        </Text>
        <Text allowFontScaling={false} style={styles.statChipValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function MealTargetChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.targetChip, isActive && styles.targetChipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={isActive ? { selected: true } : {}}
    >
      <Text
        allowFontScaling={false}
        style={[styles.targetChipText, isActive && styles.targetChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SourceBadge({ source }: { source: NutritionCatalogItem['source'] }) {
  const copy = SOURCE_COPY[source];

  return (
    <View
      style={[
        styles.sourceBadge,
        { backgroundColor: copy.backgroundColor },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.sourceBadgeText, { color: copy.textColor }]}
      >
        {copy.label}
      </Text>
    </View>
  );
}

function FoodPickerRow({
  item,
  note,
  onPress,
}: {
  item: NutritionCatalogItem;
  note?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.catalogRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Review ${item.name}`}
    >
      <View style={styles.catalogMeta}>
        <View style={styles.catalogTitleRow}>
          <Text allowFontScaling={false} style={styles.catalogTitle}>
            {item.name}
          </Text>
          <SourceBadge source={item.source} />
        </View>

        {item.brand ? (
          <Text allowFontScaling={false} style={styles.catalogBrand}>
            {item.brand}
          </Text>
        ) : null}

        {note ? (
          <Text allowFontScaling={false} style={styles.catalogNote}>
            {note}
          </Text>
        ) : null}

        <Text allowFontScaling={false} style={styles.catalogStats}>
          {item.defaultServings} x {item.servingLabel} •{' '}
          {item.caloriesPerServing * item.defaultServings} kcal • P
          {item.proteinPerServing * item.defaultServings}g • C
          {item.carbsPerServing * item.defaultServings}g • F
          {item.fatsPerServing * item.defaultServings}g
        </Text>
      </View>

      <View style={styles.catalogAction}>
        <Ionicons name="add" size={18} color={colors.accent} />
      </View>
    </Pressable>
  );
}

function MealCard({
  meal,
  isTargeted,
  onAddFood,
  onAddServing,
  onDecreaseServing,
  onDeleteFood,
}: {
  meal: NutritionMeal;
  isTargeted: boolean;
  onAddFood: () => void;
  onAddServing: (itemId: string) => void;
  onDecreaseServing: (itemId: string) => void;
  onDeleteFood: (item: NutritionFoodItem) => void;
}) {
  const mealCalories = getMealCalories(meal);

  return (
    <View style={[styles.mealCard, isTargeted && styles.mealCardActive]}>
      <View style={styles.mealHeader}>
        <Text allowFontScaling={false} style={styles.mealTitle}>
          {meal.label.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={styles.mealTarget}>
          {mealCalories > 0 ? `(${mealCalories} kcal)` : '(No Log)'}
        </Text>
      </View>

      <View style={styles.mealBody}>
        {meal.items.length === 0 ? (
          <Text allowFontScaling={false} style={styles.mealEmpty}>
            No food logged yet.
          </Text>
        ) : (
          meal.items.map((item) => (
            <View key={item.id} style={styles.foodRow}>
              <View style={styles.foodMeta}>
                <Text allowFontScaling={false} style={styles.foodName}>
                  {item.name}
                </Text>
                <Text allowFontScaling={false} style={styles.foodCalories}>
                  {item.servings} x {item.servingLabel} • {getFoodCalories(item)} kcal
                </Text>
              </View>

              <View style={styles.foodActions}>
                <Pressable
                  style={[
                    styles.foodAction,
                    item.servings === 1 && styles.foodActionDisabled,
                  ]}
                  onPress={() => onDecreaseServing(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease serving of ${item.name}`}
                  disabled={item.servings === 1}
                >
                  <Ionicons
                    name="remove"
                    size={16}
                    color={
                      item.servings === 1 ? colors.textMuted : colors.textSecondary
                    }
                  />
                </Pressable>

                <Pressable
                  style={styles.foodAction}
                  onPress={() => onAddServing(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add one serving of ${item.name}`}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                </Pressable>

                <Pressable
                  style={[styles.foodAction, styles.foodDeleteAction]}
                  onPress={() => onDeleteFood(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.name} row`}
                  accessibilityHint="Opens a confirmation before removing this food"
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable
          style={styles.addFoodButton}
          onPress={onAddFood}
          accessibilityRole="button"
          accessibilityLabel={`Open add food options for ${meal.label}`}
        >
          <Text allowFontScaling={false} style={styles.addFoodText}>
            Add Food
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function HydrationButton({
  icon,
  label,
  sublabel,
  onPress,
  filled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  filled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.hydrationButton, filled && styles.hydrationButtonFilled]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={16}
        color={filled ? colors.textPrimary : hydrationAccent}
      />
      <View>
        <Text
          allowFontScaling={false}
          style={[
            styles.hydrationButtonLabel,
            filled && styles.hydrationButtonLabelFilled,
          ]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text
            allowFontScaling={false}
            style={[
              styles.hydrationButtonSubLabel,
              filled && styles.hydrationButtonSubLabelFilled,
            ]}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function LibrarySection({
  title,
  entries,
  onPick,
}: {
  title: string;
  entries: FoodPickerEntry[];
  onPick: (entry: FoodPickerEntry) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.librarySection}>
      <Text allowFontScaling={false} style={styles.librarySectionTitle}>
        {title}
      </Text>
      <View style={styles.librarySectionBody}>
        {entries.map((entry) => (
          <FoodPickerRow
            key={`${entry.item.id}-${entry.note ?? 'base'}`}
            item={entry.item}
            note={entry.note}
            onPress={() => onPick(entry)}
          />
        ))}
      </View>
    </View>
  );
}

function LibraryModal({
  visible,
  mode,
  mealLabel,
  selectedDay,
  activeMealId,
  onClose,
  onPick,
}: {
  visible: boolean;
  mode: LibraryMode | null;
  mealLabel: string;
  selectedDay: NutritionDay;
  activeMealId: NutritionMealId;
  onClose: () => void;
  onPick: (entry: FoodPickerEntry) => void;
}) {
  const scannerEntries = barcodePreviewIds
    .map((itemId) => getCatalogItemById(itemId))
    .filter(isCatalogItem);
  const savedEntries = nutritionCatalog
    .filter((item) => item.source === 'saved')
    .map((item) => ({
      item,
      note: 'Saved for faster re-logging.',
      loggedFrom: 'saved' as const,
    }));
  const recipeEntries = nutritionCatalog
    .filter((item) => item.source === 'recipe')
    .map((item) => ({
      item,
      note: 'Recipe-style entry with balanced macros.',
      loggedFrom: 'recipe' as const,
    }));
  const suggestedItems = getSuggestedFoods(selectedDay, activeMealId);

  const title =
    mode === 'scanner' ? 'Packaged Food Results' : 'Saved Meals & Suggestions';
  const subtitle =
    mode === 'scanner'
      ? 'Preview branded items the way a packaged-food lookup flow would feel before camera wiring is added.'
      : 'Quick picks below are organized around saved meals, recipes, and the calories and macros you still have left today.';

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                {title}
              </Text>
              <Text allowFontScaling={false} style={styles.sheetSubtitle}>
                {subtitle}
              </Text>
            </View>

            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close quick add sheet"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.sheetTarget}>
            <Text allowFontScaling={false} style={styles.sheetTargetText}>
              Logging to {mealLabel}
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {mode === 'scanner' ? (
              <LibrarySection
                title="Packaged Picks"
                entries={scannerEntries.map((item) => ({
                  item,
                  note: 'Branded sample for the packaged-food flow.',
                  loggedFrom: 'barcode' as const,
                }))}
                onPick={onPick}
              />
            ) : (
              <>
                <LibrarySection
                  title="Suggested for Today"
                  entries={suggestedItems.map((entry) => ({
                    item: entry.item,
                    note: entry.reason,
                    loggedFrom: 'suggested' as const,
                  }))}
                  onPick={onPick}
                />
                <LibrarySection
                  title="Saved Meals"
                  entries={savedEntries}
                  onPick={onPick}
                />
                <LibrarySection
                  title="Recipes"
                  entries={recipeEntries}
                  onPick={onPick}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DraftMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.draftMetricCard}>
      <Text allowFontScaling={false} style={styles.draftMetricLabel}>
        {label}
      </Text>
      <Text allowFontScaling={false} style={styles.draftMetricValue}>
        {value}
      </Text>
    </View>
  );
}

function FoodLogModal({
  draft,
  meals,
  onClose,
  onSelectMeal,
  onAdjustServings,
  onConfirm,
}: {
  draft: LogDraft | null;
  meals: NutritionMeal[];
  onClose: () => void;
  onSelectMeal: (mealId: NutritionMealId) => void;
  onAdjustServings: (delta: number) => void;
  onConfirm: () => void;
}) {
  if (!draft) {
    return null;
  }

  const totalCalories = draft.item.caloriesPerServing * draft.servings;
  const totalProtein = draft.item.proteinPerServing * draft.servings;
  const totalCarbs = draft.item.carbsPerServing * draft.servings;
  const totalFats = draft.item.fatsPerServing * draft.servings;
  const totalFiber = (draft.item.fiberPerServing ?? 0) * draft.servings;
  const totalSodium = (draft.item.sodiumMgPerServing ?? 0) * draft.servings;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={Boolean(draft)}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                Review Food Log
              </Text>
              <Text allowFontScaling={false} style={styles.sheetSubtitle}>
                Confirm the serving size and meal before saving.
              </Text>
            </View>

            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close food review"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.draftHero}>
            <View style={styles.draftHeroText}>
              <Text allowFontScaling={false} style={styles.draftFoodName}>
                {draft.item.name}
              </Text>
              {draft.item.brand ? (
                <Text allowFontScaling={false} style={styles.draftFoodBrand}>
                  {draft.item.brand}
                </Text>
              ) : null}
              <Text allowFontScaling={false} style={styles.draftFoodMeta}>
                {getLoggedFromLabel(draft.loggedFrom)} • Per serving:{' '}
                {draft.item.servingLabel}
              </Text>
            </View>
            <SourceBadge source={draft.item.source} />
          </View>

          <View style={styles.servingCard}>
            <Text allowFontScaling={false} style={styles.servingCardLabel}>
              Serving Size
            </Text>
            <View style={styles.servingControls}>
              <Pressable
                style={styles.stepperButton}
                onPress={() => onAdjustServings(-1)}
                accessibilityRole="button"
                accessibilityLabel="Decrease serving"
              >
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
              </Pressable>
              <View style={styles.servingValueWrap}>
                <Text allowFontScaling={false} style={styles.servingValue}>
                  {draft.servings}
                </Text>
                <Text allowFontScaling={false} style={styles.servingHint}>
                  x {draft.item.servingLabel}
                </Text>
              </View>
              <Pressable
                style={styles.stepperButton}
                onPress={() => onAdjustServings(1)}
                accessibilityRole="button"
                accessibilityLabel="Increase serving"
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <Text allowFontScaling={false} style={styles.draftSectionLabel}>
            Log to
          </Text>
          <View style={styles.targetChipRow}>
            {meals.map((meal) => (
              <MealTargetChip
                key={meal.id}
                label={meal.label}
                isActive={meal.id === draft.mealId}
                onPress={() => onSelectMeal(meal.id)}
              />
            ))}
          </View>

          <View style={styles.draftMetricsGrid}>
            <DraftMetric label="Calories" value={`${totalCalories}`} />
            <DraftMetric label="Protein" value={`${totalProtein}g`} />
            <DraftMetric label="Carbs" value={`${totalCarbs}g`} />
            <DraftMetric label="Fats" value={`${totalFats}g`} />
            <DraftMetric label="Fiber" value={`${totalFiber}g`} />
            <DraftMetric label="Sodium" value={`${totalSodium}mg`} />
          </View>

          {draft.note ? (
            <View style={styles.suggestionReasonCard}>
              <Text allowFontScaling={false} style={styles.suggestionReasonLabel}>
                Why this fits today
              </Text>
              <Text allowFontScaling={false} style={styles.suggestionReasonText}>
                {draft.note}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={styles.confirmButton}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel={`Log ${draft.item.name}`}
          >
            <Text allowFontScaling={false} style={styles.confirmButtonText}>
              Log to{' '}
              {meals.find((meal) => meal.id === draft.mealId)?.label ??
                draft.mealId}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function NutritionScreen() {
  const [selectedDayId, setSelectedDayId] = useState<NutritionDayId>('today');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState<NutritionDay[]>(() =>
    createNutritionDaysState(),
  );
  const [activeMealId, setActiveMealId] =
    useState<NutritionMealId>('breakfast');
  const [libraryMode, setLibraryMode] = useState<LibraryMode | null>(null);
  const [draft, setDraft] = useState<LogDraft | null>(null);

  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const consumedCalories = getDayConsumedCalories(selectedDay);
  const remainingCalories = getRemainingCalories(selectedDay);
  const searchResults = searchCatalogItems(search);
  const leftColumnMeals = selectedDay.meals.filter((_, index) => index % 2 === 0);
  const rightColumnMeals = selectedDay.meals.filter((_, index) => index % 2 === 1);
  const activeMeal =
    selectedDay.meals.find((meal) => meal.id === activeMealId) ??
    selectedDay.meals[0];
  const hydrationOverGoal = Math.max(
    selectedDay.hydrationLiters - selectedDay.hydrationGoalLiters,
    0,
  );

  const updateSelectedDay = (updater: (day: NutritionDay) => NutritionDay) => {
    setDays((previousDays) =>
      previousDays.map((day) =>
        day.id === selectedDayId ? updater(day) : day,
      ),
    );
  };

  const openDraft = (
    item: NutritionCatalogItem,
    loggedFrom: NutritionLogSource,
    note?: string,
  ) => {
    setDraft({
      item,
      mealId: activeMealId,
      servings: item.defaultServings,
      loggedFrom,
      note,
    });
    setLibraryMode(null);
  };

  const handleAddServing = (mealId: NutritionMealId, itemId: string) => {
    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId ? { ...item, servings: item.servings + 1 } : item,
        ),
      })),
    );
  };

  const handleDecreaseServing = (mealId: NutritionMealId, itemId: string) => {
    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId
            ? { ...item, servings: Math.max(1, item.servings - 1) }
            : item,
        ),
      })),
    );
  };

  const removeFood = (mealId: NutritionMealId, itemId: string) => {
    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.filter((item) => item.id !== itemId),
      })),
    );
  };

  const handleDeleteFood = (mealId: NutritionMealId, item: NutritionFoodItem) => {
    const mealLabel =
      selectedDay.meals.find((meal) => meal.id === mealId)?.label ?? 'this meal';

    Alert.alert(
      'Remove logged food?',
      `${item.name} will be removed from ${mealLabel}.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFood(mealId, item.id),
        },
      ],
    );
  };

  const handleStartMealLog = (mealId: NutritionMealId) => {
    setActiveMealId(mealId);
    setLibraryMode('smart');
  };

  const handleConfirmDraft = () => {
    if (!draft) {
      return;
    }

    updateSelectedDay((day) =>
      updateMeal(day, draft.mealId, (meal) => ({
        ...meal,
        // Keep duplicate logs as separate rows so each entry can be edited or deleted independently.
        items: [
          ...meal.items,
          createNutritionFoodItem(draft.item, {
            servings: draft.servings,
            loggedFrom: draft.loggedFrom,
          }),
        ],
      })),
    );

    setSearch('');
    setDraft(null);
  };

  const handleAdjustDraftServings = (delta: number) => {
    setDraft((previousDraft) =>
      previousDraft
        ? {
            ...previousDraft,
            servings: Math.max(1, previousDraft.servings + delta),
          }
        : previousDraft,
    );
  };

  const handleAddHydration = (amount: number) => {
    updateSelectedDay((day) => ({
      ...day,
      hydrationLiters: day.hydrationLiters + amount,
    }));
  };

  const handleReduceHydration = (amount: number) => {
    updateSelectedDay((day) => ({
      ...day,
      hydrationLiters: Math.max(0, day.hydrationLiters - amount),
    }));
  };

  const handleOpenBarcode = () => {
    setLibraryMode('scanner');
  };

  const handleOpenQuickLibrary = () => {
    setLibraryMode('smart');
  };

  const handleLibraryPick = ({ item, loggedFrom, note }: FoodPickerEntry) => {
    openDraft(
      item,
      loggedFrom ??
        (item.source === 'saved'
          ? 'saved'
          : item.source === 'recipe'
          ? 'recipe'
          : 'suggested'),
      note,
    );
  };

  return (
    <AppScreen showHeader={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <NutritionHeader />

        <View style={styles.dayTabs}>
          {DAY_TABS.map((tab) => {
            const isActive = tab.id === selectedDayId;
            return (
              <Pressable
                key={tab.id}
                style={styles.dayTab}
                onPress={() => setSelectedDayId(tab.id)}
                accessibilityRole="button"
                accessibilityState={isActive ? { selected: true } : {}}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.dayTabLabel, isActive && styles.dayTabLabelActive]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.dayTabUnderline,
                    isActive && styles.dayTabUnderlineActive,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryLeft}>
              <Text allowFontScaling={false} style={styles.cardSectionTitle}>
                CALORIES
              </Text>
              <CalorieRing
                remaining={remainingCalories}
                goal={selectedDay.baseGoal}
              />
            </View>

            <View style={styles.summaryRight}>
              <Text allowFontScaling={false} style={styles.cardSectionTitle}>
                MACROS
              </Text>

              <MacroRow
                macroKey="protein"
                label="Protein"
                consumed={getDayConsumedMacro(selectedDay, 'protein')}
                goal={selectedDay.macroGoals.protein}
              />
              <MacroRow
                macroKey="carbs"
                label="Carbs"
                consumed={getDayConsumedMacro(selectedDay, 'carbs')}
                goal={selectedDay.macroGoals.carbs}
              />
              <MacroRow
                macroKey="fats"
                label="Fats"
                consumed={getDayConsumedMacro(selectedDay, 'fats')}
                goal={selectedDay.macroGoals.fats}
              />
            </View>
          </View>

          <Text allowFontScaling={false} style={styles.summaryFormula}>
            Remaining = Goal - Food + Exercise
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatChip
            icon="flag"
            label="Base Goal"
            value={selectedDay.baseGoal}
          />
          <StatChip
            icon="restaurant"
            label="Food"
            value={consumedCalories}
          />
          <StatChip
            icon="barbell"
            label="Exercise"
            value={selectedDay.exerciseCalories}
          />
        </View>

        <View style={styles.foodLogCard}>
          <Text allowFontScaling={false} style={styles.sectionHeading}>
            FOOD LOG
          </Text>

          <View style={styles.searchRow}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                allowFontScaling={false}
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search for food, meals, recipes..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <Pressable
              style={styles.searchAction}
              onPress={handleOpenBarcode}
              accessibilityRole="button"
              accessibilityLabel="Open barcode results"
            >
              <Ionicons
                name="barcode-outline"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>

            <Pressable
              style={[styles.searchAction, styles.searchActionPrimary]}
              onPress={handleOpenQuickLibrary}
              accessibilityRole="button"
              accessibilityLabel="Open saved meals and suggestions"
            >
              <Ionicons name="flash" size={18} color={colors.background} />
            </Pressable>
          </View>

          <View style={styles.logTargetBlock}>
            <Text allowFontScaling={false} style={styles.logTargetLabel}>
              Logging to {activeMeal.label}
            </Text>
            <View style={styles.targetChipRow}>
              {selectedDay.meals.map((meal) => (
                <MealTargetChip
                  key={meal.id}
                  label={meal.label}
                  isActive={meal.id === activeMealId}
                  onPress={() => setActiveMealId(meal.id)}
                />
              ))}
            </View>
          </View>

          {search.trim() ? (
            <View style={styles.searchResultsCard}>
              <View style={styles.searchResultsHeader}>
                <Text allowFontScaling={false} style={styles.searchResultsTitle}>
                  SEARCH RESULTS
                </Text>
                <Text allowFontScaling={false} style={styles.searchResultsMeta}>
                  {searchResults.length} found
                </Text>
              </View>

              {searchResults.length === 0 ? (
                <Text allowFontScaling={false} style={styles.emptyStateText}>
                  No foods matched that search yet.
                </Text>
              ) : (
                searchResults.map((item) => (
                  <FoodPickerRow
                    key={item.id}
                    item={item}
                    onPress={() => openDraft(item, 'search')}
                  />
                ))
              )}
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.searchHint}>
              Search foods manually, use the barcode button for packaged items,
              or tap the green quick-add button for saved meals and goal-based
              suggestions.
            </Text>
          )}

          <View style={styles.mealColumns}>
            <View style={styles.mealColumn}>
              {leftColumnMeals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  isTargeted={meal.id === activeMealId}
                  onAddFood={() => handleStartMealLog(meal.id)}
                  onAddServing={(itemId) => handleAddServing(meal.id, itemId)}
                  onDecreaseServing={(itemId) =>
                    handleDecreaseServing(meal.id, itemId)
                  }
                  onDeleteFood={(item) => handleDeleteFood(meal.id, item)}
                />
              ))}
            </View>

            <View style={styles.mealColumn}>
              {rightColumnMeals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  isTargeted={meal.id === activeMealId}
                  onAddFood={() => handleStartMealLog(meal.id)}
                  onAddServing={(itemId) => handleAddServing(meal.id, itemId)}
                  onDecreaseServing={(itemId) =>
                    handleDecreaseServing(meal.id, itemId)
                  }
                  onDeleteFood={(item) => handleDeleteFood(meal.id, item)}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.hydrationCard}>
          <Text allowFontScaling={false} style={styles.sectionHeading}>
            HYDRATION TRACKER
          </Text>

          <View style={styles.hydrationBody}>
            <View style={styles.bottle}>
              <Ionicons name="water" size={30} color={hydrationAccent} />
            </View>

            <View style={styles.hydrationMain}>
              <Text allowFontScaling={false} style={styles.hydrationValue}>
                {formatLiters(selectedDay.hydrationLiters)} /{' '}
                {formatLiters(selectedDay.hydrationGoalLiters)} LITERS
              </Text>
              {hydrationOverGoal > 0 ? (
                <Text allowFontScaling={false} style={styles.hydrationOverGoal}>
                  {formatLiters(hydrationOverGoal)}L over goal
                </Text>
              ) : null}

              <View style={styles.hydrationTrack}>
                <View
                  style={[
                    styles.hydrationFill,
                    {
                      width: `${clampProgress(
                        selectedDay.hydrationLiters /
                          selectedDay.hydrationGoalLiters,
                      ) * 100}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.hydrationButtons}>
                <HydrationButton
                  icon="water-outline"
                  label="Glass"
                  sublabel="(250ml)"
                  onPress={() => handleAddHydration(0.25)}
                />
                <HydrationButton
                  icon="flask-outline"
                  label="Bottle"
                  sublabel="(700ml)"
                  onPress={() => handleAddHydration(0.7)}
                />
                <HydrationButton
                  icon="add"
                  label="Add"
                  onPress={() => handleAddHydration(0.1)}
                  filled
                />
                <HydrationButton
                  icon="remove"
                  label="Reduce"
                  sublabel="(-100ml)"
                  onPress={() => handleReduceHydration(0.1)}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <LibraryModal
        visible={libraryMode !== null}
        mode={libraryMode}
        mealLabel={activeMeal.label}
        selectedDay={selectedDay}
        activeMealId={activeMealId}
        onClose={() => setLibraryMode(null)}
        onPick={handleLibraryPick}
      />

      <FoodLogModal
        draft={draft}
        meals={selectedDay.meals}
        onClose={() => setDraft(null)}
        onSelectMeal={(mealId) => {
          setActiveMealId(mealId);
          setDraft((previousDraft) =>
            previousDraft ? { ...previousDraft, mealId } : previousDraft,
          );
        }}
        onAdjustServings={handleAdjustDraftServings}
        onConfirm={handleConfirmDraft}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 170,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerBrand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerIcon: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#7C6348',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  dayTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dayTab: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayTabLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
  },
  dayTabLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  dayTabUnderline: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: 3,
    width: 52,
  },
  dayTabUnderlineActive: {
    backgroundColor: colors.accent,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg + 2,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryTop: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  summaryLeft: {
    alignItems: 'flex-start',
    width: 132,
  },
  summaryRight: {
    flex: 1,
    gap: spacing.sm,
  },
  cardSectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginTop: spacing.sm,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  ringValue: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
  },
  ringLabel: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  macroRow: {
    gap: spacing.xs,
  },
  macroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroLabel: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
  },
  macroAmount: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  macroTrackRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  macroTrack: {
    backgroundColor: '#73796E',
    borderRadius: radius.pill,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  macroFill: {
    borderRadius: radius.pill,
    height: '100%',
  },
  macroOverflowDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  macroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroMeta: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  summaryFormula: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  statChipText: {
    flex: 1,
  },
  statChipLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  statChipValue: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  foodLogCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg + 2,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 31,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInputWrap: {
    alignItems: 'center',
    backgroundColor: '#1A2418',
    borderRadius: radius.md,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSize.body,
  },
  searchAction: {
    alignItems: 'center',
    backgroundColor: '#1A2418',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchActionPrimary: {
    backgroundColor: colors.accent,
  },
  logTargetBlock: {
    gap: spacing.sm,
  },
  logTargetLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  targetChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  targetChip: {
    backgroundColor: '#131B12',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  targetChipActive: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accent,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  targetChipTextActive: {
    color: colors.textPrimary,
  },
  searchResultsCard: {
    backgroundColor: '#10170F',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  searchResultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchResultsTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  searchResultsMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  searchHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  catalogRow: {
    alignItems: 'center',
    backgroundColor: '#0C120B',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  catalogMeta: {
    flex: 1,
    gap: 3,
  },
  catalogTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  catalogTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  catalogBrand: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  catalogNote: {
    color: colors.accentLight,
    fontSize: 11,
    lineHeight: 15,
  },
  catalogStats: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  catalogAction: {
    alignItems: 'center',
    backgroundColor: '#172117',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  sourceBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  mealColumns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mealColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  mealCard: {
    backgroundColor: '#0F150E',
    borderColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mealCardActive: {
    borderColor: colors.accent,
  },
  mealHeader: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mealTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 18,
  },
  mealTarget: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  mealBody: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  mealEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 36,
  },
  foodRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  foodMeta: {
    flex: 1,
    gap: 2,
  },
  foodActions: {
    flexDirection: 'row',
    gap: 6,
  },
  foodName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  foodCalories: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  foodAction: {
    alignItems: 'center',
    backgroundColor: '#182117',
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  foodActionDisabled: {
    backgroundColor: '#121813',
  },
  foodDeleteAction: {
    backgroundColor: '#231616',
    height: 28,
    width: 28,
  },
  addFoodButton: {
    alignItems: 'center',
    paddingTop: 2,
  },
  addFoodText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  hydrationCard: {
    backgroundColor: colors.surface,
    borderColor: hydrationAccent,
    borderRadius: radius.lg + 2,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  hydrationBody: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bottle: {
    alignItems: 'center',
    borderColor: hydrationAccent,
    borderRadius: radius.md,
    borderWidth: 2,
    height: 52,
    justifyContent: 'center',
    width: 38,
  },
  hydrationMain: {
    flex: 1,
    gap: spacing.sm,
  },
  hydrationValue: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  hydrationOverGoal: {
    color: hydrationAccent,
    fontSize: 11,
    fontWeight: '700',
  },
  hydrationTrack: {
    backgroundColor: '#A9AEA5',
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  hydrationFill: {
    backgroundColor: hydrationAccent,
    borderRadius: radius.pill,
    height: '100%',
  },
  hydrationButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hydrationButton: {
    alignItems: 'center',
    borderColor: hydrationAccent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hydrationButtonFilled: {
    backgroundColor: hydrationAccent,
  },
  hydrationButtonLabel: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  hydrationButtonLabelFilled: {
    color: colors.textPrimary,
  },
  hydrationButtonSubLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  hydrationButtonSubLabelFilled: {
    color: 'rgba(255,255,255,0.75)',
  },
  modalRoot: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#10170F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#4C564A',
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.md,
    width: 48,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sheetHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 29,
  },
  sheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#172117',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sheetTarget: {
    alignSelf: 'flex-start',
    backgroundColor: '#172117',
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sheetTargetText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '800',
  },
  sheetContent: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  librarySection: {
    gap: spacing.sm,
  },
  librarySectionTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  librarySectionBody: {
    gap: spacing.sm,
  },
  draftHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  draftHeroText: {
    flex: 1,
    gap: 2,
  },
  draftFoodName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  draftFoodBrand: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  draftFoodMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  servingCard: {
    backgroundColor: '#131B12',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  servingCardLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  servingControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#1E281D',
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  servingValueWrap: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  servingValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  servingHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  draftSectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  draftMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  draftMetricCard: {
    backgroundColor: '#131B12',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: '47%',
    padding: spacing.md,
  },
  draftMetricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  draftMetricValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  suggestionReasonCard: {
    backgroundColor: '#131B12',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  suggestionReasonLabel: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  suggestionReasonText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  confirmButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
