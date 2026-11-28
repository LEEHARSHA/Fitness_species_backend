const fs = require('node:fs');
const path = require('node:path');
const { getSourceInventory } = require('./gym-workout-program.cjs');
const exerciseContent = require('./gym-exercise-content.cjs');

const imageDirectory = path.resolve(__dirname, 'exercise-images');
const approvedImageDirectory = path.resolve(imageDirectory, 'approved');
const requiredMetadataFields = [
  'targetMuscles',
  'secondaryMuscles',
  'equipmentRequired',
  'difficulty',
  'movementPattern',
  'startingPosition',
  'executionSteps',
  'commonMistakes',
  'safetyNotes',
  'restInterval',
  'resistanceType',
  'breathing',
];

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMetadataValue(exercise, field) {
  if (field === 'secondaryMuscles' || field === 'commonMistakes') {
    return Array.isArray(exercise[field]);
  }
  return hasValue(exercise[field]);
}

function getApprovedAssetPath(id) {
  if (!/^[a-z0-9-]{1,100}$/.test(id)) return null;
  const assetPath = path.resolve(approvedImageDirectory, `${id}.svg`);
  if (!assetPath.startsWith(`${approvedImageDirectory}${path.sep}`)) return null;
  return fs.existsSync(assetPath) ? assetPath : null;
}

function getExerciseCatalog(environment) {
  if (environment && String(environment).trim().toLowerCase() !== 'gym') return [];
  return exerciseContent
    .filter((exercise) => requiredMetadataFields.every((field) => hasMetadataValue(exercise, field)))
    .map((exercise) => {
      const { imageAssetPath, ...exerciseDetails } = exercise;
      const imageAvailable = getApprovedAssetPath(exercise.id) !== null;
      return {
        ...exerciseDetails,
        imageAssetPath: imageAvailable ? `approved/${exercise.id}.svg` : null,
        imageUrl: imageAvailable ? `/api/workouts/exercise-images/${exercise.id}` : null,
        imageAvailable,
      };
    });
}

function enrichWorkoutPlan(workout = null, weeklyWorkout = null) {
  return {
    workout: workout || null,
    weeklyWorkout: weeklyWorkout || null,
  };
}

function getExerciseAsset(id) {
  return getApprovedAssetPath(id);
}

function getExerciseAvailability() {
  const inventory = getSourceInventory();
  const catalog = getExerciseCatalog('Gym');
  const recordsById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const unavailableExercises = inventory.map((source) => {
    const record = recordsById.get(source.id);
    const missingMetadataFields = requiredMetadataFields.filter(
      (field) => !hasMetadataValue(record || {}, field),
    );
    const imageAvailable = record?.imageAvailable === true;
    return {
      id: source.id,
      name: source.name,
      day: source.day,
      imageAvailable,
      imageUrl: record?.imageUrl || null,
      missingMetadataFields,
    };
  });

  return {
    sourceCount: inventory.length,
    availableCount: catalog.length,
    imageFilesPresent: unavailableExercises.filter((exercise) => exercise.imageAvailable).length,
    unavailableExercises: unavailableExercises.filter((exercise) => exercise.missingMetadataFields.length > 0),
  };
}

module.exports = {
  enrichWorkoutPlan,
  getExerciseAsset,
  getExerciseAvailability,
  getExerciseCatalog,
};
