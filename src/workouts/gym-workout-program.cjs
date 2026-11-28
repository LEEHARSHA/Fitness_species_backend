const schedule = [
  {
    day: 'Monday',
    focus: 'Chest + Triceps',
    exercises: [
      ['Barbell Bench Press', 3, '8–12'],
      ['Incline Dumbbell Press', 3, '10–12'],
      ['Flat Dumbbell Press', 3, '10–12'],
      ['Cable Chest Fly', 3, '12–15'],
      ['Rope Pushdown', 3, '12–15'],
      ['Skull Crushers', 3, '10–12'],
      ['Close-Grip Bench Press', 3, '8–12'],
    ],
  },
  {
    day: 'Tuesday',
    focus: 'Back + Biceps',
    exercises: [
      ['Deadlift', 3, '5–8'],
      ['Lat Pulldown', 3, '10–12'],
      ['Seated Cable Row', 3, '10–12'],
      ['One-Arm Dumbbell Row', 3, '10–12'],
      ['Barbell Curl', 3, '10–12'],
      ['Dumbbell Biceps Curl', 3, '10–12'],
      ['Hammer Curl', 3, '10–12'],
    ],
  },
  {
    day: 'Wednesday',
    focus: 'Legs + Shoulders',
    exercises: [
      ['Barbell Squat', 3, '8–12'],
      ['Leg Press', 3, '10–12'],
      ['Leg Extension', 3, '12–15'],
      ['Romanian Deadlift', 3, '8–12'],
      ['Dumbbell Shoulder Press', 3, '10–12'],
      ['Dumbbell Lateral Raises', 3, '12–15'],
      ['Front Raises', 3, '12–15'],
    ],
  },
  {
    day: 'Thursday',
    focus: 'Chest + Triceps — Different variations',
    exercises: [
      ['Decline Bench Press', 3, '8–12'],
      ['Pec Deck Fly', 3, '12–15'],
      ['Chest Dips', 3, '8–12'],
      ['Push-ups', 3, '10–15'],
      ['Overhead Triceps Extension', 3, '10–12'],
      ['Triceps Dips', 3, '8–12'],
      ['Bench Dips', 3, '10–12'],
    ],
  },
  {
    day: 'Friday',
    focus: 'Back + Biceps — Different variations',
    exercises: [
      ['Barbell Bent-Over Row', 3, '8–12'],
      ['T-Bar Row', 3, '8–12'],
      ['Pull-ups', 3, '6–12'],
      ['Straight-Arm Pulldown', 3, '12–15'],
      ['Preacher Curl', 3, '10–12'],
      ['Concentration Curl', 3, '12–15'],
      ['Incline Dumbbell Curl', 3, '10–12'],
    ],
  },
  {
    day: 'Saturday',
    focus: 'Legs + Shoulders — Different variations',
    exercises: [
      ['Hack Squat', 3, '10–12'],
      ['Walking Lunges', 3, '10 each side'],
      ['Bulgarian Split Squat', 3, '10 each side'],
      ['Lying Leg Curl', 3, '12–15'],
      ['Seated Leg Curl', 3, '12–15'],
      ['Hip Thrust', 3, '10–12'],
      ['Standing Calf Raise', 3, '15–20'],
    ],
  },
  {
    day: 'Sunday',
    focus: 'Rest or Active Recovery',
    exercises: [],
  },
];

const canonicalIds = {
  'Barbell Bench Press': 'barbell-bench-press',
  'Incline Dumbbell Press': 'incline-dumbbell-press',
  'Flat Dumbbell Press': 'flat-dumbbell-press',
  'Cable Chest Fly': 'cable-chest-fly',
  'Rope Pushdown': 'rope-pushdown',
  'Skull Crushers': 'skull-crushers',
  'Close-Grip Bench Press': 'close-grip-bench-press',
  'Deadlift': 'deadlift',
  'Lat Pulldown': 'lat-pulldown',
  'Seated Cable Row': 'seated-cable-row',
  'One-Arm Dumbbell Row': 'one-arm-dumbbell-row',
  'Barbell Curl': 'barbell-curl',
  'Dumbbell Biceps Curl': 'dumbbell-biceps-curl',
  'Hammer Curl': 'hammer-curl',
  'Barbell Squat': 'barbell-back-squat',
  'Leg Press': 'leg-press',
  'Leg Extension': 'leg-extension',
  'Romanian Deadlift': 'romanian-deadlift',
  'Dumbbell Shoulder Press': 'dumbbell-shoulder-press',
  'Dumbbell Lateral Raises': 'dumbbell-lateral-raises',
  'Front Raises': 'front-raises',
  'Decline Bench Press': 'decline-bench-press',
  'Pec Deck Fly': 'pec-deck-fly',
  'Chest Dips': 'chest-dips',
  'Push-ups': 'push-up',
  'Overhead Triceps Extension': 'overhead-triceps-extension',
  'Triceps Dips': 'triceps-dips',
  'Bench Dips': 'bench-dips',
  'Barbell Bent-Over Row': 'barbell-bent-over-row',
  'T-Bar Row': 't-bar-row',
  'Pull-ups': 'pull-up',
  'Straight-Arm Pulldown': 'straight-arm-pulldown',
  'Preacher Curl': 'preacher-curl',
  'Concentration Curl': 'concentration-curl',
  'Incline Dumbbell Curl': 'incline-dumbbell-curl',
  'Hack Squat': 'hack-squat',
  'Walking Lunges': 'walking-lunges',
  'Bulgarian Split Squat': 'bulgarian-split-squat',
  'Lying Leg Curl': 'lying-leg-curl',
  'Seated Leg Curl': 'seated-leg-curl',
  'Hip Thrust': 'hip-thrust',
  'Standing Calf Raise': 'standing-calf-raise',
};

function canonicalId(name) {
  return canonicalIds[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const sourceInventory = schedule.flatMap((session, dayIndex) =>
  session.exercises.map(([name, sets, reps], exerciseIndex) => ({
    id: canonicalId(name),
    imageAssetId: canonicalId(name),
    name,
    day: session.day,
    dayIndex,
    focus: session.focus,
    sourceOrder: exerciseIndex + 1,
    sourceSets: sets,
    sourceReps: reps,
  })),
);

function getProgramSchedule() {
  return schedule.map((session) => ({
    day: session.day,
    focus: session.focus,
    exerciseCount: session.exercises.length,
  }));
}

function getSourceInventory() {
  return sourceInventory.map((exercise) => ({ ...exercise }));
}

function generateGymWeeklyPlan(profile, history = [], catalog = []) {
  const { buildExerciseSafetyNotes, evaluateWorkoutSafety, isExerciseEligible } = require('./workout-safety.cjs');
  const safety = evaluateWorkoutSafety(profile);
  if (safety.state !== 'ready') {
    return { plan: null, safety };
  }

  if (!catalog || catalog.length === 0) {
    const { getExerciseCatalog } = require('./exercise-library.cjs');
    catalog = getExerciseCatalog('Gym');
  }

  const catalogById = new Map(
    catalog.map((exercise) => [exercise.id, exercise])
  );

  const experience = (profile?.trainingExperience || profile?.gymLiftingExperience || 'Beginner').trim();
  const energy = (profile?.energyLevel || 'Medium').trim();
  const isBeginner = /beginner/i.test(experience);
  const isLowEnergy = /low/i.test(energy);
  const requestedDays = Number.isInteger(profile?.trainingDays) && profile.trainingDays > 0
    ? Math.min(profile.trainingDays, 6)
    : 3;
  const hasActiveInjury = safety.disclosedInjuries.length > 0
    && !/historical|resolved|past/i.test(String(profile?.injuryStatus || ''));
  const needsConservativeFrequency = safety.disclosedConditions.some(
    (condition) => /heart disease|cardiac|recent surgery|pregnan|stroke/i.test(condition),
  );
  const medicallyRestricted = safety.restrictions.length > 0 || hasActiveInjury || needsConservativeFrequency;
  let trainingDays = Math.min(requestedDays, isBeginner || medicallyRestricted ? 3 : 6);
  if (isLowEnergy) trainingDays = Math.min(trainingDays, 2);

  const daySelections = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };
  const activeDayIndexes = new Set(daySelections[trainingDays] || daySelections[3]);
  const sourceById = new Map(sourceInventory.map((exercise) => [exercise.id, exercise]));
  const fullBodyTemplates = {
    0: [
      ['barbell-bench-press', 'flat-dumbbell-press', 'push-up'],
      ['lat-pulldown', 'seated-cable-row', 'one-arm-dumbbell-row'],
      ['leg-press', 'leg-extension', 'hip-thrust', 'lying-leg-curl'],
      ['dumbbell-lateral-raises', 'dumbbell-shoulder-press', 'front-raises'],
    ],
    3: [
      ['incline-dumbbell-press', 'pec-deck-fly', 'decline-bench-press', 'push-up'],
      ['seated-cable-row', 'straight-arm-pulldown', 'one-arm-dumbbell-row', 'lat-pulldown'],
      ['hip-thrust', 'seated-leg-curl', 'lying-leg-curl', 'leg-press'],
      ['front-raises', 'dumbbell-lateral-raises', 'dumbbell-shoulder-press'],
    ],
  };
  const activeEquipment = Array.isArray(profile?.availableEquipment)
    ? profile.availableEquipment.map((item) => String(item).toLowerCase())
    : [];
  const unrestrictedEquipment = activeEquipment.length === 0
    || activeEquipment.some((item) => /suitable gym equipment|full gym|all equipment|gym equipment available/.test(item));

  function hasRequiredEquipment(content) {
    if (unrestrictedEquipment) return true;
    const required = content?.equipmentRequired || [];
    if (required.length === 0 || required.every((item) => /^(none|bodyweight)$/i.test(item))) return true;
    return required.every((item) => {
      const requiredItem = item.toLowerCase();
      return activeEquipment.some((available) => (
        available === requiredItem
        || available.includes(requiredItem)
        || requiredItem.includes(available)
        || (/bench/.test(available) && /bench/.test(requiredItem))
      ));
    });
  }

  function previousUserWeight(exerciseName) {
    for (const session of history) {
      const previous = (session.exercises || []).find((item) => (
        (item.exerciseName || item.name) === exerciseName
        && typeof item.weight === 'string'
        && item.weight.trim()
      ));
      if (previous) return previous.weight.trim();
    }
    return '';
  }

  const sessions = schedule.map((sourceDay, dayIndex) => {
    if (dayIndex === 6 || !activeDayIndexes.has(dayIndex)) {
      return {
        name: `${sourceDay.day}: Rest or Active Recovery`,
        split: trainingDays <= 2 ? 'Rest or Active Recovery' : sourceDay.focus,
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes: 'Recovery day based on the saved training frequency.',
      };
    }

    const maxExercises = isLowEnergy ? 3 : isBeginner ? 4 : 5;
    const isFullBody = trainingDays <= 2;
    const sourceExercises = isFullBody
      ? (fullBodyTemplates[dayIndex] || [])
        .map((group) => group
          .map((id) => sourceById.get(id))
          .find((exercise) => {
            if (!exercise) return false;
            const content = catalogById.get(exercise.id);
            return content && isExerciseEligible(content, safety.restrictions)
              && hasRequiredEquipment(content);
          }))
        .filter(Boolean)
        .slice(0, maxExercises)
      : sourceInventory
        .filter((exercise) => exercise.dayIndex === dayIndex)
        .filter((exercise) => {
          const content = catalogById.get(exercise.id);
          return content && isExerciseEligible(content, safety.restrictions)
            && hasRequiredEquipment(content);
        })
        .slice(0, maxExercises);

    const exercises = sourceExercises.map((source) => {
      const content = catalogById.get(source.id);
      const sets = isLowEnergy || isBeginner ? '2' : '3';
      const reps = isBeginner ? '8-12' : String(source.sourceReps || '8-12');
      const goal = String(profile?.fitnessGoal || '');
      const defaultRest = /bulking/i.test(goal) ? '120s' : /cutting|being fit/i.test(goal) ? '75s' : '90s';
      const rest = content?.restInterval || defaultRest;
      const safetyNotes = buildExerciseSafetyNotes(content, safety);

      return {
        name: source.name,
        exerciseId: source.id,
        imageUrl: content?.imageUrl || null,
        sets,
        reps,
        weight: previousUserWeight(source.name),
        rest,
        notes: safetyNotes,
        targetMuscles: content?.targetMuscles || [content?.targetMuscle || 'Full Body'],
        secondaryMuscles: content?.secondaryMuscles || [],
        equipmentRequired: content?.equipmentRequired || ['None'],
        exerciseDifficulty: content?.difficulty || experience,
        movementPattern: content?.movementPattern || 'Compound',
        startingPosition: content?.startingPosition || 'Standard starting stance',
        executionSteps: content?.executionSteps || [],
        commonMistakes: content?.commonMistakes || [],
        safetyNotes,
        alternatives: content?.alternatives || [],
      };
    });

    const focus = trainingDays <= 2
      ? `Full Body ${dayIndex === 0 ? 'A' : 'B'}`
      : sourceDay.focus;
    return {
      name: `${sourceDay.day}: ${focus}`,
      split: focus,
      exercises,
      duration: `${Math.max(20, exercises.length * 7)} min`,
      calories: isBeginner ? 280 : 380,
      difficulty: experience,
      notes: `Day ${dayIndex + 1}: ${focus}`,
    };
  });

  if (!sessions.some((session) => session.exercises.length > 0)) {
    return {
      plan: null,
      safety: {
        state: 'no_suitable_exercises',
        code: 'NO_SUITABLE_EXERCISES',
        message: 'The available Gym catalog has no exercises compatible with the saved equipment and movement restrictions.',
        requiredScreening: [],
        restrictions: safety.restrictions,
      },
    };
  }

  return {
    plan: {
      weekNumber: 1,
      sessions,
      generatedDate: Date.now(),
    },
    safety,
  };
}

module.exports = {
  generateGymWeeklyPlan,
  getProgramSchedule,
  getSourceInventory,
};
