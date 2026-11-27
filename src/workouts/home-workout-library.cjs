const fs = require('node:fs');
const path = require('node:path');

const entries = [
  ['CHEST', 'Standard Push-up'], ['CHEST', 'Incline Push-up (Chair)'], ['CHEST', 'Decline Push-up (Chair)'],
  ['CHEST', 'Wide Push-up'], ['CHEST', 'Diamond Push-up'], ['CHEST', 'Archer Push-up'], ['CHEST', 'Hindu Push-up'],
  ['CHEST', 'Explosive Push-up'], ['CHEST', 'Clap Push-up'], ['CHEST', 'Pike Push-up'],
  ['CHEST', 'Pseudo Planche Push-up'], ['CHEST', 'One-arm Push-up Progression'],
  ['SHOULDERS', 'Elevated Pike Push-up (Chair)'], ['SHOULDERS', 'Handstand Hold'], ['SHOULDERS', 'Wall Handstand Push-up'],
  ['SHOULDERS', 'Shoulder Taps'], ['SHOULDERS', 'Arm Circles'], ['SHOULDERS', 'Plank Shoulder Tap'],
  ['SHOULDERS', 'Front Raise (Water Bottles)'], ['SHOULDERS', 'Lateral Raise (Water Bottles)'],
  ['SHOULDERS', 'Overhead Press (Backpack)'],
  ['TRICEPS', 'Bench Dips (Chair)'], ['TRICEPS', 'Close Grip Push-up'], ['TRICEPS', 'Chair Tricep Dip (Chair)'],
  ['TRICEPS', 'Bodyweight Triceps Extension (Chair)'], ['TRICEPS', 'Bench Dip Hold (Chair)'],
  ['BACK', 'Superman'], ['BACK', 'Reverse Snow Angel'], ['BACK', 'Prone Y Raise'], ['BACK', 'Prone T Raise'],
  ['BACK', 'Backpack Row (Backpack)'], ['BACK', 'Towel Row'], ['BACK', 'Doorway Row'],
  ['BACK', 'Inverted Row (Chair)'], ['BACK', 'Resistance Band Row (Resistance Band)'], ['BACK', 'Reverse Plank'],
  ['BICEPS', 'Backpack Curl (Backpack)'], ['BICEPS', 'Water Bottle Curl (Water Bottles)'], ['BICEPS', 'Towel Curl'],
  ['BICEPS', 'Resistance Band Curl (Resistance Band)'], ['BICEPS', 'Chin-up (Pull-up Bar)'], ['BICEPS', 'Isometric Biceps Hold'],
  ['CORE', 'Plank'], ['CORE', 'Side Plank'], ['CORE', 'Hollow Hold'], ['CORE', 'Dead Bug'], ['CORE', 'Bird Dog'],
  ['CORE', 'Crunch'], ['CORE', 'Bicycle Crunch'], ['CORE', 'Reverse Crunch'], ['CORE', 'Heel Touch'],
  ['CORE', 'Toe Touch'], ['CORE', 'Leg Raise'], ['CORE', 'Flutter Kick'], ['CORE', 'Scissor Kick'],
  ['CORE', 'Mountain Climber'], ['CORE', 'Russian Twist'], ['CORE', 'V-Up'], ['CORE', 'Sit-Up'],
  ['CORE', 'Plank Up Down'], ['CORE', 'Plank Reach'],
  ['QUADRICEPS', 'Bodyweight Squat'], ['QUADRICEPS', 'Jump Squat'], ['QUADRICEPS', 'Pulse Squat'], ['QUADRICEPS', 'Wall Sit'],
  ['QUADRICEPS', 'Bulgarian Split Squat (Chair)'], ['QUADRICEPS', 'Step-up (Chair)'], ['QUADRICEPS', 'Split Squat'],
  ['QUADRICEPS', 'Sissy Squat'], ['QUADRICEPS', 'Pistol Squat Progression'],
  ['HAMSTRINGS', 'Single Leg Romanian Deadlift'], ['HAMSTRINGS', 'Glute Bridge'], ['HAMSTRINGS', 'Single Leg Glute Bridge'],
  ['HAMSTRINGS', 'Hamstring Walkout'], ['HAMSTRINGS', 'Nordic Curl Progression'],
  ['GLUTES', 'Hip Thrust (Chair)'], ['GLUTES', 'Donkey Kick'], ['GLUTES', 'Fire Hydrant'], ['GLUTES', 'Frog Pump'],
  ['GLUTES', 'Curtsy Lunge'],
  ['CALVES', 'Standing Calf Raise'], ['CALVES', 'Single Leg Calf Raise'], ['CALVES', 'Elevated Calf Raise (Chair)'],
  ['CALVES', 'Jump Rope (Skipping Rope)'], ['CALVES', 'Calf Raise Hold'],
  ['FULL BODY', 'Burpees'], ['FULL BODY', 'Bear Crawl'], ['FULL BODY', 'Crab Walk'], ['FULL BODY', 'Inchworm'],
  ['FULL BODY', 'Squat to Press (Backpack)'], ['FULL BODY', 'Thrusters (Backpack)'], ['FULL BODY', 'Jumping Jacks'],
  ['FULL BODY', 'High Knees'], ['FULL BODY', 'Skater Hops'], ['FULL BODY', 'Turkish Get Up (Backpack)'],
  ['CARDIO', 'Running in Place'], ['CARDIO', 'Butt Kicks'], ['CARDIO', 'Shadow Boxing'], ['CARDIO', 'Stair Climbing'],
  ['CARDIO', 'Fast Feet'], ['CARDIO', 'Lateral Shuffle'],
  ['MOBILITY', 'Cat Cow'], ['MOBILITY', 'Child Pose'], ['MOBILITY', 'Downward Dog'], ['MOBILITY', 'Cobra Stretch'],
  ['MOBILITY', "World's Greatest Stretch"], ['MOBILITY', 'Hip Flexor Stretch'], ['MOBILITY', 'Hamstring Stretch'],
  ['MOBILITY', 'Quad Stretch'], ['MOBILITY', 'Shoulder Mobility'], ['MOBILITY', 'Thoracic Rotation'],
  ['MOBILITY', 'Ankle Mobility'], ['MOBILITY', 'Neck Mobility'],
];

function slugify(value) {
  return value.normalize('NFKD').toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function equipmentFor(name) {
  if (/Chair/.test(name) || /Elevated/.test(name) || /Step-up/.test(name) || /Hip Thrust/.test(name)) return ['Stable workout bench or appropriate exercise platform'];
  if (/Water Bottles/.test(name)) return ['Water bottles'];
  if (/Backpack/.test(name)) return ['Backpack'];
  if (/Resistance Band/.test(name)) return ['Resistance bands'];
  if (/Pull-up Bar/.test(name)) return ['Pull-up bar'];
  if (/Skipping Rope/.test(name)) return ['Skipping rope'];
  return ['None'];
}

function difficultyFor(category, name) {
  if (/Handstand|Planche|Pistol|Nordic|Turkish|Clap|Archer|One-arm|V-Up|Sissy/.test(name)) return 'Advanced';
  if (/Burpee|Jump|Plank Up|Hollow|Inverted|Decline|Hindu|Explosive|Bear|Crab|Skater|Hamstring/.test(name)) return 'Intermediate';
  if (category === 'MOBILITY') return 'Beginner';
  return 'Beginner';
}

function instructionsFor(category, name) {
  const common = `Set up in a clear, well-lit area. Do not use unstable furniture or an unsafe anchor.`;
  if (category === 'MOBILITY') {
    return `${common} Move slowly into ${name}, stop before pain or pinching, and hold only as comfortably controlled.`;
  }
  if (/Push-up/.test(name)) {
    return `${common} Start in a stable plank position. Keep the body aligned, brace the trunk, lower with control, and press through the palms without letting the shoulders shrug.`;
  }
  if (/Squat|Lunge/.test(name)) {
    return `${common} Stand with a stable base. Brace the trunk, move the hips and knees in a controlled range, keep the knees tracking over the toes, and return to standing without bouncing.`;
  }
  if (/Plank|Side Plank|Hollow Hold/.test(name)) {
    return `${common} Establish a stable alignment. Maintain steady breathing, brace the trunk, and stop before the position causes shaking or loss of control.`;
  }
  return `${common} Begin with the starting position for ${name}. Use slow, controlled movement, keep breathing steadily, and stop for sharp pain, dizziness, or loss of control.`;
}

const catalog = entries.map(([category, name]) => {
  const id = slugify(name);
  const targetMuscles = {
    CHEST: ['Chest', 'Triceps'], SHOULDERS: ['Shoulders'], TRICEPS: ['Triceps'],
    BACK: ['Back'], BICEPS: ['Biceps'], CORE: ['Core'], QUADRICEPS: ['Quadriceps'],
    HAMSTRINGS: ['Hamstrings'], GLUTES: ['Glutes'], CALVES: ['Calves'],
    'FULL BODY': ['Full Body'], CARDIO: ['Cardiovascular system'], MOBILITY: ['Mobility'],
  }[category] || [category];
  return {
    id,
    name,
    aliases: [],
    environments: ['Home Workout'],
    category,
    targetMuscle: targetMuscles[0],
    targetMuscles,
    equipmentRequired: equipmentFor(name),
    difficulty: difficultyFor(category, name),
    instructions: instructionsFor(category, name),
    safetyNotes: 'Use only stable, appropriate equipment. Stop for pain or dizziness and seek professional advice for active injury or recent surgery.',
    movementPattern: category === 'MOBILITY' ? 'Mobility' : category === 'CARDIO' ? 'Cardio' : 'Resistance',
    secondaryMuscles: [],
    startingPosition: 'Start in a safe, controlled position with adequate clear space.',
    executionSteps: ['Set up safely and brace appropriately.', 'Perform the movement through a controlled range.', 'Return smoothly and repeat only with stable technique.'],
    breathing: 'Breathe continuously; exhale during the exertion and inhale during the reset.',
    commonMistakes: ['Rushing repetitions', 'Using unsafe furniture or unstable equipment', 'Continuing through sharp pain'],
    prerequisites: 'Comfortable, pain-free practice of an easier variation is required for advanced movements.',
    alternatives: ['A lower-risk easier variation', 'A mobility or isometric alternative'],
    published: false,
  };
});

const imageDirectory = path.join(__dirname, 'exercise-images');

function getHomeWorkoutCatalog({ includeUnpublished = true } = {}) {
  return catalog
    .filter((exercise) => includeUnpublished || exercise.published)
    .map((exercise) => ({
      ...exercise,
      imageUrl: fs.existsSync(path.join(imageDirectory, `${exercise.id}.svg`))
        ? `/exercise-images/${exercise.id}.svg`
        : null,
    }));
}

module.exports = {
  HOME_WORKOUT_SOURCE_COUNT: entries.length,
  getHomeWorkoutCatalog,
  homeWorkoutCatalog: catalog,
};
