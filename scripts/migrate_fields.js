const fs = require('fs');
const path = require('path');

const libraryPath = path.join(__dirname, '../src/workouts/exercise-library.cjs');
let libraryContent = fs.readFileSync(libraryPath, 'utf8');

// Find the exercises array
const startIdx = libraryContent.indexOf('const exercises = [');
const endIdx = libraryContent.indexOf('];\n\nconst exerciseById =');
const exercisesStr = libraryContent.substring(startIdx + 19, endIdx);

// It's a bit tricky to eval, but we can do it if we're careful.
// We'll wrap it in a module export to get the array.
const tempModuleStr = `module.exports = [${exercisesStr}];`;
const tempPath = path.join(__dirname, 'temp_exercises.cjs');
fs.writeFileSync(tempPath, tempModuleStr);

const exercises = require('./temp_exercises.cjs');
fs.unlinkSync(tempPath);

const updatedExercises = exercises.map(ex => {
  // Infer fields based on existing data
  let movementPattern = "Compound";
  if (ex.id.includes("curl") || ex.id.includes("extension") || ex.id.includes("fly") || ex.id.includes("raise")) {
    movementPattern = "Isolation";
  }
  if (ex.id.includes("push") || ex.id.includes("press")) movementPattern = "Push";
  if (ex.id.includes("pull") || ex.id.includes("row")) movementPattern = "Pull";
  if (ex.id.includes("squat") || ex.id.includes("lunge") || ex.id.includes("leg")) movementPattern = "Legs";

  const secondaryMuscles = (ex.targetMuscles || []).filter(m => m !== ex.targetMuscle);
  const startingPosition = `Assume a stable position with the ${ex.equipmentRequired && ex.equipmentRequired[0] !== 'None' ? ex.equipmentRequired[0] : 'bodyweight'} properly set up.`;
  const executionSteps = [
    ex.instructions || "Perform the movement with control.",
    "Focus on muscle contraction.",
    "Return to the starting position safely."
  ];
  const breathing = "Inhale during the eccentric phase, exhale during the concentric phase.";
  const commonMistakes = [
    "Using momentum instead of muscle control.",
    "Rushing through the movement.",
    "Not using a full range of motion."
  ];
  const prerequisites = ex.difficulty === "Advanced" ? "Mastery of intermediate variations" : (ex.difficulty === "Intermediate" ? "Mastery of beginner variations" : "None");
  const alternatives = ["Machine variation", "Dumbbell variation", "Cable variation"];
  const gymProgramming = [
    { category: "Hypertrophy", sets: 3, reps: "8-12", rest: "90s" },
    { category: "Strength", sets: 4, reps: "4-6", rest: "180s" }
  ];

  return {
    ...ex,
    movementPattern,
    secondaryMuscles,
    startingPosition,
    executionSteps,
    breathing,
    commonMistakes,
    prerequisites,
    alternatives,
    gymProgramming
  };
});

// Format back to string
const newExercisesStr = 'const exercises = [\n' + updatedExercises.map(ex => {
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
    movementPattern: '${ex.movementPattern.replace(/'/g, "\\'")}',
    secondaryMuscles: ${JSON.stringify(ex.secondaryMuscles)},
    startingPosition: '${ex.startingPosition.replace(/'/g, "\\'")}',
    executionSteps: ${JSON.stringify(ex.executionSteps)},
    breathing: '${ex.breathing.replace(/'/g, "\\'")}',
    commonMistakes: ${JSON.stringify(ex.commonMistakes)},
    prerequisites: '${ex.prerequisites.replace(/'/g, "\\'")}',
    alternatives: ${JSON.stringify(ex.alternatives)},
    gymProgramming: ${JSON.stringify(ex.gymProgramming)}
  }`;
}).join(',\n') + '\n];\n\n';

let newLibraryContent = libraryContent.substring(0, startIdx) + newExercisesStr + libraryContent.substring(endIdx + 19);

// Update getExerciseCatalog export
if (!newLibraryContent.includes('movementPattern: movementPattern || null')) {
  newLibraryContent = newLibraryContent.replace(
    /return exercises\.map\(\(\{[^}]+\}\) => \(\{/,
    'return exercises.map(({ id, name, environments, targetMuscle, targetMuscles, equipmentRequired, difficulty, instructions, safetyNotes, movementPattern, secondaryMuscles, startingPosition, executionSteps, breathing, commonMistakes, prerequisites, alternatives, gymProgramming }) => ({'
  );

  newLibraryContent = newLibraryContent.replace(
    /safetyNotes,?\n\s*\}\)\);/,
    `safetyNotes,
    movementPattern: movementPattern || null,
    secondaryMuscles: secondaryMuscles || [],
    startingPosition: startingPosition || null,
    executionSteps: executionSteps || [],
    breathing: breathing || null,
    commonMistakes: commonMistakes || [],
    prerequisites: prerequisites || null,
    alternatives: alternatives || [],
    gymProgramming: gymProgramming || []
  }));`
  );
}

fs.writeFileSync(libraryPath, newLibraryContent, 'utf8');
console.log('Successfully migrated library fields.');
