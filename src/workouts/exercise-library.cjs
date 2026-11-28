const fs = require('node:fs');
const path = require('node:path');
const { getSourceInventory } = require('./gym-workout-program.cjs');
const exerciseContent = require('./gym-exercise-content.cjs');

const imageDirectory = path.resolve(__dirname, 'exercise-images');
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
];

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

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMetadataValue(exercise, field) {
  if (field === 'secondaryMuscles') return Array.isArray(exercise[field]);
  return hasValue(exercise[field]);
}

function getReviewAssetPath(exercise) {
  const assetPath = path.resolve(imageDirectory, exercise.imageAssetPath || `${exercise.imageAssetId}.svg`);
  return assetPath.startsWith(`${imageDirectory}${path.sep}`) ? assetPath : null;
}

function getAssetPath(exercise) {
  const assetPath = getReviewAssetPath(exercise);
  if (!assetPath) return null;
  const relativePath = path.relative(imageDirectory, assetPath);
  return relativePath.startsWith(`approved${path.sep}`) ? assetPath : null;
}

function isExercisePublishable(exercise) {
  const metadataComplete = requiredMetadataFields.every((field) => hasMetadataValue(exercise, field));
  const assetPath = getAssetPath(exercise);
  return metadataComplete
    && exercise.imageStatus === 'verified'
    && exercise.metadataStatus === 'verified'
    && exercise.imageReviewStatus === 'approved'
    && exercise.metadataReviewStatus === 'approved'
    && hasValue(exercise.imageUrl)
    && hasValue(exercise.imageSource)
    && hasValue(exercise.imageLicense)
    && assetPath !== null
    && fs.existsSync(assetPath);
}

function getExerciseCatalog(environment) {
  if (environment && String(environment).trim().toLowerCase() !== 'gym') return [];
  return exerciseContent
    .filter(isExercisePublishable)
    .map((exercise) => ({ ...exercise }));
}

function enrichWorkoutPlan(workout = null, weeklyWorkout = null) {
  return {
    workout: workout || null,
    weeklyWorkout: weeklyWorkout || null,
  };
}

function getExerciseAsset(id) {
  const exercise = getExerciseCatalog('Gym').find((entry) => entry.id === id);
  if (!exercise) return null;
  return getAssetPath(exercise);
}

function getExerciseAvailability() {
  const inventory = getSourceInventory();
  const recordsById = new Map(exerciseContent.map((exercise) => [exercise.id, exercise]));
  const unavailableExercises = inventory.map((source) => {
    const record = recordsById.get(source.id);
    const imageAssetId = record?.imageAssetId || source.imageAssetId;
    const draftAssetPath = path.resolve(imageDirectory, 'drafts', `${imageAssetId}.svg`);
    const assetPath = record
      ? getReviewAssetPath(record)
      : (draftAssetPath.startsWith(`${path.resolve(imageDirectory, 'drafts')}${path.sep}`) ? draftAssetPath : null);
    const imageFilePresent = assetPath !== null && fs.existsSync(assetPath);
    const missingMetadataFields = requiredMetadataFields.filter(
      (field) => !hasMetadataValue(record || {}, field),
    );
    const missingRequirements = [
      ...(!record ? ['metadata_record'] : []),
      ...missingMetadataFields.map((field) => `metadata:${field}`),
      ...(!imageFilePresent ? ['canonical_image_file'] : []),
      ...(!hasValue(record?.imageUrl) ? ['image_url'] : []),
      ...(!hasValue(record?.imageSource) ? ['image_source'] : []),
      ...(!hasValue(record?.imageLicense) ? ['image_license'] : []),
      ...(record?.imageReviewStatus !== 'approved' ? ['visual_image_review'] : []),
      ...(record?.metadataReviewStatus !== 'approved' ? ['professional_metadata_review'] : []),
    ];
    return {
      id: source.id,
      name: source.resolvedName,
      sourceName: source.name,
      day: source.day,
      imageAssetId,
      imageAssetPath: record?.imageAssetPath || `drafts/${imageAssetId}.svg`,
      imageFilePresent,
      imageStatus: record?.imageStatus || 'pending_review',
      metadataStatus: record?.metadataStatus || 'pending_review',
      imageReviewStatus: record?.imageReviewStatus || 'pending_visual_review',
      metadataReviewStatus: record?.metadataReviewStatus || 'pending_professional_review',
      imageSource: record?.imageSource || null,
      imageLicense: record?.imageLicense || null,
      imageUrl: record?.imageUrl || null,
      missingMetadataFields,
      missingRequirements,
    };
  });
  const approvedCatalog = getExerciseCatalog('Gym');
  return {
    sourceCount: inventory.length,
    availableCount: approvedCatalog.length,
    imageFilesPresent: unavailableExercises.filter((exercise) => exercise.imageFilePresent).length,
    approvedImageCount: approvedCatalog.filter((exercise) => exercise.imageReviewStatus === 'approved').length,
    approvedMetadataCount: approvedCatalog.filter((exercise) => exercise.metadataReviewStatus === 'approved').length,
    unavailableExercises,
  };
}

module.exports = {
  ExerciseImageValidationError,
  enrichWorkoutPlan,
  getExerciseAsset,
  getExerciseAvailability,
  getExerciseCatalog,
};
