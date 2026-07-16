// Shared type definitions. Define your data shapes once here and import
// them anywhere. This is what makes TypeScript catch mistakes for you.

export interface Exercise {
  id: string;
  name: string;
  type: string;
  muscles: string[];
  tags: string[];
  image?: string;
}

export interface FilterTag {
  id: string;
  label: string;
}

export type NutritionDayId = 'yesterday' | 'today' | 'tomorrow';
export type NutritionMealId = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type NutritionMacroKey = 'protein' | 'carbs' | 'fats';
export type NutritionFoodSource = 'usda' | 'nutritionix' | 'saved' | 'recipe';
export type NutritionLogSource =
  | 'search'
  | 'barcode'
  | 'saved'
  | 'recipe'
  | 'suggested';

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

export interface NutritionFoodItem
  extends Omit<
    NutritionFoodTemplate,
    'id' | 'defaultServings' | 'keywords' | 'suggestedMealIds'
  > {
  id: string;
  catalogItemId: string;
  servings: number;
  loggedFrom: NutritionLogSource;
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
