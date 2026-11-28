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
  if (!catalog || catalog.length === 0) {
    const { getExerciseCatalog } = require('./exercise-library.cjs');
    catalog = getExerciseCatalog('Gym');
  }

  const catalogById = new Map(
    catalog.map((exercise) => [exercise.id, exercise])
  );
  const recentPerformanceByName = new Map();
  for (const session of history || []) {
    for (const result of session.exercises || []) {
      const name = String(result.exerciseName || '').trim().toLowerCase();
      const weight = String(result.weight || '').trim();
      if (
        name
        && weight
        && !/^(not set|starting weight: not set|weight not set)$/i.test(weight)
        && !recentPerformanceByName.has(name)
      ) {
        recentPerformanceByName.set(name, weight);
      }
    }
  }

  const experience = (profile?.trainingExperience || profile?.gymLiftingExperience || 'Beginner').trim();
  const goal = (profile?.fitnessGoal || 'Body Recomposition').trim();
  const energy = (profile?.energyLevel || 'Medium').trim();
  const isBeginner = /beginner/i.test(experience);
  const isLowEnergy = /low/i.test(energy);
  const requestedTrainingDays = Number(profile?.trainingDays) || (isBeginner ? 3 : 6);
  const trainingDays = Math.min(6, Math.max(1, isBeginner ? Math.min(requestedTrainingDays, 3) : requestedTrainingDays));
  const fullBodyBeginnerDays = [
    ['barbell-bench-press', 'lat-pulldown', 'barbell-back-squat', 'romanian-deadlift'],
    ['incline-dumbbell-press', 'seated-cable-row', 'leg-press', 'dumbbell-shoulder-press'],
    ['flat-dumbbell-press', 'one-arm-dumbbell-row', 'walking-lunges', 'dumbbell-biceps-curl'],
  ];
  const beginnerSessionDays = [0, 2, 5].slice(0, trainingDays);
  const selectedEquipment = (profile?.availableEquipment || [])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
  const explicitlyNoEquipment = selectedEquipment.some((item) => /^(none|no equipment)$/.test(item));
  const availableEquipment = selectedEquipment.filter((item) => !/^(none|no equipment|not specified)$/.test(item));
  const allGymEquipmentAvailable = !explicitlyNoEquipment && (
    availableEquipment.length === 0
    || availableEquipment.some((item) => /full gym|suitable gym|all gym|gym equipment/.test(item))
  );

  function hasEquipment(exercise) {
    if (allGymEquipmentAvailable) return true;
    if (explicitlyNoEquipment) {
      return (exercise.equipmentRequired || []).every((requirement) =>
        /^(none|.*optional.*)$/i.test(String(requirement).trim()),
      );
    }
    return (exercise.equipmentRequired || []).every((requirement) => {
      const options = String(requirement)
        .replace(/\s*\(optional\)/ig, '')
        .split(/\s+or\s+/i)
        .map((option) => option.trim().toLowerCase())
        .filter((option) => option && option !== 'none');
      if (options.length === 0) return true;
      return options.some((option) =>
        availableEquipment.some((item) => item.includes(option) || option.includes(item)),
      );
    });
  }

  const goalAdjustments = {
    Bulking: { sets: '4', rest: '120s' },
    Cutting: { sets: '3-4', reps: '10-15', rest: '60s' },
    'Body Recomposition': { sets: '3-4', rest: '75s' },
    Recomposition: { sets: '3-4', rest: '75s' },
    'Being Fit': { sets: '3', reps: '10-12', rest: '60s' },
  };
  const goalConfig = goalAdjustments[goal] || goalAdjustments['Body Recomposition'];

  const sessions = schedule.map((sourceDay, dayIndex) => {
    function restSession(notes = 'Scheduled recovery day for optimal progress.') {
      return {
        name: `${sourceDay.day}: Rest or Active Recovery`,
        split: 'Rest or Active Recovery',
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes,
      };
    }
    if (dayIndex === 6) return restSession();

    let sourceExercises = [];
    let sessionFocus = sourceDay.focus;
    if (isBeginner) {
      const beginnerDayIndex = beginnerSessionDays.indexOf(dayIndex);
      if (beginnerDayIndex >= 0) {
        sessionFocus = `Full Body ${String.fromCharCode(65 + beginnerDayIndex)}`;
        const exerciseIds = fullBodyBeginnerDays[beginnerDayIndex];
        sourceExercises = exerciseIds
          .map((id) => sourceInventory.find((exercise) => exercise.id === id))
          .filter(Boolean);
      }
    } else if (dayIndex < trainingDays) {
      sourceExercises = sourceInventory.filter((exercise) => exercise.dayIndex === dayIndex);
    }

    sourceExercises = sourceExercises
      .filter(hasEquipment)
      .filter((source) => catalogById.has(source.id));
    if (sourceExercises.length === 0) {
      return restSession('Recovery day or no suitable exercise matched the available equipment.');
    }
    if (isLowEnergy) sourceExercises = sourceExercises.slice(0, 4);

    const exercises = sourceExercises.map((source) => {
      const content = catalogById.get(source.id);
      const sets = isBeginner || isLowEnergy
        ? '2'
        : (goalConfig.sets || String(source.sourceSets || 3));
      const reps = isBeginner
        ? '8-12'
        : (goalConfig.reps || String(source.sourceReps || '10-12'));
      const rest = goalConfig.rest || content?.defaultRest || '90s';

      return {
        name: source.name,
        exerciseId: source.id,
        imageUrl: content?.imageUrl || '',
        sets,
        reps,
        weight: recentPerformanceByName.get(source.name.toLowerCase()) || '',
        rest,
        notes: content?.safetyNotes || 'Focus on strict form and controlled contraction.',
        targetMuscles: content?.targetMuscles || [content?.targetMuscle || 'Full Body'],
        secondaryMuscles: content?.secondaryMuscles || [],
        equipmentRequired: content?.equipmentRequired || ['None'],
        exerciseDifficulty: content?.difficulty || experience,
        movementPattern: content?.movementPattern || 'Compound',
        startingPosition: content?.startingPosition || 'Standard starting stance',
        executionSteps: content?.executionSteps || [],
        commonMistakes: content?.commonMistakes || [],
        safetyNotes: content?.safetyNotes || 'Maintain proper form and core engagement.',
      };
    });

    return {
      name: `${sourceDay.day}: ${sessionFocus}`,
      split: sessionFocus,
      exercises,
      duration: `${Math.max(20, exercises.length * 7)} min`,
      calories: 0,
      difficulty: experience,
      notes: `Day ${dayIndex + 1}: ${sessionFocus}`,
    };
  });

  return {
    plan: {
      weekNumber: 1,
      sessions,
      generatedDate: Date.now(),
    },
  };
}

module.exports = {
  generateGymWeeklyPlan,
  getProgramSchedule,
  getSourceInventory,
};
