// Shared type definitions. Define your data shapes once here and import
// them anywhere. This is what makes TypeScript catch mistakes for you.

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  type: string;
  muscles: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  muscleGroups: string[];
  bodyRegions: string[];
  equipment: string[];
  equipmentCodes: string[];
  tags: string[];
  description?: string;
  instructions: string[];
  exerciseType: 'strength' | 'cardio' | 'mobility';
  movementPattern: string | null;
  mechanic: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  laterality: 'bilateral' | 'unilateral' | 'alternating' | null;
  primaryTrackingMetric: string;
  loadType: string;
  programFocuses: string[];
  aliases: string[];
  image?: string;
}

export type ExerciseFilterTagId =
  | 'all'
  | 'chest'
  | 'legs'
  | 'hypertrophy'
  | 'barbell'
  | 'upper'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core';

export interface FilterTag {
  id: ExerciseFilterTagId;
  label: string;
}

export interface ExerciseSearchFilters {
  muscleGroups?: string[];
  bodyRegions?: string[];
  equipmentCodes?: string[];
  exerciseTypes?: Exercise['exerciseType'][];
  difficultyLevels?: NonNullable<Exercise['difficulty']>[];
  movementPatterns?: string[];
  programFocuses?: string[];
}

export type NutritionDayId = 'yesterday' | 'today' | 'tomorrow';
export type NutritionMealId = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type NutritionMacroKey = 'protein' | 'carbs' | 'fats';
export type NutritionFoodSource =
  | 'usda'
  | 'branded'
  | 'nutritionix'
  | 'saved'
  | 'recipe'
  | 'custom';
export type NutritionLogSource =
  | 'search'
  | 'barcode'
  | 'saved'
  | 'recipe'
  | 'suggested';
export type NutritionLogEntryKind =
  | 'legacy'
  | 'catalog'
  | 'user_food'
  | 'recipe';
export type NutritionShortcutKind =
  | 'favorite'
  | 'recent'
  | 'history'
  | 'go_to';
export type NutritionCanonicalNutrientCode =
  | 'energy_kcal'
  | 'protein'
  | 'carbohydrate'
  | 'fat'
  | 'fiber'
  | 'sugars'
  | 'sodium'
  | 'potassium'
  | 'calcium'
  | 'iron'
  | 'vitamin_c'
  | 'vitamin_d'
  | 'saturated_fat'
  | 'cholesterol';

export type NutritionNutrientValues = Partial<
  Record<NutritionCanonicalNutrientCode, number>
>;

export interface NutritionServingOption {
  id: string;
  label: string;
  quantity: number;
  gramWeight?: number | null;
  milliliterVolume?: number | null;
  householdUnit?: string | null;
  isDefault: boolean;
  isSupported?: boolean;
  nutrientValues?: NutritionNutrientValues;
}

export interface NutritionMacroGoals {
  protein: number;
  carbs: number;
  fats: number;
}

export interface NutritionFoodTemplate {
  id: string;
  name: string;
  brand?: string;
  servingLabel: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatsPerServing: number;
  fiberPerServing?: number;
  sodiumMgPerServing?: number;
  defaultServings: number;
  source: NutritionFoodSource;
  keywords: string[];
  suggestedMealIds?: NutritionMealId[];
}

export interface NutritionCatalogItem extends NutritionFoodTemplate {}

export interface NutritionCatalogStateItem extends NutritionCatalogItem {
  databaseId?: string;
  catalogFoodId?: string;
  catalogSourceCode?: string;
  userFoodId?: string;
  userFoodServingId?: string | null;
  recipeId?: string;
  description?: string;
  baseAmount?: number | null;
  baseUnit?: string | null;
  effectiveGrams?: number | null;
  nutrientValues?: NutritionNutrientValues;
  selectedServingId?: string;
  servingOptions?: NutritionServingOption[];
}

export interface NutritionFoodItem
  extends Omit<
    NutritionFoodTemplate,
    'id' | 'defaultServings' | 'keywords' | 'suggestedMealIds'
  > {
  id: string;
  catalogItemId: string;
  entryType: NutritionLogEntryKind;
  legacyFoodId?: string | null;
  catalogFoodId?: string | null;
  catalogServingId?: string | null;
  userFoodId?: string | null;
  userFoodServingId?: string | null;
  recipeId?: string | null;
  selectedServingId?: string;
  servings: number;
  servingQuantity: number;
  effectiveGrams?: number | null;
  nutrientValues?: NutritionNutrientValues;
  loggedFrom: NutritionLogSource;
}

export interface NutritionShortcutItem {
  id: string;
  kind: NutritionShortcutKind;
  item: NutritionCatalogStateItem;
  entryType: NutritionLogEntryKind;
  favoriteId?: string;
  favoriteConfigKey?: string;
  lastLoggedAt?: string;
  logCount?: number;
  mealMatchCount?: number;
  score?: number;
}

export interface NutritionMeal {
  id: NutritionMealId;
  label: string;
  targetCalories: number;
  items: NutritionFoodItem[];
}

export interface NutritionDay {
  id: NutritionDayId;
  label: string;
  baseGoal: number;
  exerciseCalories: number;
  hydrationLiters: number;
  hydrationGoalLiters: number;
  macroGoals: NutritionMacroGoals;
  meals: NutritionMeal[];
}

export type ProfileFitnessGoal =
  | 'lose_weight'
  | 'build_muscle'
  | 'maintain'
  | 'improve_strength'
  | 'improve_fitness';
export type ProfileExperienceLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced';
export type ProfileWorkoutLocation = 'home' | 'gym' | 'both';
export type ProfileUnitPreference = 'metric' | 'imperial';
export type ProfileWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface UserProfile {
  id: string;
  displayName: string | null;
  phoneNumber: string | null;
  ageYears: number | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  fitnessGoal: ProfileFitnessGoal | null;
  experienceLevel: ProfileExperienceLevel | null;
  preferredTrainingDaysPerWeek: number | null;
  preferredTrainingDays: ProfileWeekday[];
  preferredWorkoutLocation: ProfileWorkoutLocation | null;
  preferredUnits: ProfileUnitPreference | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
