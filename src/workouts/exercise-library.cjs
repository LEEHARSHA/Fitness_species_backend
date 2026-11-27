const { getSourceInventory } = require('./gym-workout-program.cjs');
const fs = require('node:fs');
const path = require('node:path');

class ExerciseImageValidationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ExerciseImageValidationError';
    this.code = options.code || 'WORKOUT_LIBRARY_EMPTY';
    this.missingExercises = options.missingExercises || [];
    this.unavailableAssets = options.unavailableAssets || [];
    this.unsupportedExercises = options.unsupportedExercises || [];
  }
}

function getExerciseCatalog() {
  // The retained SVGs are text-only silhouettes and are not approved instructional assets.
  return [];
}

function enrichWorkoutPlan(workout = null, weeklyWorkout = null) {
  return {
    workout: workout || null,
    weeklyWorkout: weeklyWorkout || null,
  };
}

function getExerciseAsset(id) {
  const exercise = getExerciseCatalog().find((entry) => entry.id === id);
  if (!exercise || !exercise.imageUrl || exercise.imageStatus !== 'verified') return null;
  const assetPath = path.resolve(__dirname, 'exercise-images', `${id}.svg`);
  if (!fs.existsSync(assetPath)) return null;
  return assetPath;
}

function getExerciseAvailability() {
  const inventory = getSourceInventory();
  return {
    sourceCount: inventory.length,
    availableCount: 0,
    unavailableExercises: inventory.map(({ id, name, imageStatus, metadataStatus }) => ({
      id,
      name,
      imageStatus,
      metadataStatus,
    })),
  };
}

module.exports = {
  ExerciseImageValidationError,
  enrichWorkoutPlan,
  getExerciseAvailability,
  getExerciseAsset,
  getExerciseCatalog,
};
