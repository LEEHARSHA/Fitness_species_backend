const fs = require('node:fs');
const path = require('node:path');

const IMAGE_DIRECTORY = path.join(__dirname, 'exercise-images');
const IMAGE_BASE_URL = '/exercise-images';

const exercises = [
  {
    id: 'barbell-back-squat',
    name: 'Barbell Back Squat',
    aliases: ['barbell squat', 'back squat'],
    environments: ['Gym'],
    instructions: 'Rest the bar across your upper back, brace your trunk, sit between your hips, and keep your knees tracking over your toes. Stop at a depth you can control, then drive through your whole foot to stand.',
    artwork: 'barbell-squat',
  },
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    aliases: ['bench press', 'barbell chest press'],
    environments: ['Gym'],
    instructions: 'Keep your feet planted and shoulder blades gently retracted. Lower the bar under control to your mid-chest with wrists stacked over elbows, then press up without bouncing.',
    artwork: 'bench-press',
  },
  {
    id: 'dumbbell-romanian-deadlift',
    name: 'Dumbbell Romanian Deadlift',
    aliases: ['dumbbell rdl', 'dumbbell romanian deadlift'],
    environments: ['Gym', 'Home Workout'],
    instructions: 'Hold the dumbbells close to your thighs, soften your knees, and push your hips back while keeping a neutral spine. Stop when your hamstrings limit the hinge, then squeeze your glutes to stand.',
    artwork: 'romanian-deadlift',
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    aliases: ['wide grip lat pulldown', 'cable lat pulldown'],
    environments: ['Gym'],
    instructions: 'Sit tall with thighs secured and grip the bar just outside shoulder width. Pull your elbows down toward your sides until the bar reaches your upper chest; return slowly without swinging.',
    artwork: 'lat-pulldown',
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    aliases: ['cable row', 'seated row'],
    environments: ['Gym'],
    instructions: 'Sit upright with knees softly bent and arms extended. Pull the handle toward your lower ribs by driving your elbows back, pause with shoulders down, and extend under control.',
    artwork: 'seated-row',
  },
  {
    id: 'bodyweight-squat',
    name: 'Bodyweight Squat',
    aliases: ['air squat', 'squat'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Stand with feet about shoulder-width apart. Brace, sit your hips down and back while knees track over toes, then press through the whole foot to return to standing.',
    artwork: 'bodyweight-squat',
  },
  {
    id: 'incline-push-up',
    name: 'Incline Push-Up',
    aliases: ['incline pushup', 'elevated push-up', 'hands elevated push-up'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Place hands on a stable elevated surface slightly wider than shoulder width. Keep a straight line from head to heels, lower your chest toward the edge with elbows angled back, then press away.',
    artwork: 'incline-push-up',
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    aliases: ['floor glute bridge', 'hip bridge'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Lie on your back with knees bent and feet flat about hip-width apart. Brace gently, squeeze your glutes, and lift your hips until shoulders, hips, and knees align; lower with control.',
    artwork: 'glute-bridge',
  },
  {
    id: 'reverse-lunge',
    name: 'Reverse Lunge',
    aliases: ['bodyweight reverse lunge', 'alternating reverse lunge'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Stand tall, step one foot back, and lower both knees while keeping the front knee aligned over the foot. Push through the front foot to stand, then alternate sides.',
    artwork: 'reverse-lunge',
  },
  {
    id: 'backpack-row',
    name: 'Backpack Bent-Over Row',
    aliases: ['backpack row', 'bent over backpack row'],
    environments: ['Home Workout'],
    instructions: 'Hold a securely closed, manageable backpack with both hands. Hinge at the hips with a neutral spine, row the pack toward your lower ribs, and lower it without rounding your back.',
    artwork: 'backpack-row',
  },
  {
    id: 'push-up',
    name: 'Standard Push-Up',
    aliases: ['push up', 'pushup', 'standard pushup'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Start in a high plank with hands just wider than shoulders. Keep your body in one line, lower your chest with elbows angled back, then press the floor away to full arm extension.',
    artwork: 'push-up',
  },
  {
    id: 'pull-up',
    name: 'Pull-Up',
    aliases: ['strict pull-up', 'strict pullup'],
    environments: ['Gym', 'Home Workout', 'Calisthenics'],
    instructions: 'Hang from a secure bar with an overhand grip. Set your shoulders down, pull until your chin clears the bar without kicking, then lower to a controlled hang.',
    artwork: 'pull-up',
  },
  {
    id: 'parallel-bar-dip',
    name: 'Parallel Bar Dip',
    aliases: ['triceps dip', 'parallel dip'],
    environments: ['Gym', 'Calisthenics'],
    instructions: 'Support yourself on stable parallel bars with arms straight and shoulders down. Bend your elbows to lower only as far as comfortable, then press back to straight arms without swinging.',
    artwork: 'parallel-bar-dip',
  },
  {
    id: 'inverted-row',
    name: 'Inverted Row',
    aliases: ['bodyweight row', 'horizontal pull-up'],
    environments: ['Gym', 'Calisthenics'],
    instructions: 'Use a securely fixed bar or suspension trainer. Keep your body straight, pull your chest toward your hands by driving elbows back, pause, and lower until arms are extended.',
    artwork: 'inverted-row',
  },
  {
    id: 'forearm-plank',
    name: 'Forearm Plank',
    aliases: ['plank', 'front plank'],
    environments: ['Home Workout', 'Calisthenics'],
    instructions: 'Place elbows under shoulders and extend your legs. Brace your abdomen and glutes so your head, hips, and heels form one line; breathe steadily without letting your lower back sag.',
    artwork: 'forearm-plank',
  },
];

const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const exerciseByName = new Map();
for (const exercise of exercises) {
  for (const name of [exercise.name, ...exercise.aliases]) {
    exerciseByName.set(normalizeExerciseName(name), exercise);
  }
}

function normalizeExerciseName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

class ExerciseImageValidationError extends Error {
  constructor(message, {
    code,
    missingExercises = [],
    unavailableAssets = [],
    unsupportedExercises = [],
  } = {}) {
    super(message);
    this.name = 'ExerciseImageValidationError';
    this.code = code;
    this.missingExercises = missingExercises;
    this.unavailableAssets = unavailableAssets;
    this.unsupportedExercises = unsupportedExercises;
  }
}

function imagePathFor(exercise) {
  return path.join(IMAGE_DIRECTORY, `${exercise.id}.svg`);
}

function imageUrlFor(exercise) {
  return `${IMAGE_BASE_URL}/${exercise.id}.svg`;
}

function exerciseFromInput(value) {
  if (typeof value === 'string') return exerciseByName.get(normalizeExerciseName(value));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = value.exerciseName || value.exercise || value.name || value.title;
  const byName = exerciseByName.get(normalizeExerciseName(name));
  const byId = typeof value.exerciseId === 'string' ? exerciseById.get(value.exerciseId) : null;
  if (byName && byId && byName.id !== byId.id) return null;
  return byName || byId;
}

function normalizeEnvironment(value) {
  const normalized = normalizeExerciseName(value);
  if (normalized === 'home') return 'home workout';
  return normalized;
}

function enrichExercise(value, environment, missing, unavailable, unsupported, counter) {
  const exercise = exerciseFromInput(value);
  const inputName = typeof value === 'string'
    ? value
    : value?.exerciseName || value?.exercise || value?.name || value?.title || value?.exerciseId || 'Unnamed exercise';
  if (!exercise) {
    missing.set(normalizeExerciseName(inputName) || inputName, {
      exerciseName: inputName,
      suggestedExerciseId: `exercise-${normalizeExerciseName(inputName).replace(/\s+/g, '-') || 'unnamed'}`,
      requiredImageAsset: `exercise-${normalizeExerciseName(inputName).replace(/\s+/g, '-') || 'unnamed'}.svg`,
    });
    return value;
  }
  if (!exercise.environments.some((supportedEnvironment) => (
    normalizeEnvironment(supportedEnvironment) === normalizeEnvironment(environment)
  ))) {
    unsupported.set(exercise.id, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      environment,
      supportedEnvironments: exercise.environments,
    });
    return value;
  }
  if (!fs.existsSync(imagePathFor(exercise))) {
    unavailable.set(exercise.id, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      requiredImageAsset: `${exercise.id}.svg`,
    });
    return value;
  }
  counter.count += 1;
  if (typeof value === 'string') {
    return {
      exerciseName: exercise.name,
      exerciseId: exercise.id,
      imageUrl: imageUrlFor(exercise),
      instructions: exercise.instructions,
    };
  }
  return {
    ...value,
    exerciseId: exercise.id,
    imageUrl: imageUrlFor(exercise),
    instructions: exercise.instructions,
  };
}

function isExerciseListKey(key) {
  return /^(exercises?|movements?)$/i.test(key);
}

function enrichPlanNode(value, key, environment, missing, unavailable, unsupported, counter) {
  if (Array.isArray(value)) {
    if (isExerciseListKey(key)) {
      return value.map((exercise) => (
        enrichExercise(exercise, environment, missing, unavailable, unsupported, counter)
      ));
    }
    return value.map((child) => (
      enrichPlanNode(child, key, environment, missing, unavailable, unsupported, counter)
    ));
  }
  if (!value || typeof value !== 'object') return value;
  if (Object.hasOwn(value, 'exerciseName') || Object.hasOwn(value, 'exerciseId')) {
    return enrichExercise(value, environment, missing, unavailable, unsupported, counter);
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      enrichPlanNode(child, childKey, environment, missing, unavailable, unsupported, counter),
    ]),
  );
}

function enrichWorkoutPlan(workout, weeklyWorkout, environment = 'Gym') {
  const missing = new Map();
  const unavailable = new Map();
  const unsupported = new Map();
  const counter = { count: 0 };
  const enrichedWorkout = workout == null
    ? null
    : enrichPlanNode(workout, 'workout', environment, missing, unavailable, unsupported, counter);
  const enrichedWeeklyWorkout = weeklyWorkout == null
    ? null
    : enrichPlanNode(
      weeklyWorkout,
      'weeklyWorkout',
      environment,
      missing,
      unavailable,
      unsupported,
      counter,
    );

  if (missing.size > 0) {
    throw new ExerciseImageValidationError(
      'The plan contains exercises without a verified matching image.',
      { code: 'EXERCISE_IMAGE_REQUIRED', missingExercises: [...missing.values()] },
    );
  }
  if (unavailable.size > 0) {
    throw new ExerciseImageValidationError(
      'A required exercise image asset is unavailable.',
      { code: 'EXERCISE_IMAGE_UNAVAILABLE', unavailableAssets: [...unavailable.values()] },
    );
  }
  if (unsupported.size > 0) {
    throw new ExerciseImageValidationError(
      'The plan contains exercises that do not match its training environment.',
      { code: 'EXERCISE_ENVIRONMENT_UNSUPPORTED', unsupportedExercises: [...unsupported.values()] },
    );
  }
  if (counter.count === 0) {
    throw new ExerciseImageValidationError(
      'The plan must contain at least one exercise in an exercises array.',
      { code: 'EXERCISES_REQUIRED' },
    );
  }
  return { workout: enrichedWorkout, weeklyWorkout: enrichedWeeklyWorkout };
}

function getExerciseCatalog() {
  const unavailableAssets = exercises
    .filter((exercise) => !fs.existsSync(imagePathFor(exercise)))
    .map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      requiredImageAsset: `${exercise.id}.svg`,
    }));
  if (unavailableAssets.length > 0) {
    throw new ExerciseImageValidationError(
      'One or more exercise image assets are unavailable.',
      { code: 'EXERCISE_IMAGE_UNAVAILABLE', unavailableAssets },
    );
  }
  return exercises.map(({ id, name, environments, instructions }) => ({
    id,
    name,
    environments: [...environments],
    imageUrl: imageUrlFor({ id }),
    instructions,
    assetLicense: 'Original Fitness Species instructional artwork',
  }));
}

function getExerciseAsset(id) {
  const exercise = exerciseById.get(id);
  if (!exercise || !fs.existsSync(imagePathFor(exercise))) return null;
  return { exercise, path: imagePathFor(exercise) };
}

module.exports = {
  ExerciseImageValidationError,
  enrichWorkoutPlan,
  getExerciseAsset,
  getExerciseCatalog,
};
