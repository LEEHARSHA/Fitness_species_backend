const schedule = [
  {
    day: 'Monday',
    focus: 'Chest + Triceps — Heavy Press Focus',
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
    focus: 'Back + Biceps — Rowing and Width Focus',
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
    focus: 'Legs + Shoulders — Quad and Deltoid Focus',
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
    focus: 'Chest + Triceps — Isolation Focus',
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
    focus: 'Back + Biceps — Cable and Stretch Focus',
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
    focus: 'Legs + Shoulders — Posterior Chain and Rear Deltoid Focus',
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
    imageStatus: 'unverified',
    metadataStatus: 'unverified',
    imageUrl: null,
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

function isExercisePublishable(exercise) {
  if (!exercise) return false;
  return Boolean(exercise.id) && Boolean(exercise.name) && Boolean(exercise.imageUrl);
}

function generateGymWeeklyPlan(profile, history = [], catalog = []) {
  const exerciseContent = require('./gym-exercise-content.cjs');
  const contentById = new Map(exerciseContent.map((entry) => [entry.id, entry]));

  const catalogById = new Map((Array.isArray(catalog) ? catalog : [])
    .filter((entry) => entry
      && entry.id
      && entry.imageStatus === 'verified'
      && entry.metadataStatus === 'verified'
      && entry.imageReviewStatus === 'approved'
      && entry.metadataReviewStatus === 'approved')
    .map((entry) => [entry.id, entry]));

  if (catalogById.size === 0) {
    return {
      error: {
        code: 'WORKOUT_CONTENT_UNVERIFIED',
        message: 'The 42-entry Gym program is recorded, but no exercise currently has both verified metadata and an approved instructional image.',
      },
    };
  }

  const experience = (profile?.trainingExperience || profile?.gymLiftingExperience || 'Intermediate').trim();
  const goal = (profile?.fitnessGoal || 'Body Recomposition').trim();
  const energy = (profile?.energyLevel || 'Medium').trim();
  const isBeginner = /beginner/i.test(experience);
  const healthConditions = Array.isArray(profile?.healthConditions) ? profile.healthConditions : [];
  const injuries = Array.isArray(profile?.injuries) ? profile.injuries : [];
  const hasNoneConditions = healthConditions.length === 0
    || (healthConditions.length === 1 && healthConditions[0] === 'None');
  const hasNoneInjuries = injuries.length === 0
    || (injuries.length === 1 && injuries[0] === 'None');
  const needsSafetyScreening = !hasNoneConditions || !hasNoneInjuries;

  // Goal-based adjustments
  const goalAdjustments = {
    Bulking: { setsModifier: 0, restModifier: 30, focusNote: 'Prioritize progressive overload and recovery.' },
    Cutting: { setsModifier: 0, restModifier: -15, focusNote: 'Maintain strength training intensity; manage fatigue.' },
    'Body Recomposition': { setsModifier: 0, restModifier: 0, focusNote: 'Balance strength progression with conditioning.' },
    Recomposition: { setsModifier: 0, restModifier: 0, focusNote: 'Balance strength progression with conditioning.' },
    'Being Fit': { setsModifier: -1, restModifier: -15, focusNote: 'Focus on general fitness and sustainable consistency.' },
  };
  const goalConfig = goalAdjustments[goal] || goalAdjustments['Body Recomposition'];

  const trainingDays = Number.isInteger(profile?.trainingDays)
    ? Math.max(1, Math.min(6, profile.trainingDays))
    : 6;
  const beginnerTrainingDays = new Set([0, 2, 4].slice(0, Math.min(trainingDays, 3)));

  // Exercises a beginner should avoid or substitute
  const beginnerExclude = new Set([
    'chest-dips', 'triceps-dips', 'deadlift',
  ]);

  // Exercises requiring safety screening if conditions/injuries present
  const conditionSensitive = new Set([
    'barbell-back-squat', 'deadlift', 'barbell-bench-press',
    'decline-bench-press', 'barbell-bent-over-row',
  ]);

  function parseRestSeconds(restStr) {
    const match = String(restStr || '90').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 90;
  }

  function formatRest(seconds) {
    return seconds >= 120 ? `${Math.round(seconds / 60)} min` : `${seconds}s`;
  }

  // Determine how many exercises per day a beginner should do
  const beginnerMaxExercises = 4;

  const sessions = schedule.map((sourceDay, dayIndex) => {
    if (dayIndex === 6) {
      return {
        name: 'Sunday: Rest or Active Recovery',
        split: 'Rest or Active Recovery',
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes: 'Scheduled recovery day.',
      };
    }

    if (isBeginner && !beginnerTrainingDays.has(dayIndex)) {
      return {
        name: `${sourceDay.day}: Rest or Active Recovery`,
        split: 'Rest or Active Recovery',
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes: 'Scheduled recovery day for beginner volume management.',
      };
    }

    let sourceExercises = sourceInventory.filter((exercise) => exercise.dayIndex === dayIndex);
    sourceExercises = sourceExercises.filter((exercise) => catalogById.has(exercise.id));

    // Filter for beginner
    if (isBeginner) {
      sourceExercises = sourceExercises.filter((ex) => !beginnerExclude.has(ex.id));
      sourceExercises = sourceExercises.slice(0, beginnerMaxExercises);
    }

    const exercises = sourceExercises.map((source) => {
      const content = contentById.get(source.id);
      const baseSets = source.sourceSets || 3;
      const adjustedSets = Math.max(1, baseSets + goalConfig.setsModifier + (isBeginner ? -1 : 0));
      const baseRestSec = content ? parseRestSeconds(content.restInterval) : 90;
      const adjustedRest = Math.max(30, baseRestSec + goalConfig.restModifier);

      const loggedExercise = history.find((session) => (
        (session.exercises || []).some((exercise) => {
          const name = String(exercise.exerciseName || exercise.name || '').toLowerCase();
          return name.includes(source.name.toLowerCase())
            || name.includes(source.id.replace(/-/g, ' '))
            || source.name.toLowerCase().includes(name);
        })
      ));
      const loggedWeightEntry = loggedExercise
        ? (loggedExercise.exercises || []).find((exercise) => {
          const name = String(exercise.exerciseName || exercise.name || '').toLowerCase();
          return name.includes(source.name.toLowerCase())
            || name.includes(source.id.replace(/-/g, ' '))
            || source.name.toLowerCase().includes(name);
        })
        : null;
      const loggedWeight = loggedWeightEntry?.weight
        && loggedWeightEntry.weight !== 'Starting weight: Not set'
        ? loggedWeightEntry.weight
        : 'Starting weight: Not set';

      const requiresScreening = needsSafetyScreening && conditionSensitive.has(source.id);
      const safetyNote = requiresScreening
        ? 'This exercise may require professional guidance based on your health profile. Consult a qualified professional before attempting.'
        : (content?.safetyNotes || 'Focus on strict form and controlled contraction.');

      return {
        name: source.name,
        exerciseId: source.id,
        imageUrl: `api/workouts/exercise-images/${source.id}`,
        sets: String(adjustedSets),
        reps: String(source.sourceReps || '10-12'),
        weight: loggedWeight,
        rest: formatRest(adjustedRest),
        notes: safetyNote,
        targetMuscles: content?.targetMuscles || [],
        secondaryMuscles: content?.secondaryMuscles || [],
        equipmentRequired: content?.equipmentRequired || [],
        exerciseDifficulty: content?.difficulty || '',
        movementPattern: content?.movementPattern || '',
        startingPosition: content?.startingPosition || '',
        executionSteps: content?.executionSteps || [],
        commonMistakes: content?.commonMistakes || [],
        safetyNotes: content?.safetyNotes || '',
        restInterval: content?.restInterval || '90s',
        resistanceType: content?.resistanceType || '',
      };
    });

    const durationMinutes = Math.max(20, exercises.length * (isBeginner ? 8 : 7));

    return {
      name: `${sourceDay.day}: ${sourceDay.focus}`,
      split: sourceDay.focus,
      exercises,
      duration: `${durationMinutes} min`,
      calories: isBeginner ? 240 : 320,
      difficulty: experience,
      notes: `Day ${dayIndex + 1}: ${goalConfig.focusNote}`,
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
