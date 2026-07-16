import {
  NutritionDay,
  NutritionFoodItem,
  NutritionFoodTemplate,
} from '../types';

const scrambledEggs: NutritionFoodTemplate = {
  id: 'scrambled-eggs',
  name: 'Scrambled Eggs',
  caloriesPerServing: 93,
  proteinPerServing: 6,
  carbsPerServing: 1,
  fatsPerServing: 5,
  defaultServings: 3,
};

const overnightOats: NutritionFoodTemplate = {
  id: 'overnight-oats',
  name: 'Overnight Oats',
  caloriesPerServing: 205,
  proteinPerServing: 12,
  carbsPerServing: 36,
  fatsPerServing: 4,
  defaultServings: 1,
};

const grilledChickenBowl: NutritionFoodTemplate = {
  id: 'grilled-chicken-bowl',
  name: 'Grilled Chicken Bowl',
  caloriesPerServing: 289,
  proteinPerServing: 34,
  carbsPerServing: 28,
  fatsPerServing: 8,
  defaultServings: 1,
};

const salmonPlate: NutritionFoodTemplate = {
  id: 'salmon-plate',
  name: 'Salmon Plate',
  caloriesPerServing: 395,
  proteinPerServing: 30,
  carbsPerServing: 18,
  fatsPerServing: 16,
  defaultServings: 1,
};

const greekYogurt: NutritionFoodTemplate = {
  id: 'greek-yogurt',
  name: 'Greek Yogurt',
  caloriesPerServing: 160,
  proteinPerServing: 15,
  carbsPerServing: 12,
  fatsPerServing: 3,
  defaultServings: 1,
};

const proteinShake: NutritionFoodTemplate = {
  id: 'protein-shake',
  name: 'Protein Shake',
  caloriesPerServing: 190,
  proteinPerServing: 28,
  carbsPerServing: 8,
  fatsPerServing: 5,
  defaultServings: 1,
};

const turkeyWrap: NutritionFoodTemplate = {
  id: 'turkey-wrap',
  name: 'Turkey Wrap',
  caloriesPerServing: 330,
  proteinPerServing: 26,
  carbsPerServing: 30,
  fatsPerServing: 10,
  defaultServings: 1,
};

const tunaSandwich: NutritionFoodTemplate = {
  id: 'tuna-sandwich',
  name: 'Tuna Sandwich',
  caloriesPerServing: 310,
  proteinPerServing: 27,
  carbsPerServing: 27,
  fatsPerServing: 9,
  defaultServings: 1,
};

const riceChickenPlate: NutritionFoodTemplate = {
  id: 'rice-chicken-plate',
  name: 'Rice Chicken Plate',
  caloriesPerServing: 360,
  proteinPerServing: 32,
  carbsPerServing: 34,
  fatsPerServing: 8,
  defaultServings: 1,
};

const peanutButterToast: NutritionFoodTemplate = {
  id: 'peanut-butter-toast',
  name: 'Peanut Butter Toast',
  caloriesPerServing: 220,
  proteinPerServing: 9,
  carbsPerServing: 18,
  fatsPerServing: 12,
  defaultServings: 1,
};

const fruitCup: NutritionFoodTemplate = {
  id: 'fruit-cup',
  name: 'Fruit Cup',
  caloriesPerServing: 120,
  proteinPerServing: 2,
  carbsPerServing: 27,
  fatsPerServing: 0,
  defaultServings: 1,
};

const greekYogurtParfait: NutritionFoodTemplate = {
  id: 'greek-yogurt-parfait',
  name: 'Greek Yogurt Parfait',
  caloriesPerServing: 210,
  proteinPerServing: 14,
  carbsPerServing: 20,
  fatsPerServing: 6,
  defaultServings: 1,
};

function createFoodItem(
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
        items: [createFoodItem(scrambledEggs), createFoodItem(overnightOats)],
        quickAddOptions: [scrambledEggs, overnightOats, proteinShake],
        nextQuickAddIndex: 0,
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 520,
        items: [createFoodItem(turkeyWrap)],
        quickAddOptions: [turkeyWrap, tunaSandwich, riceChickenPlate],
        nextQuickAddIndex: 0,
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 500,
        items: [createFoodItem(salmonPlate)],
        quickAddOptions: [salmonPlate, riceChickenPlate, grilledChickenBowl],
        nextQuickAddIndex: 0,
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 180,
        items: [createFoodItem(greekYogurt)],
        quickAddOptions: [greekYogurt, fruitCup, peanutButterToast],
        nextQuickAddIndex: 0,
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
        items: [createFoodItem(scrambledEggs), createFoodItem(overnightOats)],
        quickAddOptions: [scrambledEggs, overnightOats, proteinShake],
        nextQuickAddIndex: 0,
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 450,
        items: [createFoodItem(grilledChickenBowl)],
        quickAddOptions: [grilledChickenBowl, tunaSandwich, turkeyWrap],
        nextQuickAddIndex: 0,
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 450,
        items: [createFoodItem(salmonPlate)],
        quickAddOptions: [salmonPlate, riceChickenPlate, grilledChickenBowl],
        nextQuickAddIndex: 0,
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 150,
        items: [],
        quickAddOptions: [greekYogurt, fruitCup, proteinShake],
        nextQuickAddIndex: 0,
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
        items: [createFoodItem(overnightOats)],
        quickAddOptions: [overnightOats, scrambledEggs, fruitCup],
        nextQuickAddIndex: 0,
      },
      {
        id: 'lunch',
        label: 'Lunch',
        targetCalories: 500,
        items: [],
        quickAddOptions: [turkeyWrap, grilledChickenBowl, tunaSandwich],
        nextQuickAddIndex: 0,
      },
      {
        id: 'dinner',
        label: 'Dinner',
        targetCalories: 520,
        items: [createFoodItem(riceChickenPlate)],
        quickAddOptions: [salmonPlate, riceChickenPlate, grilledChickenBowl],
        nextQuickAddIndex: 0,
      },
      {
        id: 'snacks',
        label: 'Snacks',
        targetCalories: 210,
        items: [createFoodItem(greekYogurtParfait)],
        quickAddOptions: [greekYogurtParfait, peanutButterToast, proteinShake],
        nextQuickAddIndex: 0,
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
      quickAddOptions: meal.quickAddOptions.map((option) => ({ ...option })),
    })),
  }));
}
