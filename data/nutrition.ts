import {
  NutritionCatalogItem,
  NutritionCatalogStateItem,
  NutritionDay,
  NutritionFoodItem,
  NutritionLogSource,
} from '../types';

let nutritionFoodEntryId = 0;

export function createNutritionFoodEntryId(
  baseId: string,
  entryKind: 'seed' | 'log' = 'log',
) {
  nutritionFoodEntryId += 1;
  return `${baseId}-${entryKind}-${nutritionFoodEntryId}`;
}

export function createNutritionFoodItem(
  template: NutritionCatalogItem | NutritionCatalogStateItem,
  {
    servings = template.defaultServings,
    loggedFrom = 'search',
    entryKind = 'log',
    entryType,
    catalogServingId,
  }: {
    servings?: number;
    loggedFrom?: NutritionLogSource;
    entryKind?: 'seed' | 'log';
    entryType?: NutritionFoodItem['entryType'];
    catalogServingId?: string | null;
  } = {},
): NutritionFoodItem {
  const stateTemplate =
    'catalogFoodId' in template ||
    'databaseId' in template ||
    'userFoodId' in template ||
    'recipeId' in template ||
    'selectedServingId' in template
      ? template
      : null;
  const inferredEntryType =
    entryType ??
    (stateTemplate?.recipeId
      ? 'recipe'
      : stateTemplate?.userFoodId
      ? 'user_food'
      : stateTemplate?.catalogFoodId
      ? 'catalog'
      : stateTemplate?.databaseId
      ? 'legacy'
      : 'legacy');
  const effectiveGramsPerServing = stateTemplate?.effectiveGrams ?? null;
  const selectedServingNutrientValues =
    stateTemplate?.servingOptions?.find(
      (serving) => serving.id === stateTemplate?.selectedServingId,
    )?.nutrientValues ??
    (stateTemplate?.baseAmount == null ? stateTemplate?.nutrientValues : undefined);

  return {
    id: createNutritionFoodEntryId(template.id, entryKind),
    catalogItemId: template.id,
    entryType: inferredEntryType,
    legacyFoodId: stateTemplate?.databaseId ?? null,
    catalogFoodId: stateTemplate?.catalogFoodId ?? null,
    userFoodId: stateTemplate?.userFoodId ?? null,
    userFoodServingId: stateTemplate?.userFoodServingId ?? null,
    recipeId: stateTemplate?.recipeId ?? null,
    catalogServingId: catalogServingId ?? stateTemplate?.selectedServingId ?? null,
    selectedServingId: stateTemplate?.selectedServingId,
    name: template.name,
    brand: template.brand,
    servingLabel: template.servingLabel,
    caloriesPerServing: template.caloriesPerServing,
    proteinPerServing: template.proteinPerServing,
    carbsPerServing: template.carbsPerServing,
    fatsPerServing: template.fatsPerServing,
    fiberPerServing: template.fiberPerServing,
    sodiumMgPerServing: template.sodiumMgPerServing,
    source: template.source,
    loggedFrom,
    servings,
    servingQuantity: servings,
    effectiveGrams:
      effectiveGramsPerServing == null
        ? null
        : Number((effectiveGramsPerServing * servings).toFixed(4)),
    nutrientValues: {
      ...(selectedServingNutrientValues ?? {}),
      energy_kcal: template.caloriesPerServing,
      protein: template.proteinPerServing,
      carbohydrate: template.carbsPerServing,
      fat: template.fatsPerServing,
      fiber: template.fiberPerServing,
      sodium: template.sodiumMgPerServing,
    },
  };
}

export const nutritionCatalog: NutritionCatalogItem[] = [
  {
    id: 'scrambled-eggs',
    name: 'Scrambled Eggs',
    servingLabel: '1 egg',
    caloriesPerServing: 93,
    proteinPerServing: 6,
    carbsPerServing: 1,
    fatsPerServing: 5,
    fiberPerServing: 0,
    sodiumMgPerServing: 90,
    defaultServings: 2,
    source: 'usda',
    keywords: ['eggs', 'breakfast', 'protein'],
    suggestedMealIds: ['breakfast'],
  },
  {
    id: 'morning-oats',
    name: 'My Morning Oats',
    brand: 'Saved Meal',
    servingLabel: '1 bowl',
    caloriesPerServing: 205,
    proteinPerServing: 12,
    carbsPerServing: 36,
    fatsPerServing: 4,
    fiberPerServing: 5,
    sodiumMgPerServing: 160,
    defaultServings: 1,
    source: 'saved',
    keywords: ['oats', 'overnight oats', 'breakfast'],
    suggestedMealIds: ['breakfast'],
  },
  {
    id: 'grilled-chicken-bowl',
    name: 'Grilled Chicken Bowl',
    brand: 'Recipe',
    servingLabel: '1 bowl',
    caloriesPerServing: 289,
    proteinPerServing: 34,
    carbsPerServing: 28,
    fatsPerServing: 8,
    fiberPerServing: 4,
    sodiumMgPerServing: 540,
    defaultServings: 1,
    source: 'recipe',
    keywords: ['chicken bowl', 'rice bowl', 'lunch'],
    suggestedMealIds: ['lunch', 'dinner'],
  },
  {
    id: 'salmon-plate',
    name: 'Salmon Plate',
    brand: 'Recipe',
    servingLabel: '1 plate',
    caloriesPerServing: 395,
    proteinPerServing: 30,
    carbsPerServing: 18,
    fatsPerServing: 16,
    fiberPerServing: 3,
    sodiumMgPerServing: 420,
    defaultServings: 1,
    source: 'recipe',
    keywords: ['salmon', 'dinner', 'omega'],
    suggestedMealIds: ['dinner'],
  },
  {
    id: 'greek-yogurt',
    name: 'Greek Yogurt',
    servingLabel: '1 cup',
    caloriesPerServing: 160,
    proteinPerServing: 15,
    carbsPerServing: 12,
    fatsPerServing: 3,
    fiberPerServing: 0,
    sodiumMgPerServing: 68,
    defaultServings: 1,
    source: 'usda',
    keywords: ['yogurt', 'snack', 'protein'],
    suggestedMealIds: ['breakfast', 'snacks'],
  },
  {
    id: 'protein-shake',
    name: 'Gold Standard Whey',
    brand: 'Optimum Nutrition',
    servingLabel: '1 shake',
    caloriesPerServing: 190,
    proteinPerServing: 28,
    carbsPerServing: 8,
    fatsPerServing: 5,
    fiberPerServing: 1,
    sodiumMgPerServing: 140,
    defaultServings: 1,
    source: 'nutritionix',
    keywords: ['protein shake', 'whey', 'post workout'],
    suggestedMealIds: ['snacks', 'breakfast'],
  },
  {
    id: 'turkey-wrap',
    name: 'Turkey Wrap',
    brand: 'Recipe',
    servingLabel: '1 wrap',
    caloriesPerServing: 330,
    proteinPerServing: 26,
    carbsPerServing: 30,
    fatsPerServing: 10,
    fiberPerServing: 4,
    sodiumMgPerServing: 620,
    defaultServings: 1,
    source: 'recipe',
    keywords: ['turkey', 'wrap', 'lunch'],
    suggestedMealIds: ['lunch'],
  },
  {
    id: 'tuna-sandwich',
    name: 'Tuna Sandwich',
    brand: 'Recipe',
    servingLabel: '1 sandwich',
    caloriesPerServing: 310,
    proteinPerServing: 27,
    carbsPerServing: 27,
    fatsPerServing: 9,
    fiberPerServing: 3,
    sodiumMgPerServing: 560,
    defaultServings: 1,
    source: 'recipe',
    keywords: ['tuna', 'sandwich', 'lunch'],
    suggestedMealIds: ['lunch'],
  },
  {
    id: 'rice-chicken-plate',
    name: 'Chicken Rice Prep',
    brand: 'Saved Meal',
    servingLabel: '1 container',
    caloriesPerServing: 360,
    proteinPerServing: 32,
    carbsPerServing: 34,
    fatsPerServing: 8,
    fiberPerServing: 3,
    sodiumMgPerServing: 470,
    defaultServings: 1,
    source: 'saved',
    keywords: ['meal prep', 'chicken rice', 'prep'],
    suggestedMealIds: ['lunch', 'dinner'],
  },
  {
    id: 'peanut-butter-toast',
    name: 'Peanut Butter Toast',
    servingLabel: '1 slice',
    caloriesPerServing: 220,
    proteinPerServing: 9,
    carbsPerServing: 18,
    fatsPerServing: 12,
    fiberPerServing: 3,
    sodiumMgPerServing: 210,
    defaultServings: 1,
    source: 'usda',
    keywords: ['toast', 'peanut butter', 'breakfast'],
    suggestedMealIds: ['breakfast', 'snacks'],
  },
  {
    id: 'fruit-cup',
    name: 'Fruit Cup',
    servingLabel: '1 cup',
    caloriesPerServing: 120,
    proteinPerServing: 2,
    carbsPerServing: 27,
    fatsPerServing: 0,
    fiberPerServing: 3,
    sodiumMgPerServing: 2,
    defaultServings: 1,
    source: 'usda',
    keywords: ['fruit', 'snack', 'banana'],
    suggestedMealIds: ['breakfast', 'snacks'],
  },
  {
    id: 'greek-yogurt-parfait',
    name: 'Greek Yogurt Parfait',
    brand: 'Recipe',
    servingLabel: '1 cup',
    caloriesPerServing: 210,
    proteinPerServing: 14,
    carbsPerServing: 20,
    fatsPerServing: 6,
    fiberPerServing: 2,
    sodiumMgPerServing: 115,
    defaultServings: 1,
    source: 'recipe',
    keywords: ['parfait', 'yogurt', 'berries'],
    suggestedMealIds: ['breakfast', 'snacks'],
  },
  {
    id: 'chicken-breast',
    name: 'Chicken Breast',
    servingLabel: '120 g',
    caloriesPerServing: 165,
    proteinPerServing: 31,
    carbsPerServing: 0,
    fatsPerServing: 4,
    fiberPerServing: 0,
    sodiumMgPerServing: 74,
    defaultServings: 1,
    source: 'usda',
    keywords: ['chicken', 'lean protein'],
    suggestedMealIds: ['lunch', 'dinner'],
  },
  {
    id: 'white-rice',
    name: 'White Rice',
    servingLabel: '1 cup',
    caloriesPerServing: 206,
    proteinPerServing: 4,
    carbsPerServing: 45,
    fatsPerServing: 0,
    fiberPerServing: 1,
    sodiumMgPerServing: 2,
    defaultServings: 1,
    source: 'usda',
    keywords: ['rice', 'carbs', 'side'],
    suggestedMealIds: ['lunch', 'dinner'],
  },
  {
    id: 'banana',
    name: 'Banana',
    servingLabel: '1 banana',
    caloriesPerServing: 105,
    proteinPerServing: 1,
    carbsPerServing: 27,
    fatsPerServing: 0,
    fiberPerServing: 3,
    sodiumMgPerServing: 1,
    defaultServings: 1,
    source: 'usda',
    keywords: ['banana', 'fruit', 'pre workout'],
    suggestedMealIds: ['breakfast', 'snacks'],
  },
  {
    id: 'protein-bar',
    name: 'Chocolate Protein Bar',
    brand: 'Quest',
    servingLabel: '1 bar',
    caloriesPerServing: 200,
    proteinPerServing: 20,
    carbsPerServing: 22,
    fatsPerServing: 7,
    fiberPerServing: 14,
    sodiumMgPerServing: 210,
    defaultServings: 1,
    source: 'nutritionix',
    keywords: ['protein bar', 'chocolate', 'snack'],
    suggestedMealIds: ['snacks'],
  },
  {
    id: 'sports-drink',
    name: 'Lemon Lime Sports Drink',
    brand: 'Gatorade',
    servingLabel: '1 bottle',
    caloriesPerServing: 140,
    proteinPerServing: 0,
    carbsPerServing: 36,
    fatsPerServing: 0,
    fiberPerServing: 0,
    sodiumMgPerServing: 270,
    defaultServings: 1,
    source: 'nutritionix',
    keywords: ['gatorade', 'sports drink', 'hydration'],
    suggestedMealIds: ['snacks'],
  },
  {
    id: 'greek-yogurt-cup',
    name: 'Strawberry Yogurt Cup',
    brand: 'Chobani',
    servingLabel: '1 cup',
    caloriesPerServing: 150,
    proteinPerServing: 11,
    carbsPerServing: 16,
    fatsPerServing: 3,
    fiberPerServing: 0,
    sodiumMgPerServing: 75,
    defaultServings: 1,
    source: 'nutritionix',
    keywords: ['chobani', 'yogurt', 'snack'],
    suggestedMealIds: ['snacks', 'breakfast'],
  },
  {
    id: 'post-workout-combo',
    name: 'Post-Workout Combo',
    brand: 'Saved Meal',
    servingLabel: '1 set',
    caloriesPerServing: 350,
    proteinPerServing: 33,
    carbsPerServing: 40,
    fatsPerServing: 5,
    fiberPerServing: 5,
    sodiumMgPerServing: 310,
    defaultServings: 1,
    source: 'saved',
    keywords: ['post workout', 'protein', 'carbs'],
    suggestedMealIds: ['snacks', 'dinner'],
  },
];

export const barcodePreviewIds = [
  'protein-shake',
  'protein-bar',
  'sports-drink',
  'greek-yogurt-cup',
] as const;

export function getCatalogItemById(id: string) {
  return nutritionCatalog.find((item) => item.id === id);
}

function createFoodItem(
  itemId: string,
  servings?: number,
  loggedFrom: NutritionLogSource = 'search',
): NutritionFoodItem {
  const template = getCatalogItemById(itemId);

  if (!template) {
    throw new Error(`Missing nutrition catalog item: ${itemId}`);
  }

  return createNutritionFoodItem(template, {
    servings,
    loggedFrom,
    entryKind: 'seed',
  });
}

export const nutritionDays: NutritionDay[] = [
  {
    id: 'yesterday',
    label: 'Yesterday',
    baseGoal: 1600,
    exerciseCalories: 420,
    hydrationLiters: 2.4,
    hydrationGoalLiters: 3.5,
    macroGoals: {
      protein: 160,
      carbs: 150,
      fats: 60,
    },
    meals: [
      {
        id: 'breakfast',
        label: 'Breakfast',
        targetCalories: 420,
        items: [
          createFoodItem('scrambled-eggs', 3),
          createFoodItem('morning-oats'),
        ],
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 520,
        items: [createFoodItem('turkey-wrap')],
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 500,
        items: [createFoodItem('salmon-plate')],
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 180,
        items: [createFoodItem('greek-yogurt')],
      },
    ],
  },
  {
    id: 'today',
    label: 'Today',
    baseGoal: 1600,
    exerciseCalories: 550,
    hydrationLiters: 2.8,
    hydrationGoalLiters: 3.5,
    macroGoals: {
      protein: 160,
      carbs: 160,
      fats: 60,
    },
    meals: [
      {
        id: 'breakfast',
        label: 'Breakfast',
        targetCalories: 450,
        items: [
          createFoodItem('scrambled-eggs', 3),
          createFoodItem('morning-oats'),
        ],
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 450,
        items: [createFoodItem('grilled-chicken-bowl')],
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 450,
        items: [createFoodItem('salmon-plate')],
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 150,
        items: [],
      },
    ],
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    baseGoal: 1650,
    exerciseCalories: 300,
    hydrationLiters: 0.6,
    hydrationGoalLiters: 3.5,
    macroGoals: {
      protein: 160,
      carbs: 170,
      fats: 65,
    },
    meals: [
      {
        id: 'breakfast',
        label: 'Breakfast',
        targetCalories: 420,
        items: [createFoodItem('morning-oats')],
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 500,
        items: [],
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 520,
        items: [createFoodItem('rice-chicken-plate')],
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 210,
        items: [createFoodItem('greek-yogurt-parfait')],
      },
    ],
  },
];

export function createNutritionDaysState(): NutritionDay[] {
  return nutritionDays.map((day) => ({
    ...day,
    macroGoals: { ...day.macroGoals },
    meals: day.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => ({ ...item })),
    })),
  }));
}
