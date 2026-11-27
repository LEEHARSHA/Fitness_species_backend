const schedule = [
  {
    day: 'Monday',
    focus: 'Chest + Triceps — Heavy Press Focus',
    exercises: [
      ['Flat Barbell Bench Press', 4, '6–8'],
      ['Incline Dumbbell Press', 4, '8–10'],
      ['Low-to-High Cable Fly', 3, '12–15'],
      ['Machine Chest Press (Heavy)', 3, '10–12'],
      ['Close-Grip Bench Press', 3, '8–10'],
      ['Weighted Triceps Dips', 3, '10–12'],
      ['Overhead Cable Rope Extension', 3, '12–15'],
    ],
  },
  {
    day: 'Tuesday',
    focus: 'Back + Biceps — Rowing and Width Focus',
    exercises: [
      ['Barbell Bent-Over Rows', 4, '8–10'],
      ['One-Arm Dumbbell Row', 3, '10 each side'],
      ['Wide-Grip Lat Pulldown', 4, '10–12'],
      ['Cable Straight-Arm Pulldown', 3, '12–15'],
      ['Seated Alternating Dumbbell Curls', 3, '12'],
      ['Concentration Curls', 3, '10'],
      ['Cable Rope Curls (Burnout)', 3, '15'],
    ],
  },
  {
    day: 'Wednesday',
    focus: 'Legs + Shoulders — Quad Focus',
    exercises: [
      ['Front Squats', 4, '8–10'],
      ['Leg Press (Low Foot Placement)', 4, '12'],
      ['Dumbbell Walking Lunges', 2, '20 steps'],
      ['Leg Extensions', 3, '15'],
      ['Seated Dumbbell Shoulder Press', 4, '10'],
      ['Cable Lateral Raises (Strict)', 3, '15 each side'],
      ['EZ Bar Upright Rows', 3, '10–12'],
    ],
  },
  {
    day: 'Thursday',
    focus: 'Chest + Triceps — Isolation Focus',
    exercises: [
      ['Incline Machine Press', 3, '12'],
      ['Pec Deck Fly', 3, '15'],
      ['Push-Ups (Feet Elevated / Weighted)', '2–3', 'To failure (source reference)'],
      ['Standing Cable Chest Press', 3, '15'],
      ['EZ Bar Skull Crushers', 3, '10–12'],
      ['Single-Arm Cable Pushdowns', 3, '12'],
      ['Dumbbell Kickbacks', 3, '15'],
    ],
  },
  {
    day: 'Friday',
    focus: 'Back + Biceps — Cable and Stretch Focus',
    exercises: [
      ['Neutral-Grip Pull-Ups', 3, 'To failure (source reference)'],
      ['Cable Seated Rows (Slow Tempo)', 4, '12'],
      ['Chest-Supported T-Bar Rows', 3, '10'],
      ['Behind-the-Back Cable Row', 3, '15'],
      ['Incline Dumbbell Curls', 3, '10'],
      ['Barbell Curls (Strict Form)', 4, '8–10'],
      ['Reverse EZ Bar Curls', 3, '15'],
    ],
  },
  {
    day: 'Saturday',
    focus: 'Legs + Shoulders — Posterior Chain and Rear Delt Focus',
    exercises: [
      ['Romanian Deadlifts (Dumbbell or Barbell)', 4, '10'],
      ['Lying Leg Curls', 3, '15'],
      ['Dumbbell Step-Ups (Glute Focus)', 3, '12'],
      ['Cable Glute Kickbacks', 3, '15'],
      ['Standing Overhead Barbell Press', 3, '8'],
      ['Reverse Pec Deck / Rear Delt Machine', 3, '15–20'],
      ['Dumbbell Lateral Raise Dropset', 3, '15–20–25 (drop set)'],
    ],
  },
  {
    day: 'Sunday',
    focus: 'Rest or Active Recovery',
    exercises: [],
  },
];

const canonicalIds = {
  'Flat Barbell Bench Press': 'barbell-bench-press',
  'Incline Dumbbell Press': 'incline-dumbbell-press',
  'Low-to-High Cable Fly': 'low-to-high-cable-fly',
  'Machine Chest Press (Heavy)': 'machine-chest-press',
  'Close-Grip Bench Press': 'close-grip-bench-press',
  'Weighted Triceps Dips': 'weighted-triceps-dips',
  'Overhead Cable Rope Extension': 'overhead-cable-rope-extension',
  'Barbell Bent-Over Rows': 'barbell-bent-over-row',
  'One-Arm Dumbbell Row': 'one-arm-dumbbell-row',
  'Wide-Grip Lat Pulldown': 'wide-grip-lat-pulldown',
  'Cable Straight-Arm Pulldown': 'cable-straight-arm-pulldown',
  'Seated Alternating Dumbbell Curls': 'seated-alternating-dumbbell-curl',
  'Concentration Curls': 'concentration-curl',
  'Cable Rope Curls (Burnout)': 'cable-rope-curl',
  'Front Squats': 'front-squat',
  'Leg Press (Low Foot Placement)': 'low-foot-leg-press',
  'Dumbbell Walking Lunges': 'dumbbell-walking-lunge',
  'Leg Extensions': 'leg-extension',
  'Seated Dumbbell Shoulder Press': 'seated-dumbbell-shoulder-press',
  'Cable Lateral Raises (Strict)': 'cable-lateral-raise',
  'EZ Bar Upright Rows': 'ez-bar-upright-row',
  'Incline Machine Press': 'incline-machine-press',
  'Pec Deck Fly': 'pec-deck-fly',
  'Push-Ups (Feet Elevated / Weighted)': 'feet-elevated-push-up',
  'Standing Cable Chest Press': 'standing-cable-chest-press',
  'EZ Bar Skull Crushers': 'ez-bar-skull-crusher',
  'Single-Arm Cable Pushdowns': 'single-arm-cable-pushdown',
  'Dumbbell Kickbacks': 'dumbbell-triceps-kickback',
  'Neutral-Grip Pull-Ups': 'neutral-grip-pull-up',
  'Cable Seated Rows (Slow Tempo)': 'cable-seated-row',
  'Chest-Supported T-Bar Rows': 'chest-supported-t-bar-row',
  'Behind-the-Back Cable Row': 'behind-the-back-cable-row',
  'Incline Dumbbell Curls': 'incline-dumbbell-curl',
  'Barbell Curls (Strict Form)': 'barbell-curl',
  'Reverse EZ Bar Curls': 'reverse-ez-bar-curl',
  'Romanian Deadlifts (Dumbbell or Barbell)': 'barbell-romanian-deadlift',
  'Lying Leg Curls': 'lying-leg-curl',
  'Dumbbell Step-Ups (Glute Focus)': 'dumbbell-step-up',
  'Cable Glute Kickbacks': 'cable-glute-kickback',
  'Standing Overhead Barbell Press': 'standing-overhead-barbell-press',
  'Reverse Pec Deck / Rear Delt Machine': 'reverse-pec-deck',
  'Dumbbell Lateral Raise Dropset': 'dumbbell-lateral-raise-dropset',
};

const resolvedExerciseNames = {
  'Push-Ups (Feet Elevated / Weighted)': 'Feet-Elevated Bodyweight Push-Up',
  'Romanian Deadlifts (Dumbbell or Barbell)': 'Barbell Romanian Deadlift',
};

function canonicalId(name) {
  const id = canonicalIds[name];
  if (!id) throw new Error(`Missing canonical exercise ID for "${name}".`);
  return id;
}

const sourceInventory = schedule.flatMap((session, dayIndex) =>
  session.exercises.map(([name, sets, reps], exerciseIndex) => ({
    id: canonicalId(name),
    imageAssetId: canonicalId(name),
    name,
    resolvedName: resolvedExerciseNames[name] || name,
    day: session.day,
    dayIndex,
    focus: session.focus,
    sourceOrder: exerciseIndex + 1,
    sourceSets: sets,
    sourceReps: reps,
    imageStatus: 'unverified',
    metadataStatus: 'unverified',
    imageSource: null,
    assetLicense: null,
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

function getMatchingHistory(history, exerciseName) {
  return history
    .flatMap((session) => session.exercises || [])
    .find((exercise) => exercise.exerciseName?.trim().toLowerCase() === exerciseName.toLowerCase());
}

function isExercisePublishable(exercise) {
  return exercise.imageStatus === 'verified'
    && exercise.metadataStatus === 'verified'
    && exercise.imageReviewStatus === 'approved'
    && exercise.metadataReviewStatus === 'approved'
    && Boolean(exercise.imageUrl)
    && Boolean(exercise.imageLicense)
    && Boolean(exercise.imageSource)
    && Boolean(exercise.targetMuscles?.length)
    && Boolean(exercise.equipmentRequired?.length)
    && Boolean(exercise.difficulty)
    && Boolean(exercise.startingPosition)
    && Boolean(exercise.executionSteps?.length)
    && Boolean(exercise.commonMistakes?.length)
    && Boolean(exercise.safetyNotes);
}

function generateGymWeeklyPlan(profile, history = [], catalog = []) {
  const experience = (profile.trainingExperience || profile.gymLiftingExperience || '').trim().toLowerCase();
  const trainingDays = profile.trainingDays;
  const equipment = (profile.availableEquipment || []).map((item) => item.trim().toLowerCase());
  if (!['beginner', 'intermediate', 'advanced'].includes(experience) || !Number.isInteger(trainingDays) || trainingDays < 1 || equipment.length === 0) {
    return {
      error: {
        code: 'WORKOUT_SETUP_REQUIRED',
        message: 'Select training experience, weekly availability, and available equipment before generating a Gym plan.',
      },
    };
  }

  const hasNoneOnly = (values) => Array.isArray(values) && values.length === 1 && values[0].toLowerCase() === 'none';
  if (
    profile.healthConsent !== true
    || !hasNoneOnly(profile.healthConditions)
    || !hasNoneOnly(profile.injuries)
  ) {
    return {
      error: {
        code: 'PROFESSIONAL_GUIDANCE_REQUIRED',
        message: 'Your saved health or injury screening needs professional review before this program can be assigned.',
      },
    };
  }

  const availableById = new Map(
    catalog.filter(isExercisePublishable).map((exercise) => [exercise.id, exercise]),
  );
  const trainingSlots = experience === 'beginner'
    ? (trainingDays >= 3 ? [0, 2, 4] : [])
    : trainingDays >= 6
      ? [0, 1, 2, 3, 4, 5]
      : trainingDays >= 5
        ? [0, 1, 2, 3, 4]
        : trainingDays >= 4
          ? [0, 1, 2, 4]
          : trainingDays >= 3
            ? [0, 2, 4]
            : [];
  if (trainingSlots.length === 0) {
    return {
      error: {
        code: 'TRAINING_FREQUENCY_UNSUPPORTED',
        message: 'This six-day source split requires at least three available training days.',
      },
    };
  }

  const recoveryLimited = ['low', 'poor', 'fatigued'].includes(
    String(profile.gymRecoveryStatus || '').trim().toLowerCase(),
  );
  const sessions = schedule.map((sourceDay, dayIndex) => {
    if (dayIndex === 6 || !trainingSlots.includes(dayIndex)) {
      return {
        name: sourceDay.day === 'Sunday' ? 'Rest or Active Recovery' : `${sourceDay.day}: Rest`,
        split: sourceDay.focus,
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes: 'Scheduled recovery day.',
      };
    }

    const sourceExercises = sourceInventory.filter((exercise) => exercise.dayIndex === dayIndex);
    const eligible = sourceExercises
      .map((source) => ({ source, exercise: availableById.get(source.id) }))
      .filter(({ exercise }) => exercise)
      .filter(({ source, exercise }) => experience !== 'beginner' || (
        exercise.difficulty.toLowerCase() === 'beginner'
        && !/weighted triceps dips|dropset|drop set/i.test(source.name)
      ))
      .filter(({ exercise }) => (exercise.equipmentRequired || []).every((required) =>
        equipment.some((available) => available === required.toLowerCase() || available.includes(required.toLowerCase())),
      ));
    const targetCount = experience === 'beginner' ? 4 : 6;
    const selected = eligible.slice(0, targetCount);
    const minimumCount = experience === 'beginner' ? 3 : 4;
    if (selected.length < minimumCount) {
      return {
        name: `${sourceDay.day}: Rest`,
        split: sourceDay.focus,
        exercises: [],
        duration: '0 min',
        calories: 0,
        difficulty: experience,
        notes: 'Not enough verified exercises with matching equipment are available for this session.',
      };
    }

    const exercises = selected.map(({ source, exercise }) => {
      const previous = getMatchingHistory(history, exercise.name);
      const referenceSets = Number.parseInt(String(source.sourceSets), 10) || 3;
      const beginnerSets = Math.min(2, referenceSets);
      const sets = experience === 'beginner'
        ? beginnerSets
        : Math.max(1, referenceSets - (recoveryLimited ? 1 : 0));
      const sourceReps = /failure|burnout|dropset|drop set/i.test(source.sourceReps)
        ? (experience === 'beginner' ? '8–12, stop with 2–3 reps in reserve' : '8–15, stop before form breaks')
        : source.sourceReps;
      return {
        ...exercise,
        sets: String(sets),
        reps: sourceReps,
        weight: previous?.weight?.trim() || 'Weight not set',
        rest: exercise.gymProgramming?.[0]?.rest || exercise.rest,
        notes: previous
          ? 'Uses the most recently recorded resistance. No automatic weight increase.'
          : 'Starting resistance not set. Select a manageable load after technique review.',
      };
    });

    return {
      name: `${sourceDay.day}: ${sourceDay.focus}`,
      split: sourceDay.focus,
      exercises,
      duration: `${Math.max(20, exercises.length * 7)} min`,
      calories: 0,
      difficulty: experience,
      notes: recoveryLimited
        ? 'Volume was reduced based on the saved recovery status.'
        : 'Reference sets and repetitions are adapted to the saved experience level.',
    };
  });

  const trainingSessionCount = sessions.filter((session) => session.exercises.length > 0).length;
  if (trainingSessionCount < Math.min(trainingSlots.length, 3)) {
    return {
      error: {
        code: 'WORKOUT_CONTENT_UNVERIFIED',
        message: 'There are not enough verified exercises with matching equipment to publish a safe weekly plan.',
      },
    };
  }

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
