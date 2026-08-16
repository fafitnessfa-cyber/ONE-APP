import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { BarcodeLookupModal } from '../components/nutrition/BarcodeLookupModal';
import { CustomFoodEditorModal } from '../components/nutrition/CustomFoodEditorModal';
import { RecipeEditorModal } from '../components/nutrition/RecipeEditorModal';
import {
  createNutritionFoodItem,
  createNutritionDaysState,
  nutritionCatalog as localNutritionCatalog,
} from '../data/nutrition';
import {
  applyServingSelection,
  createLoggedFoodStateItem,
  getCatalogFoodDetails,
  mergeLoggedFoodIntoCatalogItem,
  resolvePreferredServingSelection,
  searchCatalogFoods,
  withSingleServingOption,
} from '../lib/nutrition/catalog';
import {
  archiveCustomFoodDefinition,
  archiveRecipeDefinition,
  getRecipeDetails,
  getUserFoodDetails,
  loadRecipeDefinition,
  saveCustomFoodDefinition,
  saveRecipeDefinition,
  searchOwnedFoodsAndRecipes,
  type CustomFoodDraft,
  type RecipeDraft,
} from '../lib/nutrition/user-items';
import {
  addFoodFavorite,
  createFavoriteConfigKey,
  createRemoteFoodLog,
  deleteRemoteFoodLog,
  loadPersonalizedFoodSections,
  loadNutritionState,
  removeFoodFavorite,
  resolveShortcutForLogging,
  searchFoodHistory,
  type NutritionLoadResult,
  type NutritionPersonalizedSections,
  updateRemoteFoodLog,
  updateRemoteFoodLogServings,
  updateRemoteHydration,
} from '../lib/nutrition-data';
import {
  NutritionDay,
  NutritionDayId,
  NutritionCatalogStateItem,
  NutritionFoodItem,
  NutritionLogSource,
  NutritionMacroKey,
  NutritionMeal,
  NutritionMealId,
  NutritionServingOption,
  NutritionShortcutItem,
  NutritionShortcutKind,
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
  NutritionCatalogStateItem['source'],
  { label: string; backgroundColor: string; textColor: string }
> = {
  usda: {
    label: 'USDA',
    backgroundColor: '#1D2817',
    textColor: colors.accentLight,
  },
  branded: {
    label: 'Branded',
    backgroundColor: '#2A1D14',
    textColor: '#FFC27C',
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
  custom: {
    label: 'Custom',
    backgroundColor: '#16231A',
    textColor: '#89E7A3',
  },
};

const hydrationAccent = '#0FA7FF';
const calorieTrack = '#768071';
const amberAccent = '#FFC247';

type LibraryMode = 'create';
type LogDraftMode = 'create' | 'edit';

interface LogDraft {
  mode: LogDraftMode;
  logId?: string;
  favoriteId?: string;
  favoriteConfigKey?: string;
  item: NutritionCatalogStateItem;
  mealId: NutritionMealId;
  servings: number;
  loggedFrom: NutritionLogSource;
  note?: string;
}

interface FoodPickerEntry {
  item: NutritionCatalogStateItem;
  note?: string;
  loggedFrom?: NutritionLogSource;
  shortcut?: NutritionShortcutItem;
  shortcutKind?: NutritionShortcutKind;
}

const EMPTY_PERSONALIZED_SECTIONS: NutritionPersonalizedSections = {
  favorites: [],
  goTos: [],
  recents: [],
};

function getFoodCalories(item: NutritionFoodItem) {
  return item.caloriesPerServing * item.servings;
}

function isUuid(value: string | null | undefined) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function scaleLoggedFoodItem(item: NutritionFoodItem, servings: number): NutritionFoodItem {
  const effectiveGramsPerServing =
    item.effectiveGrams != null && item.servings > 0
      ? item.effectiveGrams / item.servings
      : null;

  return {
    ...item,
    servings,
    servingQuantity: servings,
    effectiveGrams:
      effectiveGramsPerServing == null
        ? null
        : Number((effectiveGramsPerServing * servings).toFixed(4)),
  };
}

function buildDraftLocalFoodItem(
  draft: LogDraft,
  existingId?: string,
): NutritionFoodItem {
  const selectedServing = draft.item.servingOptions?.find(
    (serving) => serving.id === draft.item.selectedServingId,
  );
  const baseItem = createNutritionFoodItem(draft.item, {
    servings: draft.servings,
    loggedFrom: draft.loggedFrom,
    entryType:
      draft.item.recipeId
        ? 'recipe'
        : draft.item.userFoodId
        ? 'user_food'
        : draft.item.catalogFoodId
        ? 'catalog'
        : draft.item.databaseId
        ? 'legacy'
        : 'legacy',
    catalogServingId:
      draft.item.catalogFoodId && isUuid(draft.item.selectedServingId)
        ? draft.item.selectedServingId
        : null,
  });
  const effectiveGramsPerServing =
    draft.item.effectiveGrams ?? selectedServing?.gramWeight ?? null;

  return {
    ...baseItem,
    id: existingId ?? baseItem.id,
    catalogServingId:
      draft.item.catalogFoodId && isUuid(draft.item.selectedServingId)
        ? draft.item.selectedServingId
        : null,
    userFoodServingId:
      draft.item.userFoodId && isUuid(draft.item.selectedServingId)
        ? draft.item.selectedServingId
        : baseItem.userFoodServingId,
    servings: draft.servings,
    servingQuantity: draft.servings,
    selectedServingId: draft.item.selectedServingId,
    effectiveGrams:
      effectiveGramsPerServing == null
        ? null
        : Number((effectiveGramsPerServing * draft.servings).toFixed(4)),
    nutrientValues: {
      ...(selectedServing?.nutrientValues ?? {}),
      energy_kcal: draft.item.caloriesPerServing,
      protein: draft.item.proteinPerServing,
      carbohydrate: draft.item.carbsPerServing,
      fat: draft.item.fatsPerServing,
      fiber: draft.item.fiberPerServing,
      sodium: draft.item.sodiumMgPerServing,
    },
  };
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

function formatCalories(value: number) {
  return `${Math.round(value)}`;
}

function formatMacro(value: number | undefined) {
  if (value == null) {
    return '0';
  }

  const roundedValue = Number(value.toFixed(1));
  return Number.isInteger(roundedValue) ? `${roundedValue}` : roundedValue.toFixed(1);
}

function formatQuantity(value: number) {
  const roundedValue = Number(value.toFixed(4));
  return `${roundedValue}`;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(value, 1));
}

function normalizeSearchQuery(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function isNearlyEqual(left: number | null | undefined, right: number | null | undefined) {
  if (left == null || right == null) {
    return false;
  }

  return Math.abs(left - right) < 0.0001;
}

function buildCustomFoodDraftFromItem(item: NutritionCatalogStateItem): CustomFoodDraft {
  const baseAmount = item.baseAmount ?? 100;
  const baseUnit = item.baseUnit === 'ml' ? 'ml' : 'g';
  const baseServingLabel = `${formatQuantity(baseAmount)} ${baseUnit}`;
  const matchedBaseServing = (item.servingOptions ?? []).find(
    (serving) =>
      normalizeComparableText(serving.label) ===
        normalizeComparableText(baseServingLabel) &&
      isNearlyEqual(serving.quantity, baseAmount) &&
      ((baseUnit === 'g' && isNearlyEqual(serving.gramWeight, baseAmount)) ||
        (baseUnit === 'ml' && isNearlyEqual(serving.milliliterVolume, baseAmount))),
  );
  const baseServing = {
    id: matchedBaseServing?.id,
    servingName: matchedBaseServing?.label ?? baseServingLabel,
    quantity: matchedBaseServing?.quantity ?? baseAmount,
    gramWeight:
      baseUnit === 'g'
        ? (matchedBaseServing?.gramWeight ?? baseAmount)
        : null,
    milliliterVolume:
      baseUnit === 'ml'
        ? (matchedBaseServing?.milliliterVolume ?? baseAmount)
        : null,
    householdUnit: matchedBaseServing?.householdUnit ?? baseUnit,
    isDefault:
      matchedBaseServing?.isDefault ??
      !(item.servingOptions ?? []).some((serving) => serving.isDefault),
    sortOrder: 0,
  };
  const extraServings = (item.servingOptions ?? [])
    .filter((serving) => serving.id !== matchedBaseServing?.id)
    .map((serving, index) => ({
      id: serving.id,
      servingName: serving.label,
      quantity: serving.quantity,
      gramWeight: serving.gramWeight ?? null,
      milliliterVolume: serving.milliliterVolume ?? null,
      householdUnit: serving.householdUnit ?? null,
      isDefault: serving.isDefault,
      sortOrder: index + 1,
    }));

  return {
    id: item.userFoodId ?? item.id,
    name: item.name,
    brandName: item.brand ?? '',
    description: item.description ?? '',
    baseAmount,
    baseUnit,
    nutrientValues:
      item.nutrientValues ?? {
        energy_kcal: item.caloriesPerServing,
        protein: item.proteinPerServing,
        carbohydrate: item.carbsPerServing,
        fat: item.fatsPerServing,
        fiber: item.fiberPerServing,
        sodium: item.sodiumMgPerServing,
      },
    servings: [baseServing, ...extraServings],
  };
}

function formatRelativeLogTime(value: string | undefined) {
  if (!value) {
    return 'recently';
  }

  const targetDate = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'recently';
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  }

  if (diffDays === 1) {
    return 'yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);

  if (diffWeeks < 5) {
    return `${diffWeeks}w ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return `${Math.max(diffMonths, 1)}mo ago`;
}

function formatShortcutNote(
  shortcut: NutritionShortcutItem,
  activeMealLabel: string,
) {
  if (shortcut.kind === 'favorite') {
    return 'Favorite shortcut for faster re-logging.';
  }

  if (shortcut.kind === 'go_to') {
    if (shortcut.mealMatchCount && shortcut.mealMatchCount > 1) {
      return `Repeated ${activeMealLabel.toLowerCase()} pick with ${shortcut.logCount ?? 0} recent logs.`;
    }

    return `Frequently logged around ${activeMealLabel.toLowerCase()}.`;
  }

  if (shortcut.kind === 'history') {
    return shortcut.logCount && shortcut.logCount > 1
      ? `${shortcut.logCount} matching logs • last ${formatRelativeLogTime(shortcut.lastLoggedAt)}`
      : `Matched your log history • last ${formatRelativeLogTime(shortcut.lastLoggedAt)}`;
  }

  return shortcut.logCount && shortcut.logCount > 1
    ? `${shortcut.logCount} total logs • last ${formatRelativeLogTime(shortcut.lastLoggedAt)}`
    : `Last logged ${formatRelativeLogTime(shortcut.lastLoggedAt)}`;
}

function createShortcutEntry(
  shortcut: NutritionShortcutItem,
  activeMealLabel: string,
  loggedFrom: NutritionLogSource,
): FoodPickerEntry {
  return {
    item: shortcut.item,
    note: formatShortcutNote(shortcut, activeMealLabel),
    loggedFrom,
    shortcut,
    shortcutKind: shortcut.kind,
  };
}

function getShortcutLoggedFrom(shortcutKind: NutritionShortcutKind): NutritionLogSource {
  return shortcutKind === 'go_to' ? 'suggested' : 'search';
}

function getShortcutSelectionId(shortcut: NutritionShortcutItem) {
  return `shortcut:${shortcut.kind}:${shortcut.id}`;
}

function getCatalogSelectionId(item: NutritionCatalogStateItem) {
  return `catalog:${item.catalogFoodId ?? item.id}`;
}

function buildSuggestionReason(
  item: NutritionCatalogStateItem,
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

function getSuggestedFoods(
  catalog: NutritionCatalogStateItem[],
  day: NutritionDay,
  mealId: NutritionMealId,
) {
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

  return catalog
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
  item: NutritionCatalogStateItem | undefined,
): item is NutritionCatalogStateItem {
  return Boolean(item);
}

function getNutritionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes('EXPO_PUBLIC_SUPABASE_URL') ||
      error.message.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    ) {
      return error.message;
    }

    if (error.message.includes('selected food could not be loaded')) {
      return 'The selected food could not be loaded right now.';
    }

    if (error.message.includes('not available in the Supabase catalog yet')) {
      return 'This food is not ready to log yet.';
    }

    if (error.message.includes('missing the nutrient data required for logging')) {
      return 'This food does not have enough nutrient data to be logged yet.';
    }
  }

  return 'Please try again in a moment.';
}

function showNutritionAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function showNutritionConfirm({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    const didConfirm = globalThis.confirm?.(`${title}\n\n${message}`) ?? false;

    if (didConfirm) {
      onConfirm();
    }

    return;
  }

  Alert.alert(title, message, [
    {
      text: 'Cancel',
      style: 'cancel',
    },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
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

function ServingOptionChip({
  serving,
  isActive,
  onPress,
}: {
  serving: NutritionServingOption;
  isActive: boolean;
  onPress: () => void;
}) {
  const isDisabled = serving.isSupported === false;

  return (
    <Pressable
      style={[
        styles.targetChip,
        isActive && styles.targetChipActive,
        isDisabled && styles.targetChipDisabled,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        ...(isActive ? { selected: true } : {}),
      }}
      accessibilityLabel={`Use serving size ${serving.label}`}
      disabled={isDisabled}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.targetChipText,
          isActive && styles.targetChipTextActive,
          isDisabled && styles.targetChipTextDisabled,
        ]}
      >
        {serving.label}
      </Text>
    </Pressable>
  );
}

function SourceBadge({ source }: { source: NutritionCatalogStateItem['source'] }) {
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
  item: NutritionCatalogStateItem;
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
          {formatMacro(item.defaultServings)} x {item.servingLabel} •{' '}
          {formatCalories(item.caloriesPerServing * item.defaultServings)} kcal • P
          {formatMacro(item.proteinPerServing * item.defaultServings)}g • C
          {formatMacro(item.carbsPerServing * item.defaultServings)}g • F
          {formatMacro(item.fatsPerServing * item.defaultServings)}g
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
  onEditFood,
  onDeleteFood,
}: {
  meal: NutritionMeal;
  isTargeted: boolean;
  onAddFood: () => void;
  onAddServing: (itemId: string) => void;
  onDecreaseServing: (itemId: string) => void;
  onEditFood: (item: NutritionFoodItem) => void;
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
              <Pressable
                style={styles.foodMeta}
                onPress={() => onEditFood(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
                accessibilityHint="Opens the saved serving and quantity editor"
              >
                <Text allowFontScaling={false} style={styles.foodName}>
                  {item.name}
                </Text>
                <Text allowFontScaling={false} style={styles.foodCalories}>
                  {item.servings} x {item.servingLabel} • {getFoodCalories(item)} kcal
                </Text>
              </Pressable>

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

function QuickActionCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickActionCard} onPress={onPress}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.quickActionText}>
        <Text allowFontScaling={false} style={styles.quickActionTitle}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={styles.quickActionDescription}>
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function LibraryModal({
  visible,
  mealLabel,
  onClose,
  onCreateCustomFood,
  onCreateRecipe,
}: {
  visible: boolean;
  mealLabel: string;
  onClose: () => void;
  onCreateCustomFood: () => void;
  onCreateRecipe: () => void;
}) {
  const title = 'Quick Actions';
  const subtitle =
    'Search stays the main logging flow. Use these shortcuts only when you want to create a private food or recipe.';

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
            <View style={styles.quickActionList}>
              <QuickActionCard
                icon="nutrition-outline"
                title="Create Custom Food"
                description="Add a private food with macros, optional micros, and extra servings."
                onPress={onCreateCustomFood}
              />
              <QuickActionCard
                icon="book-outline"
                title="Create Recipe"
                description="Build a private recipe from USDA foods and your custom foods, then log by grams or servings."
                onPress={onCreateRecipe}
              />
            </View>
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
  isFavorite,
  isFavoritePending,
  canEditDefinition,
  isDefinitionPending,
  onClose,
  onEditDefinition,
  onSelectMeal,
  onSelectServing,
  onAdjustServings,
  onSetServings,
  onToggleFavorite,
  onConfirm,
}: {
  draft: LogDraft | null;
  meals: NutritionMeal[];
  isFavorite: boolean;
  isFavoritePending: boolean;
  canEditDefinition: boolean;
  isDefinitionPending: boolean;
  onClose: () => void;
  onEditDefinition: () => void;
  onSelectMeal: (mealId: NutritionMealId) => void;
  onSelectServing: (servingId: string) => void;
  onAdjustServings: (delta: number) => void;
  onSetServings: (servings: number) => void;
  onToggleFavorite: () => void;
  onConfirm: (servingsOverride?: number) => void;
}) {
  const [quantityInput, setQuantityInput] = useState('');

  useEffect(() => {
    if (!draft) {
      return;
    }

    setQuantityInput(formatQuantity(draft.servings));
  }, [draft]);

  if (!draft) {
    return null;
  }

  const parsedQuantity = Number(quantityInput.trim());
  const hasInvalidQuantityInput =
    quantityInput.trim().length > 0 &&
    (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0);
  const previewServings =
    !hasInvalidQuantityInput && quantityInput.trim().length > 0
      ? parsedQuantity
      : draft.servings;
  const totalCalories = draft.item.caloriesPerServing * previewServings;
  const totalProtein = draft.item.proteinPerServing * previewServings;
  const totalCarbs = draft.item.carbsPerServing * previewServings;
  const totalFats = draft.item.fatsPerServing * previewServings;
  const totalFiber = (draft.item.fiberPerServing ?? 0) * previewServings;
  const totalSodium = (draft.item.sodiumMgPerServing ?? 0) * previewServings;
  const effectiveGrams =
    draft.item.effectiveGrams == null
      ? null
      : Number((draft.item.effectiveGrams * previewServings).toFixed(4));
  const servingOptions = draft.item.servingOptions ?? [];
  const confirmMealLabel =
    meals.find((meal) => meal.id === draft.mealId)?.label ?? draft.mealId;
  const syncServings = (servings: number) => {
    onSetServings(servings);
    setQuantityInput(formatQuantity(servings));
  };
  const handleConfirmPress = () => {
    if (hasInvalidQuantityInput) {
      return;
    }

    onConfirm(previewServings);
  };

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
                {draft.mode === 'edit' ? 'Edit Food Log' : 'Review Food Log'}
              </Text>
              <Text allowFontScaling={false} style={styles.sheetSubtitle}>
                {draft.mode === 'edit'
                  ? 'Update the serving, quantity, and meal before saving.'
                  : 'Confirm the serving, quantity, and meal before saving.'}
              </Text>
            </View>

            <View style={styles.sheetHeaderActions}>
              {canEditDefinition ? (
                <Pressable
                  style={styles.closeButton}
                  onPress={onEditDefinition}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${draft.item.name} definition`}
                  disabled={isDefinitionPending}
                >
                  {isDefinitionPending ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons
                      name="create-outline"
                      size={18}
                      color={colors.textSecondary}
                    />
                  )}
                </Pressable>
              ) : null}

              {draft.item.catalogFoodId ? (
                <Pressable
                  style={[
                    styles.closeButton,
                    isFavorite && styles.favoriteButtonActive,
                  ]}
                  onPress={onToggleFavorite}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isFavorite
                      ? `Remove ${draft.item.name} from favorites`
                      : `Add ${draft.item.name} to favorites`
                  }
                  disabled={isFavoritePending}
                >
                  {isFavoritePending ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons
                      name={isFavorite ? 'heart' : 'heart-outline'}
                      size={18}
                      color={isFavorite ? colors.accent : colors.textSecondary}
                    />
                  )}
                </Pressable>
              ) : null}

              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close food review"
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
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
            {servingOptions.length > 1 ? (
              <View style={styles.targetChipRow}>
                {servingOptions.map((serving) => (
                  <ServingOptionChip
                    key={serving.id}
                    serving={serving}
                    isActive={serving.id === draft.item.selectedServingId}
                    onPress={() => onSelectServing(serving.id)}
                  />
                ))}
              </View>
            ) : null}
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
                <TextInput
                  allowFontScaling={false}
                  style={styles.servingInput}
                  keyboardType="decimal-pad"
                  value={quantityInput}
                  onChangeText={setQuantityInput}
                  onBlur={() => {
                    if (hasInvalidQuantityInput || quantityInput.trim().length === 0) {
                      setQuantityInput(formatQuantity(draft.servings));
                      return;
                    }

                    syncServings(previewServings);
                  }}
                  onSubmitEditing={() => {
                    if (hasInvalidQuantityInput || quantityInput.trim().length === 0) {
                      setQuantityInput(formatQuantity(draft.servings));
                      return;
                    }

                    syncServings(previewServings);
                  }}
                />
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
            {effectiveGrams != null ? (
              <Text allowFontScaling={false} style={styles.servingInputMeta}>
                Effective grams: {formatQuantity(effectiveGrams)} g
              </Text>
            ) : null}
            {hasInvalidQuantityInput ? (
              <Text allowFontScaling={false} style={styles.inlineErrorText}>
                Enter a positive quantity to continue.
              </Text>
            ) : null}
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
            <DraftMetric label="Calories" value={formatCalories(totalCalories)} />
            <DraftMetric label="Protein" value={`${formatMacro(totalProtein)}g`} />
            <DraftMetric label="Carbs" value={`${formatMacro(totalCarbs)}g`} />
            <DraftMetric label="Fats" value={`${formatMacro(totalFats)}g`} />
            <DraftMetric label="Fiber" value={`${formatMacro(totalFiber)}g`} />
            <DraftMetric label="Sodium" value={`${formatMacro(totalSodium)}mg`} />
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
            onPress={handleConfirmPress}
            disabled={hasInvalidQuantityInput}
            accessibilityRole="button"
            accessibilityLabel={
              draft.mode === 'edit'
                ? `Save changes to ${draft.item.name}`
                : `Log ${draft.item.name}`
            }
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.confirmButtonText,
                hasInvalidQuantityInput && styles.confirmButtonTextDisabled,
              ]}
            >
              {draft.mode === 'edit' ? 'Save to ' : 'Log to '}
              {confirmMealLabel}
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
  const [catalog, setCatalog] =
    useState<NutritionCatalogStateItem[]>(() =>
      localNutritionCatalog.map((item) => withSingleServingOption(item)),
    );
  const [searchResults, setSearchResults] = useState<NutritionCatalogStateItem[]>([]);
  const [ownedSearchResults, setOwnedSearchResults] =
    useState<NutritionCatalogStateItem[]>([]);
  const [historyResults, setHistoryResults] = useState<NutritionShortcutItem[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isOwnedSearchLoading, setIsOwnedSearchLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isPersonalizationLoading, setIsPersonalizationLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ownedSearchError, setOwnedSearchError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [personalizationError, setPersonalizationError] = useState<string | null>(null);
  const [activeSearchSelectionId, setActiveSearchSelectionId] = useState<string | null>(null);
  const [days, setDays] = useState<NutritionDay[]>(() =>
    createNutritionDaysState(),
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [activeMealId, setActiveMealId] =
    useState<NutritionMealId>('breakfast');
  const [libraryMode, setLibraryMode] = useState<LibraryMode | null>(null);
  const [isBarcodeModalVisible, setIsBarcodeModalVisible] = useState(false);
  const [draft, setDraft] = useState<LogDraft | null>(null);
  const [customFoodEditorDraft, setCustomFoodEditorDraft] =
    useState<CustomFoodDraft | null>(null);
  const [recipeEditorDraft, setRecipeEditorDraft] = useState<RecipeDraft | null>(null);
  const [isCustomFoodEditorVisible, setIsCustomFoodEditorVisible] = useState(false);
  const [isRecipeEditorVisible, setIsRecipeEditorVisible] = useState(false);
  const [isDefinitionPending, setIsDefinitionPending] = useState(false);
  const [isFavoritePending, setIsFavoritePending] = useState(false);
  const [personalizedSections, setPersonalizedSections] =
    useState<NutritionPersonalizedSections>(EMPTY_PERSONALIZED_SECTIONS);
  const [personalizationRefreshToken, setPersonalizationRefreshToken] = useState(0);
  const searchRequestSequenceRef = useRef(0);
  const personalizationRequestSequenceRef = useRef(0);

  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const consumedCalories = getDayConsumedCalories(selectedDay);
  const remainingCalories = getRemainingCalories(selectedDay);
  const normalizedSearch = normalizeSearchQuery(search);
  const leftColumnMeals = selectedDay.meals.filter((_, index) => index % 2 === 0);
  const rightColumnMeals = selectedDay.meals.filter((_, index) => index % 2 === 1);
  const activeMeal =
    selectedDay.meals.find((meal) => meal.id === activeMealId) ??
    selectedDay.meals[0];
  const hydrationOverGoal = Math.max(
    selectedDay.hydrationLiters - selectedDay.hydrationGoalLiters,
    0,
  );
  const historyCatalogFoodIds = new Set(
    historyResults.flatMap((shortcut) =>
      shortcut.item.catalogFoodId ? [shortcut.item.catalogFoodId] : [],
    ),
  );
  const visibleCatalogResults = searchResults.filter(
    (item) =>
      !item.catalogFoodId || !historyCatalogFoodIds.has(item.catalogFoodId),
  );
  const ownedFoodEntries = ownedSearchResults.map((item) => ({
    item,
    loggedFrom: 'search' as const,
  }));
  const createShortcutEntries = (shortcuts: NutritionShortcutItem[]) =>
    shortcuts.map((shortcut) => {
      const entry = createShortcutEntry(
        shortcut,
        activeMeal.label,
        getShortcutLoggedFrom(shortcut.kind),
      );

      return activeSearchSelectionId === getShortcutSelectionId(shortcut)
        ? {
            ...entry,
            note: 'Loading food details...',
          }
        : entry;
    });
  const favoriteEntries = createShortcutEntries(personalizedSections.favorites);
  const historyEntries = createShortcutEntries(historyResults);
  const getFavoriteMatch = (
    item: NutritionCatalogStateItem,
    servings: number,
  ) => {
    if (!item.catalogFoodId) {
      return null;
    }

    const favoriteConfigKey = createFavoriteConfigKey(
      item.catalogFoodId,
      item.selectedServingId,
      servings,
    );

    return (
      personalizedSections.favorites.find(
        (shortcut) => shortcut.favoriteConfigKey === favoriteConfigKey,
      ) ?? null
    );
  };
  const activeDraftFavorite = draft ? getFavoriteMatch(draft.item, draft.servings) : null;
  const isDraftFavorite = activeDraftFavorite != null;

  const updateSelectedDay = (updater: (day: NutritionDay) => NutritionDay) => {
    setDays((previousDays) =>
      previousDays.map((day) =>
        day.id === selectedDayId ? updater(day) : day,
      ),
    );
  };

  const bumpPersonalizationRefresh = () => {
    setPersonalizationRefreshToken((previousValue) => previousValue + 1);
  };

  const applyNutritionState = (state: NutritionLoadResult) => {
    setCatalog(state.catalog);
    setDays(state.days);
    setUserId(state.userId);
  };

  const reloadNutritionState = async (showAlert = true) => {
    try {
      applyNutritionState(await loadNutritionState());
      return true;
    } catch (error) {
      if (showAlert) {
        showNutritionAlert('Nutrition sync issue', getNutritionErrorMessage(error));
      }

      return false;
    }
  };

  useEffect(() => {
    let isActive = true;

    const syncNutritionState = async () => {
      try {
        const state = await loadNutritionState();

        if (!isActive) {
          return;
        }

        applyNutritionState(state);
      } catch (error) {
        if (!isActive) {
          return;
        }

        showNutritionAlert('Nutrition sync issue', getNutritionErrorMessage(error));
      }
    };

    void syncNutritionState();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!userId || normalizedSearch.length >= 2) {
      setIsPersonalizationLoading(false);
      setPersonalizationError(null);
      return;
    }

    const nextRequestSequence = personalizationRequestSequenceRef.current + 1;
    personalizationRequestSequenceRef.current = nextRequestSequence;

    const timeoutId = setTimeout(() => {
      setIsPersonalizationLoading(true);
      setPersonalizationError(null);

      void loadPersonalizedFoodSections(activeMealId).then(
        (sections) => {
          if (personalizationRequestSequenceRef.current !== nextRequestSequence) {
            return;
          }

          setPersonalizedSections(sections);
          setIsPersonalizationLoading(false);
        },
        (error) => {
          console.error('Personalized nutrition sections failed', error);

          if (personalizationRequestSequenceRef.current !== nextRequestSequence) {
            return;
          }

          setPersonalizedSections(EMPTY_PERSONALIZED_SECTIONS);
          setPersonalizationError('Unable to load your shortcuts right now.');
          setIsPersonalizationLoading(false);
        },
      );
    }, 150);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeMealId, normalizedSearch, personalizationRefreshToken, userId]);

  useEffect(() => {
    const nextRequestSequence = searchRequestSequenceRef.current + 1;
    searchRequestSequenceRef.current = nextRequestSequence;

    if (!userId || normalizedSearch.length < 2) {
      setSearchResults([]);
      setOwnedSearchResults([]);
      setHistoryResults([]);
      setSearchError(null);
      setOwnedSearchError(null);
      setHistoryError(null);
      setIsSearchLoading(false);
      setIsOwnedSearchLoading(false);
      setIsHistoryLoading(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsSearchLoading(true);
      setIsOwnedSearchLoading(true);
      setIsHistoryLoading(true);
      setSearchError(null);
      setOwnedSearchError(null);
      setHistoryError(null);

      void Promise.allSettled([
        searchFoodHistory(normalizedSearch),
        searchOwnedFoodsAndRecipes(normalizedSearch),
        searchCatalogFoods(normalizedSearch),
      ]).then(([historyResult, ownedResult, catalogResult]) => {
        if (searchRequestSequenceRef.current !== nextRequestSequence) {
          return;
        }

        if (historyResult.status === 'fulfilled') {
          setHistoryResults(historyResult.value);
        } else {
          console.error('History food search failed', historyResult.reason);
          setHistoryResults([]);
          setHistoryError('History is unavailable right now.');
        }

        if (ownedResult.status === 'fulfilled') {
          setOwnedSearchResults(ownedResult.value);
        } else {
          console.error('Owned food search failed', ownedResult.reason);
          setOwnedSearchResults([]);
          setOwnedSearchError('Your private foods are unavailable right now.');
        }

        if (catalogResult.status === 'fulfilled') {
          setSearchResults(catalogResult.value);
        } else {
          console.error('Catalog food search failed', catalogResult.reason);
          setSearchResults([]);
          setSearchError('Unable to load foods right now.');
        }

        setIsHistoryLoading(false);
        setIsOwnedSearchLoading(false);
        setIsSearchLoading(false);
      });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [normalizedSearch, personalizationRefreshToken, userId]);

  const openDraft = ({
    item,
    loggedFrom,
    note,
    mealId = activeMealId,
    servings = item.defaultServings,
    mode = 'create',
    logId,
    favoriteId,
    favoriteConfigKey,
  }: {
    item: NutritionCatalogStateItem;
    loggedFrom: NutritionLogSource;
    note?: string;
    mealId?: NutritionMealId;
    servings?: number;
    mode?: LogDraftMode;
    logId?: string;
    favoriteId?: string;
    favoriteConfigKey?: string;
  }) => {
    setDraft({
      mode,
      logId,
      favoriteId,
      favoriteConfigKey,
      item,
      mealId,
      servings,
      loggedFrom,
      note,
    });
    setLibraryMode(null);
  };

  const handleStartCustomFoodCreate = () => {
    setLibraryMode(null);
    setCustomFoodEditorDraft(null);
    setIsCustomFoodEditorVisible(true);
  };

  const handleStartRecipeCreate = () => {
    setLibraryMode(null);
    setRecipeEditorDraft(null);
    setIsRecipeEditorVisible(true);
  };

  const handleSelectSearchResult = async (item: NutritionCatalogStateItem) => {
    const catalogFoodId = item.catalogFoodId ?? item.id;
    const selectionId = getCatalogSelectionId(item);
    setActiveSearchSelectionId(selectionId);

    try {
      openDraft({
        item: await getCatalogFoodDetails(catalogFoodId),
        loggedFrom: 'search',
      });
    } catch (error) {
      console.error('Catalog food detail load failed', error);
      showNutritionAlert('Unable to load food', getNutritionErrorMessage(error));
    } finally {
      setActiveSearchSelectionId((currentValue) =>
        currentValue === selectionId ? null : currentValue,
      );
    }
  };

  const handleSelectOwnedSearchResult = (item: NutritionCatalogStateItem) => {
    openDraft({
      item,
      loggedFrom: 'search',
    });
  };

  const handleSelectShortcut = async (
    shortcut: NutritionShortcutItem,
    note?: string,
  ) => {
    const selectionId = getShortcutSelectionId(shortcut);
    setActiveSearchSelectionId(selectionId);

    try {
      openDraft({
        item: await resolveShortcutForLogging(shortcut),
        loggedFrom: getShortcutLoggedFrom(shortcut.kind),
        note,
        favoriteId: shortcut.favoriteId,
        favoriteConfigKey: shortcut.favoriteConfigKey,
      });
    } catch (error) {
      console.error('Personalized shortcut resolution failed', error);
      showNutritionAlert('Unable to load food', getNutritionErrorMessage(error));
    } finally {
      setActiveSearchSelectionId((currentValue) =>
        currentValue === selectionId ? null : currentValue,
      );
    }
  };

  const handleEditDraftDefinition = async () => {
    if (!draft) {
      return;
    }

    try {
      setIsDefinitionPending(true);

      if (draft.item.userFoodId) {
        const detail = await getUserFoodDetails(draft.item.userFoodId);
        setCustomFoodEditorDraft(buildCustomFoodDraftFromItem(detail));
        setIsCustomFoodEditorVisible(true);
        return;
      }

      if (draft.item.recipeId) {
        setRecipeEditorDraft(await loadRecipeDefinition(draft.item.recipeId));
        setIsRecipeEditorVisible(true);
      }
    } catch (error) {
      showNutritionAlert('Unable to load editor', getNutritionErrorMessage(error));
    } finally {
      setIsDefinitionPending(false);
    }
  };

  const handleAddServing = (mealId: NutritionMealId, itemId: string) => {
    const item = selectedDay.meals
      .find((meal) => meal.id === mealId)
      ?.items.find((mealItem) => mealItem.id === itemId);

    if (!item) {
      return;
    }

    const nextServings = item.servings + 1;

    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId ? scaleLoggedFoodItem(item, nextServings) : item,
        ),
      })),
    );

    if (!userId) {
      return;
    }

    void (async () => {
      try {
        await updateRemoteFoodLogServings(item, nextServings);
        bumpPersonalizationRefresh();
      } catch (error) {
        showNutritionAlert('Unable to update servings', getNutritionErrorMessage(error));
        await reloadNutritionState(false);
      }
    })();
  };

  const handleDecreaseServing = (mealId: NutritionMealId, itemId: string) => {
    const item = selectedDay.meals
      .find((meal) => meal.id === mealId)
      ?.items.find((mealItem) => mealItem.id === itemId);

    if (!item) {
      return;
    }

    const nextServings = Math.max(1, item.servings - 1);

    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId
            ? scaleLoggedFoodItem(item, nextServings)
            : item,
        ),
      })),
    );

    if (!userId) {
      return;
    }

    void (async () => {
      try {
        await updateRemoteFoodLogServings(item, nextServings);
        bumpPersonalizationRefresh();
      } catch (error) {
        showNutritionAlert('Unable to update servings', getNutritionErrorMessage(error));
        await reloadNutritionState(false);
      }
    })();
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

    showNutritionConfirm({
      title: 'Remove logged food?',
      message: `${item.name} will be removed from ${mealLabel}.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        removeFood(mealId, item.id);

        if (!userId) {
          return;
        }

        void (async () => {
          try {
            await deleteRemoteFoodLog(item.id);
            bumpPersonalizationRefresh();
          } catch (error) {
            showNutritionAlert(
              'Unable to remove food',
              getNutritionErrorMessage(error),
            );
            await reloadNutritionState(false);
          }
        })();
      },
    });
  };

  const handleStartMealLog = (mealId: NutritionMealId) => {
    setActiveMealId(mealId);
    setLibraryMode('create');
  };

  const handleEditFood = async (
    mealId: NutritionMealId,
    item: NutritionFoodItem,
  ) => {
    let editableItem = createLoggedFoodStateItem(item);

    if (item.entryType === 'catalog' && item.catalogFoodId) {
      try {
        editableItem = mergeLoggedFoodIntoCatalogItem(
          item,
          await getCatalogFoodDetails(item.catalogFoodId),
        );
      } catch (error) {
        console.error('Catalog food edit load failed', error);
      }
    }

    openDraft({
      mode: 'edit',
      logId: item.id,
      item: editableItem,
      mealId,
      servings: item.servings,
      loggedFrom: item.loggedFrom,
    });
  };

  const handleConfirmDraft = async (servingsOverride?: number) => {
    if (!draft) {
      return;
    }

    const nextDraft =
      servingsOverride != null ? { ...draft, servings: servingsOverride } : draft;

    if (!userId) {
      if (nextDraft.mode === 'edit' && nextDraft.logId) {
        const updatedItem = buildDraftLocalFoodItem(nextDraft, nextDraft.logId);

        updateSelectedDay((day) => ({
          ...day,
          meals: day.meals.map((meal) => {
            const remainingItems = meal.items.filter(
              (item) => item.id !== nextDraft.logId,
            );

            if (meal.id === nextDraft.mealId) {
              return {
                ...meal,
                items: [...remainingItems, updatedItem],
              };
            }

            return remainingItems.length === meal.items.length
              ? meal
              : {
                  ...meal,
                  items: remainingItems,
                };
          }),
        }));
      } else {
        updateSelectedDay((day) =>
          updateMeal(day, nextDraft.mealId, (meal) => ({
            ...meal,
            // Keep duplicate logs as separate rows so each entry can be edited or deleted independently.
            items: [...meal.items, buildDraftLocalFoodItem(nextDraft)],
          })),
        );
      }

      setSearch('');
      setDraft(null);
      return;
    }

    try {
      if (nextDraft.mode === 'edit' && nextDraft.logId) {
        await updateRemoteFoodLog({
          logId: nextDraft.logId,
          item: nextDraft.item,
          loggedFrom: nextDraft.loggedFrom,
          mealId: nextDraft.mealId,
          note: nextDraft.note,
          servings: nextDraft.servings,
        });
        await reloadNutritionState(false);
        bumpPersonalizationRefresh();
      } else {
        const loggedItem = await createRemoteFoodLog({
          dayId: selectedDayId,
          item: nextDraft.item,
          loggedFrom: nextDraft.loggedFrom,
          mealId: nextDraft.mealId,
          note: nextDraft.note,
          servings: nextDraft.servings,
          userId,
        });

        updateSelectedDay((day) =>
          updateMeal(day, nextDraft.mealId, (meal) => ({
            ...meal,
            items: [...meal.items, loggedItem],
          })),
        );
        bumpPersonalizationRefresh();
      }

      setSearch('');
      setDraft(null);
    } catch (error) {
      showNutritionAlert('Unable to log food', getNutritionErrorMessage(error));
      await reloadNutritionState(false);
    }
  };

  const handleAdjustDraftServings = (delta: number) => {
    setDraft((previousDraft) =>
      previousDraft
        ? {
            ...previousDraft,
            servings: Math.max(
              0.1,
              Number((previousDraft.servings + delta).toFixed(4)),
            ),
          }
        : previousDraft,
    );
  };

  const handleSetDraftServings = (servings: number) => {
    setDraft((previousDraft) =>
      previousDraft
        ? {
            ...previousDraft,
            servings: Number(servings.toFixed(4)),
          }
        : previousDraft,
    );
  };

  const handleSelectDraftServing = (servingId: string) => {
    setDraft((previousDraft) =>
      previousDraft
        ? {
            ...previousDraft,
            item: applyServingSelection(previousDraft.item, servingId),
          }
        : previousDraft,
    );
  };

  const handleSaveCustomFood = async (nextDraft: CustomFoodDraft) => {
    try {
      const savedFoodId = await saveCustomFoodDefinition(nextDraft);
      const detail = await getUserFoodDetails(savedFoodId);

      setCustomFoodEditorDraft(null);
      setIsCustomFoodEditorVisible(false);
      setSearch(detail.name);
      setDraft((previousDraft) =>
        previousDraft?.item.userFoodId === savedFoodId
          ? { ...previousDraft, item: detail }
          : previousDraft,
      );
      bumpPersonalizationRefresh();
    } catch (error) {
      throw error;
    }
  };

  const handleArchiveCustomFood = async (userFoodId: string) => {
    await archiveCustomFoodDefinition(userFoodId);
    setCustomFoodEditorDraft(null);
    setIsCustomFoodEditorVisible(false);
    setDraft((previousDraft) =>
      previousDraft?.item.userFoodId === userFoodId ? null : previousDraft,
    );
    bumpPersonalizationRefresh();
  };

  const handleSaveRecipe = async (nextDraft: RecipeDraft) => {
    try {
      const savedRecipeId = await saveRecipeDefinition(nextDraft);
      const detail = await getRecipeDetails(savedRecipeId);

      setRecipeEditorDraft(null);
      setIsRecipeEditorVisible(false);
      setSearch(detail.name);
      setDraft((previousDraft) =>
        previousDraft?.item.recipeId === savedRecipeId
          ? { ...previousDraft, item: detail }
          : previousDraft,
      );
      bumpPersonalizationRefresh();
    } catch (error) {
      throw error;
    }
  };

  const handleArchiveRecipe = async (recipeId: string) => {
    await archiveRecipeDefinition(recipeId);
    setRecipeEditorDraft(null);
    setIsRecipeEditorVisible(false);
    setDraft((previousDraft) =>
      previousDraft?.item.recipeId === recipeId ? null : previousDraft,
    );
    bumpPersonalizationRefresh();
  };

  const handleHydrationChange = (delta: number) => {
    let nextHydration = 0;

    updateSelectedDay((day) => ({
      ...day,
      hydrationLiters: (() => {
        nextHydration = Math.max(
          0,
          Number((day.hydrationLiters + delta).toFixed(1)),
        );
        return nextHydration;
      })(),
    }));

    if (!userId) {
      return;
    }

    void updateRemoteHydration(userId, selectedDayId, nextHydration).catch(
      async (error) => {
        showNutritionAlert(
          'Unable to update hydration',
          getNutritionErrorMessage(error),
        );
        await reloadNutritionState(false);
      },
    );
  };

  const handleAddHydration = (amount: number) => {
    handleHydrationChange(amount);
  };

  const handleReduceHydration = (amount: number) => {
    handleHydrationChange(-amount);
  };

  const handleOpenBarcode = () => {
    setIsBarcodeModalVisible(true);
  };

  const handleOpenQuickLibrary = () => {
    setLibraryMode('create');
  };

  const handleBarcodeFoodFound = (item: NutritionCatalogStateItem) => {
    setIsBarcodeModalVisible(false);
    openDraft({
      item,
      loggedFrom: 'barcode',
    });
  };

  const handleLibraryPick = ({
    item,
    loggedFrom,
    note,
    shortcut,
  }: FoodPickerEntry) => {
    if (shortcut) {
      void handleSelectShortcut(shortcut, note);
      return;
    }

    openDraft({
      item,
      loggedFrom:
        loggedFrom ??
        (item.source === 'saved'
          ? 'saved'
          : item.source === 'recipe'
          ? 'recipe'
          : 'suggested'),
      note,
    });
  };

  const handleToggleDraftFavorite = async () => {
    if (!draft?.item.catalogFoodId || isFavoritePending) {
      return;
    }

    setIsFavoritePending(true);

    try {
      if (activeDraftFavorite?.favoriteId) {
        await removeFoodFavorite(activeDraftFavorite.favoriteId);
      } else {
        await addFoodFavorite(draft.item, draft.servings);
      }

      setPersonalizedSections(await loadPersonalizedFoodSections(activeMealId));
    } catch (error) {
      showNutritionAlert('Unable to update favorite', getNutritionErrorMessage(error));
    } finally {
      setIsFavoritePending(false);
    }
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
              accessibilityLabel="Open quick nutrition actions"
            >
              <Ionicons name="add" size={18} color={colors.background} />
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

          <View style={styles.searchResultsCard}>
            <View style={styles.searchResultsHeader}>
              <Text allowFontScaling={false} style={styles.searchResultsTitle}>
                {normalizedSearch.length >= 2 ? 'SEARCH RESULTS' : 'READY TO LOG'}
              </Text>
              <Text allowFontScaling={false} style={styles.searchResultsMeta}>
                {normalizedSearch.length >= 2
                  ? isSearchLoading || isOwnedSearchLoading || isHistoryLoading
                    ? 'Searching...'
                    : searchError &&
                      ownedSearchResults.length === 0 &&
                      historyEntries.length === 0
                    ? 'Unavailable'
                    : `${
                        historyEntries.length +
                        ownedSearchResults.length +
                        visibleCatalogResults.length
                      } shown`
                  : 'Search or create'}
              </Text>
            </View>

            {normalizedSearch.length < 2 ? (
              <>
                <Text allowFontScaling={false} style={styles.searchHint}>
                  Search above to log from the USDA database, or create a private
                  custom food or recipe.
                </Text>
                <View style={styles.compactActionRow}>
                  <Pressable
                    style={styles.compactActionButton}
                    onPress={handleStartCustomFoodCreate}
                  >
                    <Ionicons
                      name="nutrition-outline"
                      size={16}
                      color={colors.accent}
                    />
                    <Text
                      allowFontScaling={false}
                      style={styles.compactActionButtonText}
                    >
                      Custom Food
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.compactActionButton}
                    onPress={handleStartRecipeCreate}
                  >
                    <Ionicons name="book-outline" size={16} color={colors.accent} />
                    <Text
                      allowFontScaling={false}
                      style={styles.compactActionButtonText}
                    >
                      Recipe
                    </Text>
                  </Pressable>
                </View>
                {personalizationError ? (
                  <Text allowFontScaling={false} style={styles.emptyStateText}>
                    {personalizationError}
                  </Text>
                ) : null}
              </>
            ) : isSearchLoading &&
              isOwnedSearchLoading &&
              isHistoryLoading &&
              historyEntries.length === 0 &&
              ownedSearchResults.length === 0 &&
              visibleCatalogResults.length === 0 ? (
              <View style={styles.searchLoadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text allowFontScaling={false} style={styles.emptyStateText}>
                  Searching foods...
                </Text>
              </View>
            ) : (
              <>
                <LibrarySection
                  title="Your Foods & Recipes"
                  entries={ownedFoodEntries}
                  onPick={({ item }) => handleSelectOwnedSearchResult(item)}
                />

                {ownedSearchError && ownedSearchResults.length === 0 ? (
                  <Text allowFontScaling={false} style={styles.emptyStateText}>
                    {ownedSearchError}
                  </Text>
                ) : null}

                <LibrarySection
                  title="From Your History"
                  entries={historyEntries}
                  onPick={handleLibraryPick}
                />

                {historyError && historyEntries.length === 0 ? (
                  <Text allowFontScaling={false} style={styles.emptyStateText}>
                    {historyError}
                  </Text>
                ) : null}

                {visibleCatalogResults.length > 0 ? (
                  <View style={styles.librarySection}>
                    <Text
                      allowFontScaling={false}
                      style={styles.librarySectionTitle}
                    >
                      Food Database
                    </Text>
                    <View style={styles.librarySectionBody}>
                      {visibleCatalogResults.map((item) => (
                        <FoodPickerRow
                          key={item.id}
                          item={item}
                          note={
                            activeSearchSelectionId === getCatalogSelectionId(item)
                              ? 'Loading food details...'
                              : undefined
                          }
                          onPress={() => void handleSelectSearchResult(item)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {searchError && visibleCatalogResults.length === 0 ? (
                  <Text allowFontScaling={false} style={styles.emptyStateText}>
                    {searchError}
                  </Text>
                ) : null}

                {historyEntries.length === 0 &&
                ownedSearchResults.length === 0 &&
                visibleCatalogResults.length === 0 &&
                !searchError &&
                !ownedSearchError &&
                !historyError ? (
                  <Text allowFontScaling={false} style={styles.emptyStateText}>
                    No foods found.
                  </Text>
                ) : null}
              </>
            )}
          </View>

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
                  onEditFood={(item) => void handleEditFood(meal.id, item)}
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
                  onEditFood={(item) => void handleEditFood(meal.id, item)}
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
        visible={libraryMode === 'create'}
        mealLabel={activeMeal.label}
        onClose={() => setLibraryMode(null)}
        onCreateCustomFood={handleStartCustomFoodCreate}
        onCreateRecipe={handleStartRecipeCreate}
      />

      <BarcodeLookupModal
        visible={isBarcodeModalVisible}
        mealLabel={activeMeal.label}
        onClose={() => setIsBarcodeModalVisible(false)}
        onFoodFound={handleBarcodeFoodFound}
      />

      <FoodLogModal
        draft={draft}
        meals={selectedDay.meals}
        isFavorite={isDraftFavorite}
        isFavoritePending={isFavoritePending}
        canEditDefinition={Boolean(draft?.item.userFoodId || draft?.item.recipeId)}
        isDefinitionPending={isDefinitionPending}
        onClose={() => setDraft(null)}
        onEditDefinition={() => void handleEditDraftDefinition()}
        onSelectMeal={(mealId) => {
          setActiveMealId(mealId);
          setDraft((previousDraft) =>
            previousDraft ? { ...previousDraft, mealId } : previousDraft,
          );
        }}
        onSelectServing={handleSelectDraftServing}
        onAdjustServings={handleAdjustDraftServings}
        onSetServings={handleSetDraftServings}
        onToggleFavorite={() => void handleToggleDraftFavorite()}
        onConfirm={handleConfirmDraft}
      />

      <CustomFoodEditorModal
        initialDraft={customFoodEditorDraft}
        visible={isCustomFoodEditorVisible}
        onClose={() => {
          setIsCustomFoodEditorVisible(false);
          setCustomFoodEditorDraft(null);
        }}
        onSave={handleSaveCustomFood}
        onArchive={handleArchiveCustomFood}
      />

      <RecipeEditorModal
        initialDraft={recipeEditorDraft}
        visible={isRecipeEditorVisible}
        onClose={() => {
          setIsRecipeEditorVisible(false);
          setRecipeEditorDraft(null);
        }}
        onSave={handleSaveRecipe}
        onArchive={handleArchiveRecipe}
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
  targetChipDisabled: {
    opacity: 0.45,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  targetChipTextActive: {
    color: colors.textPrimary,
  },
  targetChipTextDisabled: {
    color: colors.textMuted,
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
  searchLoadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
  compactActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  compactActionButton: {
    alignItems: 'center',
    backgroundColor: '#131B12',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  compactActionButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
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
  sheetHeaderActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  favoriteButtonActive: {
    backgroundColor: '#213525',
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
  quickActionList: {
    gap: spacing.sm,
  },
  quickActionCard: {
    alignItems: 'center',
    backgroundColor: '#0F150E',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  quickActionIcon: {
    alignItems: 'center',
    backgroundColor: '#172117',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quickActionText: {
    flex: 1,
    gap: 2,
  },
  quickActionTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  quickActionDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
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
  servingInput: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    minWidth: 72,
    paddingVertical: 0,
    textAlign: 'center',
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
  servingInputMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  inlineErrorText: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
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
  confirmButtonTextDisabled: {
    opacity: 0.55,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
