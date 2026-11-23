import { ObjectId } from 'mongodb';

const idOf = (val) => new ObjectId(val);
const hasId = (val) => /^[a-f\d]{24}$/i.test(val || '') && ObjectId.isValid(val);

export async function getAuthenticatedUserContext(db, user) {
  const todayStr = new Date().toISOString().split('T')[0];
  const uid = user.uid;

  // 1. User Profile & Preferences
  const userProfile = await db.collection('users').findOne({
    $or: [{ firebaseUid: uid }, { uid }],
  });

  const name = userProfile?.name || user.name || 'Fitness Member';
  const height = userProfile?.height || 175;
  const weight = userProfile?.weight || 70;
  const goal = userProfile?.fitnessGoal || 'Muscle Building & Fitness';
  const targetCalories = userProfile?.dailyCalories || 2000;

  // 2. Today's Food Intake (Diet Plan Consumed + Manually Logged)
  const [dietConsumedDocs, calorieSummaryDocs] = await Promise.all([
    db.collection('diet_consumption_prefs').find({ firebaseUid: uid, date: todayStr }).toArray(),
    db.collection('daily_calorie_summaries').find({ firebaseUid: uid, date: todayStr }).toArray(),
  ]);

  const dietConsumedCalories = dietConsumedDocs.reduce((acc, doc) => acc + (doc.calories || 0), 0);
  const manualLoggedMeals = calorieSummaryDocs.flatMap((s) => s.meals || []);
  const manualConsumedCalories = manualLoggedMeals.reduce((acc, m) => acc + (m.calories || 0), 0);
  const totalConsumedCalories = dietConsumedCalories + manualConsumedCalories;

  const remainingCalories = Math.max(0, targetCalories - totalConsumedCalories);

  // 3. Activity & Steps
  const stepDocs = await db.collection('daily_step_records').find({ firebaseUid: uid, date: todayStr }).toArray();
  const todaySteps = stepDocs.reduce((acc, s) => acc + (s.stepCount || 0), 0);
  const stepCalories = Math.round(todaySteps * 0.04 * (weight / 70.0));

  // 4. Completed Workouts
  const workoutDocs = await db.collection('completed_workout_records').find({ firebaseUid: uid, date: todayStr }).toArray();
  const workoutCalories = workoutDocs.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
  const completedWorkoutsCount = workoutDocs.length;

  const totalActiveCaloriesBurned = stepCalories + workoutCalories;

  return {
    todayStr,
    user: {
      name,
      height,
      weight,
      goal,
    },
    nutrition: {
      targetCalories,
      consumedCalories: totalConsumedCalories,
      remainingCalories,
      dietConsumedCalories,
      manualConsumedCalories,
      loggedMealsCount: manualLoggedMeals.length + dietConsumedDocs.length,
    },
    activity: {
      steps: todaySteps,
      stepGoal: 10000,
      stepCalories,
      totalActiveCaloriesBurned,
    },
    workout: {
      completedCount: completedWorkoutsCount,
      completedWorkouts: workoutDocs.map((w) => ({
        name: w.workoutName,
        duration: w.activeDurationMinutes,
        calories: w.caloriesBurned,
      })),
      workoutCalories,
    },
  };
}

// Trusted Nutrition Density Lookup Table (per 100g)
export const KNOWN_FOOD_DATABASE = {
  cheesecake: { caloriesPer100g: 320, standardPortionGrams: 100, unit: 'g' },
  pizza: { caloriesPer100g: 266, standardPortionGrams: 107, unit: 'slice' },
  burger: { caloriesPer100g: 295, standardPortionGrams: 150, unit: 'item' },
  chicken: { caloriesPer100g: 165, standardPortionGrams: 150, unit: 'g' },
  rice: { caloriesPer100g: 130, standardPortionGrams: 150, unit: 'g' },
  banana: { caloriesPer100g: 89, standardPortionGrams: 118, unit: 'item' },
  apple: { caloriesPer100g: 52, standardPortionGrams: 182, unit: 'item' },
  eggs: { caloriesPer100g: 155, standardPortionGrams: 50, unit: 'item' },
  bread: { caloriesPer100g: 265, standardPortionGrams: 30, unit: 'slice' },
  oatmeal: { caloriesPer100g: 68, standardPortionGrams: 200, unit: 'g' },
  biryani: { caloriesPer100g: 180, standardPortionGrams: 250, unit: 'g' },
  dosa: { caloriesPer100g: 168, standardPortionGrams: 100, unit: 'item' },
  idli: { caloriesPer100g: 130, standardPortionGrams: 60, unit: 'item' },
  paneer: { caloriesPer100g: 265, standardPortionGrams: 100, unit: 'g' },
};

export function analyzeFoodPortion(question, userContext) {
  const lowerQ = question.toLowerCase();
  let matchedFood = null;
  let foodKey = null;

  for (const key of Object.keys(KNOWN_FOOD_DATABASE)) {
    if (lowerQ.includes(key)) {
      matchedFood = KNOWN_FOOD_DATABASE[key];
      foodKey = key;
      break;
    }
  }

  if (!matchedFood) return null;

  const remaining = userContext.nutrition.remainingCalories;
  const calsPer100g = matchedFood.caloriesPer100g;

  // Calculate portion math deterministically
  const maxPortionGrams = Math.round((remaining / calsPer100g) * 100);
  const recommendedPortionGrams = Math.min(matchedFood.standardPortionGrams, Math.round(maxPortionGrams * 0.6));
  const estimatedCalories = Math.round((recommendedPortionGrams * calsPer100g) / 100);
  const remainingAfterPortion = Math.max(0, remaining - estimatedCalories);

  return {
    foodName: foodKey.charAt(0).toUpperCase() + foodKey.slice(1),
    caloriesPer100g: calsPer100g,
    suggestedPortionGrams: recommendedPortionGrams,
    estimatedCalories,
    remainingBefore: remaining,
    remainingAfter: remainingAfterPortion,
    canFitInDiet: remaining >= estimatedCalories && estimatedCalories > 0,
  };
}
