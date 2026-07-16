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

export type NutritionMacroKey = 'protein' | 'carbs' | 'fats';

export interface NutritionMacroGoals {
  protein: number;
  carbs: number;
  fats: number;
}

export interface NutritionFoodTemplate {
  id: string;
  name: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatsPerServing: number;
  defaultServings: number;
}

export interface NutritionFoodItem {
  id: string;
  name: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatsPerServing: number;
  servings: number;
}

export interface NutritionMeal {
  id: string;
  label: string;
  targetCalories: number;
  items: NutritionFoodItem[];
  quickAddOptions: NutritionFoodTemplate[];
  nextQuickAddIndex: number;
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
