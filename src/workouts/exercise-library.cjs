const fs = require('node:fs');
const path = require('node:path');

const IMAGE_DIRECTORY = path.join(__dirname, 'exercise-images');
const IMAGE_BASE_URL = '/exercise-images';

const exercises = [
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    aliases: ["bench press"],
    environments: ["Gym"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Triceps","Front Delts"],
    equipmentRequired: ["Barbell","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Lie flat on the bench. Grip the bar slightly wider than shoulder-width. Lower the bar to your mid-chest under control, then press it back up.',
    safetyNotes: 'Use a spotter or safeties set just below the bar path; do not bounce the bar from the chest.',
    movementPattern: 'Horizontal push',
    secondaryMuscles: ['Triceps', 'Anterior deltoids'],
    startingPosition: 'Lie with eyes under the racked bar, feet planted, and shoulder blades gently retracted. Grip the bar evenly just outside shoulder width.',
    executionSteps: [
      'Unrack the bar with straight arms and position it above the mid-chest.',
      'Lower it under control toward the mid-chest while keeping wrists stacked over forearms.',
      'Press upward and slightly back until the bar is over the shoulders, without bouncing or forcing the elbows to lock.',
    ],
    breathing: 'Inhale and brace while lowering; exhale through the press.',
    commonMistakes: ['Bouncing the bar off the chest', 'Allowing wrists to fold back', 'Losing foot contact or shoulder position'],
    prerequisites: 'Use a load that allows controlled repetitions; learn the bar path with a coach or unloaded technique practice if unfamiliar.',
    alternatives: ['Push-ups', 'Flat Dumbbell Press'],
    rest: '2-3 minutes'
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    aliases: ["incline db press"],
    environments: ["Gym"],
    targetMuscle: 'Upper Chest',
    targetMuscles: ["Chest","Front Delts","Triceps"],
    equipmentRequired: ["Dumbbells","Incline Bench"],
    difficulty: 'Intermediate',
    instructions: 'Set bench to a 30-45 degree incline. Press dumbbells upward until arms are straight, lower them slowly until a stretch is felt.',
    safetyNotes: 'Avoid flaring elbows 90 degrees.'
  },
  {
    id: 'flat-dumbbell-press',
    name: 'Flat Dumbbell Press',
    aliases: ["dumbbell press", "dumbbell bench press"],
    environments: ["Gym"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Triceps","Front Delts"],
    equipmentRequired: ["Dumbbells","Bench"],
    difficulty: 'Beginner',
    instructions: 'Lie on a flat bench. Press dumbbells straight up over your chest, then lower them under control.',
    safetyNotes: 'Keep wrists straight.'
  },
  {
    id: 'decline-bench-press',
    name: 'Decline Bench Press',
    aliases: ["decline press"],
    environments: ["Gym"],
    targetMuscle: 'Lower Chest',
    targetMuscles: ["Chest","Triceps","Front Delts"],
    equipmentRequired: ["Barbell","Decline Bench"],
    difficulty: 'Intermediate',
    instructions: 'Secure your feet. Unrack the bar and lower it to your lower chest, then press back up.',
    safetyNotes: 'Ensure feet are securely locked.'
  },
  {
    id: 'cable-chest-fly',
    name: 'Cable Chest Fly',
    aliases: ["cable fly"],
    environments: ["Gym"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Front Delts"],
    equipmentRequired: ["Cable Machine"],
    difficulty: 'Beginner',
    instructions: 'Set pulleys to chest height. With a slight bend in your elbows, bring the handles together in a hugging motion.',
    safetyNotes: 'Avoid going too heavy and losing form.'
  },
  {
    id: 'pec-deck-fly',
    name: 'Pec Deck Fly',
    aliases: ["machine fly"],
    environments: ["Gym"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Front Delts"],
    equipmentRequired: ["Pec Deck Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit with back flat against the pad. Bring the handles together, squeezing the chest, and return slowly.',
    safetyNotes: 'Do not overstretch at the starting position.'
  },
  {
    id: 'chest-dips',
    name: 'Chest Dips',
    aliases: ["dips"],
    environments: ["Gym","Calisthenics"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Triceps","Front Delts"],
    equipmentRequired: ["Dip Station"],
    difficulty: 'Intermediate',
    instructions: 'Lean forward slightly on the parallel bars. Lower your body until elbows are at 90 degrees, then press up.',
    safetyNotes: 'Avoid going too deep to protect shoulders.'
  },
  {
    id: 'push-up',
    name: 'Push-ups',
    aliases: ["standard push-up"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Chest',
    targetMuscles: ["Chest","Triceps","Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Start in a high plank. Lower your body until your chest nearly touches the floor, then push back up.',
    safetyNotes: 'Keep your core braced and back straight.'
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'Dumbbell Shoulder Press',
    aliases: ["seated shoulder press"],
    environments: ["Gym"],
    targetMuscle: 'Front Delts',
    targetMuscles: ["Shoulders","Triceps"],
    equipmentRequired: ["Dumbbells","Bench"],
    difficulty: 'Beginner',
    instructions: 'Sit on a bench with back support. Press dumbbells overhead until arms are extended, lower slowly.',
    safetyNotes: 'Do not arch your lower back excessively.'
  },
  {
    id: 'overhead-barbell-press',
    name: 'Overhead Barbell Press',
    aliases: ["military press","ohp"],
    environments: ["Gym"],
    targetMuscle: 'Shoulders',
    targetMuscles: ["Shoulders","Triceps","Core"],
    equipmentRequired: ["Barbell","Squat Rack"],
    difficulty: 'Intermediate',
    instructions: 'Stand with barbell resting on front delts. Press the bar straight overhead, locking out elbows.',
    safetyNotes: 'Brace your core and squeeze your glutes.'
  },
  {
    id: 'dumbbell-lateral-raises',
    name: 'Dumbbell Lateral Raises',
    aliases: ["lateral raises"],
    environments: ["Gym"],
    targetMuscle: 'Side Delts',
    targetMuscles: ["Shoulders"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Stand holding dumbbells. Raise arms out to the sides until parallel to the floor, lower under control.',
    safetyNotes: 'Keep a slight bend in your elbows.'
  },
  {
    id: 'front-raises',
    name: 'Front Raises',
    aliases: ["dumbbell front raise"],
    environments: ["Gym"],
    targetMuscle: 'Front Delts',
    targetMuscles: ["Shoulders"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Stand holding dumbbells. Raise one or both arms straight in front of you until parallel to the floor.',
    safetyNotes: 'Do not swing your torso.'
  },
  {
    id: 'arnold-press',
    name: 'Arnold Press',
    aliases: [],
    environments: ["Gym"],
    targetMuscle: 'Shoulders',
    targetMuscles: ["Shoulders","Triceps"],
    equipmentRequired: ["Dumbbells","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Start with dumbbells in front of your face, palms facing you. Press up while rotating palms outward.',
    safetyNotes: 'Use a smooth, controlled motion.'
  },
  {
    id: 'cable-lateral-raises',
    name: 'Cable Lateral Raises',
    aliases: ["cable side raise"],
    environments: ["Gym"],
    targetMuscle: 'Side Delts',
    targetMuscles: ["Shoulders"],
    equipmentRequired: ["Cable Machine"],
    difficulty: 'Beginner',
    instructions: 'Stand next to a low pulley. Pull the handle across your body and out to the side until parallel with the floor.',
    safetyNotes: 'Maintain constant tension.'
  },
  {
    id: 'rope-pushdown',
    name: 'Rope Pushdown',
    aliases: ["triceps pushdown"],
    environments: ["Gym"],
    targetMuscle: 'Triceps',
    targetMuscles: ["Triceps"],
    equipmentRequired: ["Cable Machine","Rope Attachment"],
    difficulty: 'Beginner',
    instructions: 'Attach a rope to a high pulley. Keep elbows tucked in and extend arms downwards, spreading the rope at the bottom.',
    safetyNotes: 'Keep your upper arms stationary.'
  },
  {
    id: 'overhead-triceps-extension',
    name: 'Overhead Triceps Extension',
    aliases: ["dumbbell overhead extension"],
    environments: ["Gym"],
    targetMuscle: 'Triceps',
    targetMuscles: ["Triceps"],
    equipmentRequired: ["Dumbbell"],
    difficulty: 'Beginner',
    instructions: 'Hold a dumbbell overhead with both hands. Lower it behind your head by bending elbows, then extend back up.',
    safetyNotes: 'Keep elbows pointing forward, not flaring out.'
  },
  {
    id: 'skull-crushers',
    name: 'Skull Crushers',
    aliases: ["lying triceps extension"],
    environments: ["Gym"],
    targetMuscle: 'Triceps',
    targetMuscles: ["Triceps"],
    equipmentRequired: ["EZ Bar","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Lie on a bench. Lower the EZ bar toward your forehead by bending the elbows, then extend back up.',
    safetyNotes: 'Control the weight to protect your joints.'
  },
  {
    id: 'close-grip-bench-press',
    name: 'Close-Grip Bench Press',
    aliases: ["close grip bench"],
    environments: ["Gym"],
    targetMuscle: 'Triceps',
    targetMuscles: ["Triceps","Chest","Front Delts"],
    equipmentRequired: ["Barbell","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Grip the bar shoulder-width apart. Lower it to your lower chest, keeping elbows tucked, and press up.',
    safetyNotes: 'Do not grip too close; shoulder-width is optimal.'
  },
  {
    id: 'triceps-dips',
    name: 'Triceps Dips',
    aliases: ["bench dips"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Triceps',
    targetMuscles: ["Triceps","Chest"],
    equipmentRequired: ["Dip Station","Chair"],
    difficulty: 'Intermediate',
    instructions: 'Keep torso upright and elbows tucked in. Lower your body and press back up using your triceps.',
    safetyNotes: 'Avoid rolling your shoulders forward.'
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    aliases: ["wide grip lat pulldown"],
    environments: ["Gym"],
    targetMuscle: 'Lats',
    targetMuscles: ["Back","Biceps"],
    equipmentRequired: ["Cable Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit at the machine. Pull the wide bar down to your upper chest, squeezing your shoulder blades together.',
    safetyNotes: 'Do not use momentum to pull the weight.'
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    aliases: ["cable row"],
    environments: ["Gym"],
    targetMuscle: 'Back',
    targetMuscles: ["Lats","Rhomboids","Biceps"],
    equipmentRequired: ["Cable Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit with knees slightly bent. Pull the handle to your lower abdomen, squeezing your back muscles.',
    safetyNotes: 'Keep your torso relatively still; avoid swinging.'
  },
  {
    id: 'one-arm-dumbbell-row',
    name: 'One-Arm Dumbbell Row',
    aliases: ["dumbbell row"],
    environments: ["Gym"],
    targetMuscle: 'Lats',
    targetMuscles: ["Back","Biceps"],
    equipmentRequired: ["Dumbbell","Bench"],
    difficulty: 'Beginner',
    instructions: 'Support one knee and hand on a bench. Row the dumbbell up to your hip, keeping your back flat.',
    safetyNotes: 'Do not twist your spine.'
  },
  {
    id: 'barbell-bent-over-row',
    name: 'Barbell Bent-Over Row',
    aliases: ["barbell row"],
    environments: ["Gym"],
    targetMuscle: 'Back',
    targetMuscles: ["Lats","Rhomboids","Biceps","Lower Back"],
    equipmentRequired: ["Barbell"],
    difficulty: 'Intermediate',
    instructions: 'Hinge at the hips until your torso is nearly parallel to the floor. Row the bar to your lower ribs.',
    safetyNotes: 'Maintain a neutral spine throughout.'
  },
  {
    id: 't-bar-row',
    name: 'T-Bar Row',
    aliases: [],
    environments: ["Gym"],
    targetMuscle: 'Back',
    targetMuscles: ["Lats","Rhomboids","Biceps"],
    equipmentRequired: ["T-Bar Machine","Barbell"],
    difficulty: 'Intermediate',
    instructions: 'Stand over the bar, hinge at the hips, and row the handles to your chest.',
    safetyNotes: 'Keep your lower back straight.'
  },
  {
    id: 'pull-up',
    name: 'Pull-ups',
    aliases: ["strict pull-up"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Lats',
    targetMuscles: ["Back","Biceps","Core"],
    equipmentRequired: ["Pull-up Bar"],
    difficulty: 'Intermediate',
    instructions: 'Hang with an overhand grip. Pull yourself up until your chin clears the bar, then lower with control.',
    safetyNotes: 'Avoid swinging or kipping.'
  },
  {
    id: 'straight-arm-pulldown',
    name: 'Straight-Arm Pulldown',
    aliases: ["lat pushdown"],
    environments: ["Gym"],
    targetMuscle: 'Lats',
    targetMuscles: ["Back"],
    equipmentRequired: ["Cable Machine"],
    difficulty: 'Beginner',
    instructions: 'Stand holding a straight bar attachment. Keeping arms straight, pull the bar down to your thighs.',
    safetyNotes: 'Focus on using your lats, not your triceps.'
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    aliases: ["barbell deadlift"],
    environments: ["Gym"],
    targetMuscle: 'Hamstrings',
    targetMuscles: ["Lower Back","Glutes","Hamstrings","Core"],
    equipmentRequired: ["Barbell"],
    difficulty: 'Advanced',
    instructions: 'Stand with the bar over your mid-foot. Hinge at the hips, grip the bar, brace your core, and stand up.',
    safetyNotes: 'Keep the bar close to your body and maintain a neutral spine.'
  },
  {
    id: 'chest-supported-row',
    name: 'Chest-Supported Row',
    aliases: ["incline row"],
    environments: ["Gym"],
    targetMuscle: 'Back',
    targetMuscles: ["Lats","Rhomboids","Biceps"],
    equipmentRequired: ["Dumbbells","Incline Bench"],
    difficulty: 'Beginner',
    instructions: 'Lie chest-down on an incline bench. Row dumbbells up to your sides, squeezing your shoulder blades.',
    safetyNotes: 'Keep your chest glued to the pad.'
  },
  {
    id: 'dumbbell-biceps-curl',
    name: 'Dumbbell Biceps Curl',
    aliases: ["bicep curl"],
    environments: ["Gym"],
    targetMuscle: 'Biceps',
    targetMuscles: ["Biceps","Forearms"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Stand holding dumbbells. Curl the weights toward your shoulders while supinating your wrists.',
    safetyNotes: 'Keep your elbows pinned to your sides.'
  },
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    aliases: ["ez bar curl"],
    environments: ["Gym"],
    targetMuscle: 'Biceps',
    targetMuscles: ["Biceps","Forearms"],
    equipmentRequired: ["Barbell"],
    difficulty: 'Beginner',
    instructions: 'Stand holding a barbell. Curl the weight up, squeezing your biceps, then lower it slowly.',
    safetyNotes: 'Avoid using momentum from your hips.'
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    aliases: ["dumbbell hammer curl"],
    environments: ["Gym"],
    targetMuscle: 'Brachialis',
    targetMuscles: ["Biceps","Forearms"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Hold dumbbells with a neutral grip. Curl them up toward your shoulders.',
    safetyNotes: 'Do not swing the weights.'
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    aliases: ["machine preacher curl"],
    environments: ["Gym"],
    targetMuscle: 'Biceps',
    targetMuscles: ["Biceps"],
    equipmentRequired: ["Preacher Bench","EZ Bar"],
    difficulty: 'Beginner',
    instructions: 'Rest arms on a preacher bench. Curl the weight up and lower it until arms are fully extended.',
    safetyNotes: 'Control the eccentric phase to avoid biceps tears.'
  },
  {
    id: 'concentration-curl',
    name: 'Concentration Curl',
    aliases: [],
    environments: ["Gym"],
    targetMuscle: 'Biceps',
    targetMuscles: ["Biceps"],
    equipmentRequired: ["Dumbbell","Bench"],
    difficulty: 'Beginner',
    instructions: 'Sit on a bench, resting your elbow on your inner thigh. Curl the dumbbell up.',
    safetyNotes: 'Focus on the mind-muscle connection.'
  },
  {
    id: 'incline-dumbbell-curl',
    name: 'Incline Dumbbell Curl',
    aliases: ["incline curl"],
    environments: ["Gym"],
    targetMuscle: 'Biceps',
    targetMuscles: ["Biceps"],
    equipmentRequired: ["Dumbbells","Incline Bench"],
    difficulty: 'Intermediate',
    instructions: 'Sit on an incline bench. Let arms hang straight down, then curl the dumbbells up.',
    safetyNotes: 'Keep your shoulders pinned back.'
  },
  {
    id: 'reverse-curl',
    name: 'Reverse Curl',
    aliases: ["pronated curl"],
    environments: ["Gym"],
    targetMuscle: 'Brachioradialis',
    targetMuscles: ["Forearms","Biceps"],
    equipmentRequired: ["Barbell","EZ Bar"],
    difficulty: 'Beginner',
    instructions: 'Hold the bar with an overhand grip. Curl it upwards.',
    safetyNotes: 'Use a lighter weight than standard curls.'
  },
  {
    id: 'wrist-curl',
    name: 'Wrist Curl',
    aliases: ["forearm curl"],
    environments: ["Gym"],
    targetMuscle: 'Forearms',
    targetMuscles: ["Forearms"],
    equipmentRequired: ["Dumbbells","Barbell","Bench"],
    difficulty: 'Beginner',
    instructions: 'Rest forearms on a bench. Curl your wrists upward, then lower them.',
    safetyNotes: 'Perform with slow, controlled reps.'
  },
  {
    id: 'face-pulls',
    name: 'Face Pulls',
    aliases: ["cable face pull"],
    environments: ["Gym"],
    targetMuscle: 'Rear Delts',
    targetMuscles: ["Rear Delts","Traps","Rotator Cuff"],
    equipmentRequired: ["Cable Machine","Rope Attachment"],
    difficulty: 'Beginner',
    instructions: 'Pull the rope toward your face, driving elbows back and externally rotating your shoulders.',
    safetyNotes: 'Keep the weight moderate.'
  },
  {
    id: 'reverse-pec-deck',
    name: 'Reverse Pec Deck',
    aliases: ["rear delt machine"],
    environments: ["Gym"],
    targetMuscle: 'Rear Delts',
    targetMuscles: ["Rear Delts","Traps"],
    equipmentRequired: ["Pec Deck Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit facing the machine pad. Pull the handles backward in an arc.',
    safetyNotes: 'Keep arms slightly bent.'
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    aliases: ["dumbbell rear delt fly"],
    environments: ["Gym"],
    targetMuscle: 'Rear Delts',
    targetMuscles: ["Rear Delts","Upper Back"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Hinge at the hips. Raise dumbbells out to the side in a reverse fly motion.',
    safetyNotes: 'Avoid using momentum.'
  },
  {
    id: 'dumbbell-shrugs',
    name: 'Dumbbell Shrugs',
    aliases: ["shrugs"],
    environments: ["Gym"],
    targetMuscle: 'Traps',
    targetMuscles: ["Traps"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Stand holding dumbbells. Shrug your shoulders straight up toward your ears, then lower.',
    safetyNotes: 'Do not roll your shoulders.'
  },
  {
    id: 'bodyweight-squat',
    name: 'Bodyweight Squat',
    aliases: ["air squat"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes","Hamstrings"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Stand shoulder-width apart. Sit back and down as if sitting in a chair, then stand up.',
    safetyNotes: 'Keep chest up and knees tracking over toes.'
  },
  {
    id: 'barbell-back-squat',
    name: 'Barbell Back Squat',
    aliases: ["barbell squat","back squat"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes","Core","Lower Back"],
    equipmentRequired: ["Barbell","Squat Rack"],
    difficulty: 'Intermediate',
    instructions: 'Rest the bar on your upper back. Squat down until your hips are below your knees, then drive back up.',
    safetyNotes: 'Use rack safeties set below the intended depth; stop if pain, dizziness, or loss of control occurs.',
    movementPattern: 'Squat',
    secondaryMuscles: ['Glutes', 'Adductors', 'Trunk'],
    startingPosition: 'Set the bar securely across the upper back, stand with feet at a comfortable stance, and brace before each repetition.',
    executionSteps: [
      'Unrack the bar and step back only far enough to clear the hooks.',
      'Brace, bend at hips and knees together, and descend only as far as you can keep balance and control.',
      'Keep the whole foot grounded and knees tracking in the direction of the toes.',
      'Push the floor away to stand, maintaining the same controlled trunk position.',
    ],
    breathing: 'Inhale and brace before descending; exhale after passing the hardest part of the ascent.',
    commonMistakes: ['Losing balance onto the toes or heels', 'Allowing knees to collapse inward', 'Descending beyond controlled, comfortable range'],
    prerequisites: 'Practice an unloaded squat and learn rack setup and safeties before adding a bar.',
    alternatives: ['Bodyweight Squat', 'Goblet Squat'],
    rest: '2-3 minutes'
  },
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    aliases: ["dumbbell squat"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes","Core"],
    equipmentRequired: ["Dumbbell","Kettlebell"],
    difficulty: 'Beginner',
    instructions: 'Hold a weight vertically at chest level. Squat down, keeping your torso upright.',
    safetyNotes: 'Keep the weight close to your body.'
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    aliases: ["machine leg press"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes","Hamstrings"],
    equipmentRequired: ["Leg Press Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit in the machine. Press the platform away, then lower it slowly until your knees form a 90-degree angle.',
    safetyNotes: 'Do not lock out your knees at the top.'
  },
  {
    id: 'hack-squat',
    name: 'Hack Squat',
    aliases: ["machine hack squat"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes"],
    equipmentRequired: ["Hack Squat Machine"],
    difficulty: 'Intermediate',
    instructions: 'Position your shoulders under the pads. Lower yourself by bending your knees, then press up.',
    safetyNotes: 'Keep your lower back pressed against the pad.'
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    aliases: ["machine leg extension"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads"],
    equipmentRequired: ["Leg Extension Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit in the machine. Extend your legs fully, squeeze your quads, then lower under control.',
    safetyNotes: 'Control the weight on the way down.'
  },
  {
    id: 'walking-lunges',
    name: 'Walking Lunges',
    aliases: ["lunges"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes","Hamstrings"],
    equipmentRequired: ["Dumbbells","None"],
    difficulty: 'Beginner',
    instructions: 'Take a large step forward and lower your hips. Stand up by stepping the back foot forward.',
    safetyNotes: 'Do not let your front knee aggressively pass your toes.'
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    aliases: ["rear foot elevated split squat"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes"],
    equipmentRequired: ["Dumbbells","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Elevate your rear foot on a bench. Lower your hips until your front thigh is parallel to the floor.',
    safetyNotes: 'Keep your torso relatively upright.'
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    aliases: ["rdl","dumbbell rdl"],
    environments: ["Gym"],
    targetMuscle: 'Hamstrings',
    targetMuscles: ["Hamstrings","Glutes","Lower Back"],
    equipmentRequired: ["Barbell","Dumbbells"],
    difficulty: 'Intermediate',
    instructions: 'Hinge at the hips, keeping a slight bend in your knees. Lower the weight until you feel a hamstring stretch, then return.',
    safetyNotes: 'Do not round your lower back.'
  },
  {
    id: 'lying-leg-curl',
    name: 'Lying Leg Curl',
    aliases: ["hamstring curl machine"],
    environments: ["Gym"],
    targetMuscle: 'Hamstrings',
    targetMuscles: ["Hamstrings"],
    equipmentRequired: ["Leg Curl Machine"],
    difficulty: 'Beginner',
    instructions: 'Lie face down. Curl the pad toward your glutes, then lower it with control.',
    safetyNotes: 'Keep your hips pressed into the bench.'
  },
  {
    id: 'seated-leg-curl',
    name: 'Seated Leg Curl',
    aliases: ["seated hamstring curl"],
    environments: ["Gym"],
    targetMuscle: 'Hamstrings',
    targetMuscles: ["Hamstrings"],
    equipmentRequired: ["Seated Leg Curl Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit in the machine. Curl your legs downward, squeezing your hamstrings, then return.',
    safetyNotes: 'Adjust the machine to align with your knee joint.'
  },
  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    aliases: ["barbell hip thrust"],
    environments: ["Gym"],
    targetMuscle: 'Glutes',
    targetMuscles: ["Glutes","Hamstrings"],
    equipmentRequired: ["Barbell","Bench"],
    difficulty: 'Intermediate',
    instructions: 'Rest your upper back on a bench. Place a barbell across your hips and thrust upward, squeezing glutes.',
    safetyNotes: 'Keep your chin tucked and spine neutral.'
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    aliases: ["floor glute bridge"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Glutes',
    targetMuscles: ["Glutes","Hamstrings","Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Lie on your back with knees bent. Squeeze your glutes and lift your hips.',
    safetyNotes: 'Avoid overextending your lower back.'
  },
  {
    id: 'standing-calf-raise',
    name: 'Standing Calf Raise',
    aliases: ["calf raise"],
    environments: ["Gym"],
    targetMuscle: 'Calves',
    targetMuscles: ["Calves"],
    equipmentRequired: ["Calf Raise Machine"],
    difficulty: 'Beginner',
    instructions: 'Stand with balls of your feet on the edge of a step. Raise your heels, then lower them until you feel a stretch.',
    safetyNotes: 'Use a full range of motion.'
  },
  {
    id: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    aliases: ["soleus raise"],
    environments: ["Gym"],
    targetMuscle: 'Calves',
    targetMuscles: ["Calves"],
    equipmentRequired: ["Seated Calf Machine"],
    difficulty: 'Beginner',
    instructions: 'Sit in the machine. Raise your heels, pause at the top, then lower.',
    safetyNotes: 'Control the eccentric portion.'
  },
  {
    id: 'step-ups',
    name: 'Step-ups',
    aliases: ["box step up"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Glutes"],
    equipmentRequired: ["Box","Dumbbells"],
    difficulty: 'Beginner',
    instructions: 'Place one foot on a box. Drive through that foot to stand up, then lower back down slowly.',
    safetyNotes: 'Avoid pushing off aggressively with the bottom leg.'
  },
  {
    id: 'dumbbell-thrusters',
    name: 'Dumbbell Thrusters',
    aliases: ["thrusters"],
    environments: ["Gym"],
    targetMuscle: 'Quads',
    targetMuscles: ["Quads","Shoulders","Glutes","Core"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Intermediate',
    instructions: 'Hold dumbbells at shoulder level. Perform a front squat, then explosively press the weights overhead as you stand.',
    safetyNotes: 'Keep your core engaged throughout.'
  },
  {
    id: 'kettlebell-swings',
    name: 'Kettlebell Swings',
    aliases: ["kb swings"],
    environments: ["Gym"],
    targetMuscle: 'Glutes',
    targetMuscles: ["Glutes","Hamstrings","Core","Lower Back"],
    equipmentRequired: ["Kettlebell"],
    difficulty: 'Intermediate',
    instructions: 'Hinge at the hips and swing the kettlebell between your legs. Explosively thrust your hips forward to swing it up.',
    safetyNotes: 'Do not use your arms to lift the weight; use hip drive.'
  },
  {
    id: 'dumbbell-clean-and-press',
    name: 'Dumbbell Clean and Press',
    aliases: ["clean and press"],
    environments: ["Gym"],
    targetMuscle: 'Full Body',
    targetMuscles: ["Shoulders","Traps","Legs","Core"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Advanced',
    instructions: 'Explosively pull dumbbells from the floor to your shoulders, then press them overhead.',
    safetyNotes: 'Keep the weights close to your body.'
  },
  {
    id: 'farmers-walk',
    name: "Farmer's Walk",
    aliases: ["farmers carry"],
    environments: ["Gym"],
    targetMuscle: 'Forearms',
    targetMuscles: ["Forearms","Traps","Core"],
    equipmentRequired: ["Dumbbells","Kettlebells"],
    difficulty: 'Beginner',
    instructions: 'Hold a heavy weight in each hand. Stand tall and walk for a set distance or time.',
    safetyNotes: 'Maintain an upright posture.'
  },
  {
    id: 'renegade-rows',
    name: 'Renegade Rows',
    aliases: ["plank row"],
    environments: ["Gym"],
    targetMuscle: 'Core',
    targetMuscles: ["Core","Back"],
    equipmentRequired: ["Dumbbells"],
    difficulty: 'Intermediate',
    instructions: 'Start in a push-up position holding dumbbells. Row one dumbbell to your hip while balancing on the other.',
    safetyNotes: 'Do not let your hips twist.'
  },
  {
    id: 'burpees',
    name: 'Burpees',
    aliases: ["burpee"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Full Body',
    targetMuscles: ["Chest","Legs","Core","Cardio"],
    equipmentRequired: ["None"],
    difficulty: 'Intermediate',
    instructions: 'Drop into a push-up, jump feet to hands, and explosively jump up.',
    safetyNotes: 'Pace yourself.'
  },
  {
    id: 'forearm-plank',
    name: 'Forearm Plank',
    aliases: ["plank"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Core',
    targetMuscles: ["Core","Shoulders"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Rest on your forearms and toes. Keep your body in a straight line.',
    safetyNotes: 'Do not let your hips sag.'
  },
  {
    id: 'side-plank',
    name: 'Side Plank',
    aliases: [],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Obliques',
    targetMuscles: ["Core","Shoulders"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Support your body on one forearm and the side of your foot. Keep hips elevated.',
    safetyNotes: 'Keep your body in a straight line.'
  },
  {
    id: 'crunches',
    name: 'Crunches',
    aliases: ["abdominal crunch"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Core',
    targetMuscles: ["Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Lie on your back. Curl your shoulders off the floor, squeezing your abs.',
    safetyNotes: 'Do not pull on your neck.'
  },
  {
    id: 'reverse-crunches',
    name: 'Reverse Crunches',
    aliases: ["reverse crunch"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Lower Abs',
    targetMuscles: ["Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Lie on your back. Bring your knees toward your chest, lifting your hips slightly off the floor.',
    safetyNotes: 'Use your abs, not momentum.'
  },
  {
    id: 'leg-raises',
    name: 'Leg Raises',
    aliases: ["lying leg raise"],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Lower Abs',
    targetMuscles: ["Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Lie on your back. Keep legs straight and raise them until pointing at the ceiling, then lower.',
    safetyNotes: 'Keep your lower back pressed into the floor.'
  },
  {
    id: 'russian-twists',
    name: 'Russian Twists',
    aliases: [],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Obliques',
    targetMuscles: ["Core"],
    equipmentRequired: ["Medicine Ball","Dumbbell"],
    difficulty: 'Beginner',
    instructions: 'Sit on the floor, lean back slightly. Twist your torso from side to side, touching the weight to the floor.',
    safetyNotes: 'Rotate from your core, not just your arms.'
  },
  {
    id: 'bicycle-crunches',
    name: 'Bicycle Crunches',
    aliases: ["bicycles"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Core',
    targetMuscles: ["Core","Obliques"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Lie on your back. Bring one knee toward your chest while rotating the opposite elbow to meet it.',
    safetyNotes: 'Do not pull your neck.'
  },
  {
    id: 'cable-crunches',
    name: 'Cable Crunches',
    aliases: ["kneeling cable crunch"],
    environments: ["Gym"],
    targetMuscle: 'Core',
    targetMuscles: ["Core"],
    equipmentRequired: ["Cable Machine","Rope Attachment"],
    difficulty: 'Intermediate',
    instructions: 'Kneel holding a rope attachment behind your neck. Crunch downwards, bringing your elbows toward your knees.',
    safetyNotes: 'Use your abs to pull, not your arms.'
  },
  {
    id: 'hanging-knee-raises',
    name: 'Hanging Knee Raises',
    aliases: ["knee raises"],
    environments: ["Gym","Calisthenics"],
    targetMuscle: 'Lower Abs',
    targetMuscles: ["Core","Forearms"],
    equipmentRequired: ["Pull-up Bar"],
    difficulty: 'Intermediate',
    instructions: 'Hang from a bar. Bring your knees up toward your chest, then lower them under control.',
    safetyNotes: 'Do not swing.'
  },
  {
    id: 'ab-wheel-rollout',
    name: 'Ab Wheel Rollout',
    aliases: ["ab roller"],
    environments: ["Gym"],
    targetMuscle: 'Core',
    targetMuscles: ["Core","Lats"],
    equipmentRequired: ["Ab Wheel"],
    difficulty: 'Advanced',
    instructions: 'Kneel and hold the ab wheel. Roll it forward until your body is fully extended, then pull back.',
    safetyNotes: 'Do not let your lower back sag.'
  },
  {
    id: 'treadmill-incline-walking',
    name: 'Treadmill Incline Walking',
    aliases: ["incline walk"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Calves","Glutes"],
    equipmentRequired: ["Treadmill"],
    difficulty: 'Beginner',
    instructions: 'Set the treadmill to a moderate incline. Walk at a brisk pace.',
    safetyNotes: 'Avoid holding the handrails.'
  },
  {
    id: 'stationary-cycling',
    name: 'Stationary Cycling',
    aliases: ["spin bike"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Quads"],
    equipmentRequired: ["Stationary Bike"],
    difficulty: 'Beginner',
    instructions: 'Pedal at a steady pace or perform intervals.',
    safetyNotes: 'Adjust the seat height appropriately.'
  },
  {
    id: 'elliptical-trainer',
    name: 'Elliptical Trainer',
    aliases: ["elliptical"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Legs","Arms"],
    equipmentRequired: ["Elliptical Machine"],
    difficulty: 'Beginner',
    instructions: 'Use the handles and pedals in a smooth, continuous motion.',
    safetyNotes: 'Maintain an upright posture.'
  },
  {
    id: 'jump-rope',
    name: 'Jump Rope',
    aliases: ["skipping"],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Calves"],
    equipmentRequired: ["Jump Rope"],
    difficulty: 'Beginner',
    instructions: 'Turn the rope with your wrists and jump slightly off the ground.',
    safetyNotes: 'Jump on the balls of your feet.'
  },
  {
    id: 'rowing-machine',
    name: 'Rowing Machine',
    aliases: ["erg"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Back","Legs"],
    equipmentRequired: ["Rowing Machine"],
    difficulty: 'Beginner',
    instructions: 'Push with your legs, lean back slightly, and pull the handle to your chest.',
    safetyNotes: 'Use a fluid push-pull sequence.'
  },
  {
    id: 'battle-ropes',
    name: 'Battle Ropes',
    aliases: [],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Shoulders","Core"],
    equipmentRequired: ["Battle Ropes"],
    difficulty: 'Intermediate',
    instructions: 'Hold the ropes and create waves by alternately raising and lowering your arms.',
    safetyNotes: 'Keep a firm stance.'
  },
  {
    id: 'mountain-climbers',
    name: 'Mountain Climbers',
    aliases: [],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Core"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Start in a push-up position. Quickly alternate bringing your knees toward your chest.',
    safetyNotes: 'Keep your hips down.'
  },
  {
    id: 'jumping-jacks',
    name: 'Jumping Jacks',
    aliases: [],
    environments: ["Gym","Home Workout","Calisthenics"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Full Body"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Jump your legs apart while raising your arms overhead, then jump back.',
    safetyNotes: 'Land softly.'
  },
  {
    id: 'box-jumps',
    name: 'Box Jumps',
    aliases: [],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Legs"],
    equipmentRequired: ["Plyo Box"],
    difficulty: 'Intermediate',
    instructions: 'Stand facing a box. Squat slightly and jump onto the box, landing softly.',
    safetyNotes: 'Step down to minimize achilles strain.'
  },
  {
    id: 'sled-pushes',
    name: 'Sled Pushes',
    aliases: ["prowler push"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Quads","Glutes"],
    equipmentRequired: ["Sled"],
    difficulty: 'Intermediate',
    instructions: 'Grip the sled handles. Drive forward with your legs.',
    safetyNotes: 'Keep your spine neutral.'
  },
  {
    id: 'assault-bike-intervals',
    name: 'Assault Bike Intervals',
    aliases: ["air bike"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Full Body"],
    equipmentRequired: ["Assault Bike"],
    difficulty: 'Advanced',
    instructions: 'Sprint with maximal effort using both arms and legs, followed by a rest period.',
    safetyNotes: 'Pace your rest intervals.'
  },
  {
    id: 'sprint-intervals',
    name: 'Sprint Intervals',
    aliases: ["sprints"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Legs"],
    equipmentRequired: ["Treadmill","Track"],
    difficulty: 'Advanced',
    instructions: 'Sprint at near-maximum speed for a short duration, then recover.',
    safetyNotes: 'Warm up thoroughly.'
  },
  {
    id: 'shadow-boxing',
    name: 'Shadow Boxing',
    aliases: [],
    environments: ["Gym","Home Workout"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Shoulders"],
    equipmentRequired: ["None"],
    difficulty: 'Beginner',
    instructions: 'Throw combinations of punches into the air while moving your feet.',
    safetyNotes: 'Do not lock out your elbows completely on punches.'
  },
  {
    id: 'stair-climber',
    name: 'Stair Climber',
    aliases: ["step machine"],
    environments: ["Gym"],
    targetMuscle: 'Cardio',
    targetMuscles: ["Cardio","Legs","Glutes"],
    equipmentRequired: ["Stair Climber Machine"],
    difficulty: 'Beginner',
    instructions: 'Climb the rotating steps at a steady pace.',
    safetyNotes: 'Try not to lean heavily on the handrails.'
  }
];

const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

const gymCategories = [
  { name: 'Push - Chest', items: [['barbell-bench-press', '8-12'], ['incline-dumbbell-press', '10-12'], ['flat-dumbbell-press', '10-12'], ['decline-bench-press', '8-12'], ['cable-chest-fly', '12-15'], ['pec-deck-fly', '12-15'], ['chest-dips', '8-12'], ['push-up', '10-15']] },
  { name: 'Push - Shoulders', items: [['dumbbell-shoulder-press', '10-12'], ['overhead-barbell-press', '8-12'], ['dumbbell-lateral-raises', '12-15'], ['front-raises', '12-15'], ['arnold-press', '10-12'], ['cable-lateral-raises', '12-15']] },
  { name: 'Push - Triceps', items: [['rope-pushdown', '12-15'], ['overhead-triceps-extension', '10-12'], ['skull-crushers', '10-12'], ['close-grip-bench-press', '8-12'], ['triceps-dips', '8-12']] },
  { name: 'Pull - Back', items: [['lat-pulldown', '10-12'], ['seated-cable-row', '10-12'], ['one-arm-dumbbell-row', '10-12'], ['barbell-bent-over-row', '8-12'], ['t-bar-row', '8-12'], ['pull-up', '6-12'], ['straight-arm-pulldown', '12-15'], ['deadlift', '5-8'], ['chest-supported-row', '10-12']] },
  { name: 'Pull - Biceps & Forearms', items: [['dumbbell-biceps-curl', '10-12'], ['barbell-curl', '10-12'], ['hammer-curl', '10-12'], ['preacher-curl', '10-12'], ['concentration-curl', '12-15'], ['incline-dumbbell-curl', '10-12'], ['reverse-curl', '12-15'], ['wrist-curl', '15-20']] },
  { name: 'Pull - Rear Shoulders & Traps', items: [['face-pulls', '12-15'], ['reverse-pec-deck', '12-15'], ['rear-delt-fly', '12-15'], ['dumbbell-shrugs', '12-15']] },
  { name: 'Legs', items: [['bodyweight-squat', '15'], ['barbell-back-squat', '8-12'], ['goblet-squat', '10-12'], ['leg-press', '10-12'], ['hack-squat', '10-12'], ['leg-extension', '12-15'], ['walking-lunges', '10 each side'], ['bulgarian-split-squat', '10 each side'], ['romanian-deadlift', '8-12'], ['lying-leg-curl', '12-15'], ['seated-leg-curl', '12-15'], ['hip-thrust', '10-12'], ['glute-bridge', '15'], ['standing-calf-raise', '15-20'], ['seated-calf-raise', '15-20'], ['step-ups', '10 each side']] },
  { name: 'Full Body', items: [['barbell-back-squat', '10'], ['deadlift', '5-8'], ['dumbbell-thrusters', '10'], ['flat-dumbbell-press', '12'], ['push-up', '15'], ['pull-up', '6-10'], ['seated-cable-row', '12'], ['kettlebell-swings', '15'], ['dumbbell-clean-and-press', '10'], ['farmers-walk', '30 sec'], ['renegade-rows', '10'], ['burpees', '10']] },
  { name: 'Core & Abs', items: [['forearm-plank', '30-60 sec'], ['side-plank', '30 sec per side'], ['crunches', '15'], ['reverse-crunches', '15'], ['leg-raises', '12'], ['russian-twists', '20'], ['bicycle-crunches', '20'], ['cable-crunches', '15'], ['hanging-knee-raises', '12'], ['ab-wheel-rollout', '10']] },
  { name: 'Conditioning', items: [['treadmill-incline-walking', '15-25 min'], ['stationary-cycling', '15-20 min'], ['elliptical-trainer', '15-20 min'], ['jump-rope', '5-10 min'], ['rowing-machine', '10-15 min'], ['battle-ropes', '5 x 20 sec'], ['mountain-climbers', '3 x 30 sec'], ['jumping-jacks', '3 x 30 sec'], ['box-jumps', '3 x 8'], ['sled-pushes', '4 x 20 m'], ['assault-bike-intervals', '6 x 20 sec'], ['sprint-intervals', '5 x 20 sec'], ['shadow-boxing', '3 x 2 min'], ['stair-climber', '10-15 min']] },
];

const gymProgrammingById = new Map();
const categoryRest = {
  'Push - Chest': '90-150 sec',
  'Push - Shoulders': '60-120 sec',
  'Push - Triceps': '60-90 sec',
  'Pull - Back': '90-180 sec',
  'Pull - Biceps & Forearms': '60-90 sec',
  'Pull - Rear Shoulders & Traps': '60-90 sec',
  Legs: '90-180 sec',
  'Full Body': '90-180 sec',
  'Core & Abs': '30-90 sec',
  Conditioning: 'Recover until breathing and technique are controlled.',
};
for (const category of gymCategories) {
  for (const [id, reps] of category.items) {
    if (!gymProgrammingById.has(id)) gymProgrammingById.set(id, []);
    const interval = reps.match(/^(\d+)\s+x\s+(.+)$/);
    const sets = interval ? Number(interval[1]) : 3;
    const prescription = reps.includes('min') && !interval ? 1 : sets;
    gymProgrammingById.get(id).push({
      category: category.name,
      sets: prescription,
      reps: interval ? interval[2] : reps,
      rest: categoryRest[category.name],
    });
  }
}

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
      targetMuscle: exercise.targetMuscle,
      targetMuscles: exercise.targetMuscles || [],
      equipmentRequired: exercise.equipmentRequired || [],
      difficulty: exercise.difficulty,
      safetyNotes: exercise.safetyNotes,
      movementPattern: exercise.movementPattern || '',
      secondaryMuscles: exercise.secondaryMuscles || [],
      startingPosition: exercise.startingPosition || '',
      executionSteps: exercise.executionSteps || [],
      breathing: exercise.breathing || '',
      commonMistakes: exercise.commonMistakes || [],
      prerequisites: exercise.prerequisites || '',
      alternatives: exercise.alternatives || [],
    };
  }
  return {
    ...value,
    exerciseId: exercise.id,
    imageUrl: imageUrlFor(exercise),
    instructions: exercise.instructions,
    targetMuscle: exercise.targetMuscle,
    targetMuscles: exercise.targetMuscles || [],
    equipmentRequired: exercise.equipmentRequired || [],
    difficulty: exercise.difficulty,
    safetyNotes: exercise.safetyNotes,
    movementPattern: exercise.movementPattern || '',
    secondaryMuscles: exercise.secondaryMuscles || [],
    startingPosition: exercise.startingPosition || '',
    executionSteps: exercise.executionSteps || [],
    breathing: exercise.breathing || '',
    commonMistakes: exercise.commonMistakes || [],
    prerequisites: exercise.prerequisites || '',
    alternatives: exercise.alternatives || [],
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
  return exercises.map(({ id, name, environments, targetMuscle, targetMuscles, equipmentRequired, difficulty, instructions, safetyNotes, movementPattern, secondaryMuscles, startingPosition, executionSteps, breathing, commonMistakes, prerequisites, alternatives }) => ({
    id,
    name,
    environments: [...environments],
    imageUrl: imageUrlFor({ id }),
    instructions,
    targetMuscle,
    targetMuscles: [...targetMuscles],
    equipmentRequired: [...equipmentRequired],
    difficulty,
    safetyNotes,
    movementPattern: movementPattern || '',
    secondaryMuscles: secondaryMuscles || [],
    startingPosition: startingPosition || '',
    executionSteps: executionSteps || [],
    breathing: breathing || '',
    commonMistakes: commonMistakes || [],
    prerequisites: prerequisites || '',
    alternatives: alternatives || [],
    gymProgramming: gymProgrammingById.get(id) || [],
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
