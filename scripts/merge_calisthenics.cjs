const fs = require('fs');
const path = require('path');

const libraryPath = path.join(__dirname, '../src/workouts/exercise-library.cjs');
const imagesPath = path.join(__dirname, '../src/workouts/exercise-images');

const calisthenicsExercises = JSON.parse(fs.readFileSync(path.join(__dirname, 'calisthenics_exercises.json'), 'utf8'));
let libraryContent = fs.readFileSync(libraryPath, 'utf8');

// Find the exercises array
const startIdx = libraryContent.indexOf('const exercises = [');
const endIdx = libraryContent.indexOf('];\n\nconst exerciseById =');
const exercisesStr = libraryContent.substring(startIdx + 19, endIdx);

// Write to temp file and require
const tempModuleStr = `module.exports = [${exercisesStr}];`;
const tempPath = path.join(__dirname, 'temp_exercises_cali.cjs');
fs.writeFileSync(tempPath, tempModuleStr);
let exercises = require('./temp_exercises_cali.cjs');
fs.unlinkSync(tempPath);

// Merge
calisthenicsExercises.forEach(caliEx => {
    const existing = exercises.find(ex => ex.id === caliEx.id || (ex.aliases && ex.aliases.includes(caliEx.name.toLowerCase())));
    if (existing) {
        if (!existing.environments.includes('Calisthenics')) {
            existing.environments.push('Calisthenics');
        }
    } else {
        exercises.push(caliEx);
    }
});

// Format back to string
const newExercisesStr = 'const exercises = [\n' + exercises.map(ex => {
  return `  {
    id: '${ex.id}',
    name: '${ex.name.replace(/'/g, "\\'")}',
    aliases: ${JSON.stringify(ex.aliases || [])},
    environments: ${JSON.stringify(ex.environments || [])},
    targetMuscle: '${(ex.targetMuscle || '').replace(/'/g, "\\'")}',
    targetMuscles: ${JSON.stringify(ex.targetMuscles || [])},
    equipmentRequired: ${JSON.stringify(ex.equipmentRequired || [])},
    difficulty: '${(ex.difficulty || '').replace(/'/g, "\\'")}',
    instructions: '${(ex.instructions || '').replace(/'/g, "\\'")}',
    safetyNotes: '${(ex.safetyNotes || '').replace(/'/g, "\\'")}',
    movementPattern: '${(ex.movementPattern || '').replace(/'/g, "\\'")}',
    secondaryMuscles: ${JSON.stringify(ex.secondaryMuscles || [])},
    startingPosition: '${(ex.startingPosition || '').replace(/'/g, "\\'")}',
    executionSteps: ${JSON.stringify(ex.executionSteps || [])},
    breathing: '${(ex.breathing || '').replace(/'/g, "\\'")}',
    commonMistakes: ${JSON.stringify(ex.commonMistakes || [])},
    prerequisites: '${(ex.prerequisites || '').replace(/'/g, "\\'")}',
    alternatives: ${JSON.stringify(ex.alternatives || [])},
    gymProgramming: ${JSON.stringify(ex.gymProgramming || [])}
  }`;
}).join(',\n') + '\n];\n\n';

let newLibraryContent = libraryContent.substring(0, startIdx) + newExercisesStr + libraryContent.substring(endIdx + 19);
fs.writeFileSync(libraryPath, newLibraryContent, 'utf8');

calisthenicsExercises.forEach(ex => {
  const svgPath = path.join(imagesPath, `${ex.id}.svg`);
  if (!fs.existsSync(svgPath)) {
    fs.writeFileSync(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">${ex.name}</text></svg>`, 'utf8');
  }
});
console.log('Successfully merged calisthenics exercises.');
