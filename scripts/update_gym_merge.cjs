const fs = require('fs');
const path = require('path');
const { exercisesPart1 } = require('./update_gym_1.cjs');
const { exercisesPart2 } = require('./update_gym_2.cjs');
const { exercisesPart3 } = require('./update_gym_3.cjs');
const { exercisesPart4 } = require('./update_gym_4.cjs');

const allExercises = [
  ...exercisesPart1,
  ...exercisesPart2,
  ...exercisesPart3,
  ...exercisesPart4
];

const libraryPath = path.join(__dirname, '../src/workouts/exercise-library.cjs');
const imagesPath = path.join(__dirname, '../src/workouts/exercise-images');

if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
}

let libraryContent = fs.readFileSync(libraryPath, 'utf8');
const beforeExercises = libraryContent.substring(0, libraryContent.indexOf('const exercises = ['));
const afterExercisesMatch = libraryContent.substring(libraryContent.indexOf('];\n\nconst exerciseById ='));
const afterExercises = afterExercisesMatch.substring(afterExercisesMatch.indexOf('const exerciseById ='));

// Format exercises array
const newExercisesStr = 'const exercises = [\n' + allExercises.map(ex => {
  return `  {
    id: '${ex.id}',
    name: '${ex.name}',
    aliases: ${JSON.stringify(ex.aliases)},
    environments: ${JSON.stringify(ex.environments)},
    targetMuscle: '${ex.targetMuscle}',
    targetMuscles: ${JSON.stringify(ex.targetMuscles)},
    equipmentRequired: ${JSON.stringify(ex.equipmentRequired)},
    difficulty: '${ex.difficulty}',
    instructions: '${ex.instructions.replace(/'/g, "\\'")}',
    safetyNotes: '${ex.safetyNotes.replace(/'/g, "\\'")}'
  }`;
}).join(',\n') + '\n];\n\n';

let newLibraryContent = beforeExercises + newExercisesStr + afterExercises;

// Additionally, update getExerciseCatalog inside newLibraryContent to export the new fields
newLibraryContent = newLibraryContent.replace(
  'return exercises.map(({ id, name, environments, instructions }) => ({',
  'return exercises.map(({ id, name, environments, targetMuscle, targetMuscles, equipmentRequired, difficulty, instructions, safetyNotes }) => ({'
);

newLibraryContent = newLibraryContent.replace(
  'instructions,',
  'instructions,\n    targetMuscle,\n    targetMuscles: targetMuscles || [],\n    equipmentRequired: equipmentRequired || [],\n    difficulty,\n    safetyNotes,'
);

fs.writeFileSync(libraryPath, newLibraryContent, 'utf8');

// Generate SVG files
allExercises.forEach(ex => {
  const svgPath = path.join(imagesPath, `${ex.id}.svg`);
  if (!fs.existsSync(svgPath)) {
    fs.writeFileSync(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">${ex.name}</text></svg>`, 'utf8');
  }
});

console.log('Successfully updated gym exercises and generated missing SVGs.');
