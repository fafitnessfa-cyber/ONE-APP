import React, { useRef, useState } from 'react';
import {
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
import { createNutritionDaysState } from '../data/nutrition';
import {
  NutritionDay,
  NutritionDayId,
  NutritionFoodItem,
  NutritionFoodTemplate,
  NutritionMacroKey,
  NutritionMeal,
} from '../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const DAY_TABS: { id: NutritionDayId; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
];

const MACRO_ROWS: {
  key: NutritionMacroKey;
  label: string;
  color: string;
}[] = [
  { key: 'protein', label: 'Protein', color: colors.accent },
  { key: 'carbs', label: 'Carbs', color: colors.warning },
  { key: 'fats', label: 'Fats', color: '#E5F20A' },
];

const hydrationAccent = '#0FA7FF';
const calorieTrack = '#768071';

function createItemFromTemplate(
  template: NutritionFoodTemplate,
  servings = template.defaultServings,
): NutritionFoodItem {
  return {
    id: template.id,
    name: template.name,
    caloriesPerServing: template.caloriesPerServing,
    proteinPerServing: template.proteinPerServing,
    carbsPerServing: template.carbsPerServing,
    fatsPerServing: template.fatsPerServing,
    servings,
  };
}

function getFoodCalories(item: NutritionFoodItem) {
  return item.caloriesPerServing * item.servings;
}

function getMacroTotal(
  item: NutritionFoodItem,
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

function getDayConsumedCalories(day: NutritionDay) {
  return day.meals.reduce(
    (total, meal) =>
      total +
      meal.items.reduce(
        (mealTotal, item) => mealTotal + getFoodCalories(item),
        0,
      ),
    0,
  );
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

function formatLiters(value: number) {
  return value.toFixed(1);
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(value, 1));
}

function filterMeals(meals: NutritionMeal[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return meals;
  }

  return meals
    .map((meal) => {
      const mealMatches = meal.label.toLowerCase().includes(normalizedQuery);
      const visibleItems = meal.items.filter((item) =>
        item.name.toLowerCase().includes(normalizedQuery),
      );

      if (mealMatches) {
        return meal;
      }

      return {
        ...meal,
        items: visibleItems,
      };
    })
    .filter((meal) => {
      const matchesMeal = meal.label.toLowerCase().includes(normalizedQuery);
      return matchesMeal || meal.items.length > 0;
    });
}

function updateMeal(
  day: NutritionDay,
  mealId: string,
  updater: (meal: NutritionMeal) => NutritionMeal,
) {
  return {
    ...day,
    meals: day.meals.map((meal) => (meal.id === mealId ? updater(meal) : meal)),
  };
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
  const progress = clampProgress(remaining / goal);
  const dashOffset = circumference * (1 - progress);

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
          stroke={colors.accent}
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
        <Text allowFontScaling={false} style={styles.ringValue}>
          {Math.max(remaining, 0)}
        </Text>
        <Text allowFontScaling={false} style={styles.ringLabel}>
          REMAINING
        </Text>
      </View>
    </View>
  );
}

function MacroRow({
  label,
  color,
  consumed,
  goal,
}: {
  label: string;
  color: string;
  consumed: number;
  goal: number;
}) {
  const progress = clampProgress(consumed / goal);
  const remaining = Math.max(goal - consumed, 0);

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
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            {
              backgroundColor: color,
              width: `${progress * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.macroFooter}>
        <Text allowFontScaling={false} style={styles.macroMeta}>
          Left: {remaining}g
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

function MealCard({
  meal,
  onAddFood,
  onAddServing,
}: {
  meal: NutritionMeal;
  onAddFood: () => void;
  onAddServing: (itemId: string) => void;
}) {
  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text allowFontScaling={false} style={styles.mealTitle}>
          {meal.label.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={styles.mealTarget}>
          {meal.items.length > 0 ? `(${meal.targetCalories} kcal)` : '(No Log)'}
        </Text>
      </View>

      <View style={styles.mealBody}>
        {meal.items.length === 0 ? (
          <Text allowFontScaling={false} style={styles.mealEmpty}>
            No foods match this view yet.
          </Text>
        ) : (
          meal.items.map((item) => (
            <View key={item.id} style={styles.foodRow}>
              <View style={styles.foodMeta}>
                <Text allowFontScaling={false} style={styles.foodName}>
                  {item.name} ({item.servings})
                </Text>
                <Text allowFontScaling={false} style={styles.foodCalories}>
                  ({getFoodCalories(item)} kcal)
                </Text>
              </View>

              <Pressable
                style={styles.foodAction}
                onPress={() => onAddServing(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Add one serving of ${item.name}`}
              >
                <Ionicons name="add" size={16} color={colors.accent} />
              </Pressable>
            </View>
          ))
        )}

        <Pressable
          style={styles.addFoodButton}
          onPress={onAddFood}
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${meal.label}`}
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

export function NutritionScreen() {
  const [selectedDayId, setSelectedDayId] = useState<NutritionDayId>('today');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState<NutritionDay[]>(() =>
    createNutritionDaysState(),
  );
  const searchInputRef = useRef<TextInput>(null);

  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const consumedCalories = getDayConsumedCalories(selectedDay);
  const remainingCalories = getRemainingCalories(selectedDay);
  const filteredMeals = filterMeals(selectedDay.meals, search);
  const leftColumnMeals = filteredMeals.filter((_, index) => index % 2 === 0);
  const rightColumnMeals = filteredMeals.filter((_, index) => index % 2 === 1);

  const updateSelectedDay = (updater: (day: NutritionDay) => NutritionDay) => {
    setDays((previousDays) =>
      previousDays.map((day) =>
        day.id === selectedDayId ? updater(day) : day,
      ),
    );
  };

  const handleAddServing = (mealId: string, itemId: string) => {
    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId ? { ...item, servings: item.servings + 1 } : item,
        ),
      })),
    );
  };

  const handleAddFood = (mealId: string) => {
    updateSelectedDay((day) =>
      updateMeal(day, mealId, (meal) => {
        const template =
          meal.quickAddOptions[
            meal.nextQuickAddIndex % meal.quickAddOptions.length
          ];

        if (!template) {
          return meal;
        }

        const existingItem = meal.items.find((item) => item.id === template.id);
        const nextItems = existingItem
          ? meal.items.map((item) =>
              item.id === template.id
                ? { ...item, servings: item.servings + template.defaultServings }
                : item,
            )
          : [...meal.items, createItemFromTemplate(template)];

        return {
          ...meal,
          items: nextItems,
          nextQuickAddIndex: meal.nextQuickAddIndex + 1,
        };
      }),
    );
  };

  const handleAddHydration = (amount: number) => {
    updateSelectedDay((day) => ({
      ...day,
      hydrationLiters: Math.min(
        day.hydrationLiters + amount,
        day.hydrationGoalLiters + 1.5,
      ),
    }));
  };

  const handleQuickSearch = () => {
    const nextValue = search.trim().toLowerCase() === 'eggs' ? '' : 'eggs';
    setSearch(nextValue);
    searchInputRef.current?.focus();
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
              {MACRO_ROWS.map((macro) => (
                <MacroRow
                  key={macro.key}
                  label={macro.label}
                  color={macro.color}
                  consumed={getDayConsumedMacro(selectedDay, macro.key)}
                  goal={selectedDay.macroGoals[macro.key]}
                />
              ))}
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
                ref={searchInputRef}
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
              onPress={handleQuickSearch}
              accessibilityRole="button"
              accessibilityLabel="Quick search eggs"
            >
              <Ionicons
                name="barcode-outline"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>

            <Pressable
              style={[styles.searchAction, styles.searchActionPrimary]}
              onPress={() => searchInputRef.current?.focus()}
              accessibilityRole="button"
              accessibilityLabel="Focus food search"
            >
              <Ionicons name="mic" size={18} color={colors.background} />
            </Pressable>
          </View>

          {filteredMeals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text allowFontScaling={false} style={styles.emptyStateText}>
                No meals match your search yet.
              </Text>
            </View>
          ) : (
            <View style={styles.mealColumns}>
              <View style={styles.mealColumn}>
                {leftColumnMeals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    onAddFood={() => handleAddFood(meal.id)}
                    onAddServing={(itemId) => handleAddServing(meal.id, itemId)}
                  />
                ))}
              </View>

              <View style={styles.mealColumn}>
                {rightColumnMeals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    onAddFood={() => handleAddFood(meal.id)}
                    onAddServing={(itemId) => handleAddServing(meal.id, itemId)}
                  />
                ))}
              </View>
            </View>
          )}
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
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
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
    color: colors.accent,
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
  macroTrack: {
    backgroundColor: '#73796E',
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
  },
  macroFill: {
    borderRadius: radius.pill,
    height: '100%',
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
    borderRadius: radius.md,
    overflow: 'hidden',
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
    fontWeight: '600',
    marginTop: 2,
  },
  mealBody: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  mealEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 34,
  },
  foodRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  foodMeta: {
    flex: 1,
  },
  foodName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  foodCalories: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  foodAction: {
    alignItems: 'center',
    backgroundColor: colors.accentDark,
    borderRadius: radius.pill,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  addFoodButton: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  addFoodText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#0F150E',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 120,
    padding: spacing.xl,
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    textAlign: 'center',
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
    height: 70,
    justifyContent: 'center',
    width: 42,
  },
  hydrationMain: {
    flex: 1,
    gap: spacing.sm,
  },
  hydrationValue: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  hydrationTrack: {
    backgroundColor: '#758071',
    borderRadius: radius.pill,
    height: 6,
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
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  hydrationButtonFilled: {
    backgroundColor: '#143A54',
    borderColor: '#3DB7FF',
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
    marginTop: 1,
  },
  hydrationButtonSubLabelFilled: {
    color: '#B7DCF8',
  },
});
