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
  return [];
}

function enrichWorkoutPlan(workout = null, weeklyWorkout = null) {
  return {
    workout: workout ? { ...workout, exercises: [] } : null,
    weeklyWorkout: weeklyWorkout ? { ...weeklyWorkout, sessions: [] } : null,
  };
}

function getExerciseAsset() {
  return null;
}

module.exports = {
  ExerciseImageValidationError,
  enrichWorkoutPlan,
  getExerciseAsset,
  getExerciseCatalog,
};
