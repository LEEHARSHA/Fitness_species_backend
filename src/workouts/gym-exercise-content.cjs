const { getSourceInventory } = require('./gym-workout-program.cjs');

const draftDetails = {
  'barbell-bench-press': {
    targetMuscles: ['Pectoralis major'],
    secondaryMuscles: ['Triceps brachii', 'Anterior deltoid'],
    equipmentRequired: ['Barbell', 'Flat bench', 'Rack with safety arms'],
    difficulty: 'Intermediate',
    movementPattern: 'Horizontal push',
    startingPosition: 'Lie on the flat bench with eyes under the racked bar, feet firmly planted on the floor, shoulder blades retracted, and hands gripping the bar slightly wider than shoulder width.',
    executionSteps: [
      'Unrack the bar and position it over the mid-chest.',
      'Lower the bar under control until it lightly touches the mid-chest, keeping elbows tucked at roughly a 45-degree angle.',
      'Press the bar upward explosively until arms are fully extended without locking the elbows forcefully.'
    ],
    commonMistakes: [
      'Bouncing the bar off the chest.',
      'Flaring elbows out at 90 degrees.',
      'Lifting the glutes off the bench.'
    ],
    safetyNotes: 'Always use a spotter or safety arms when lifting heavy. Ensure a proper grip to prevent the bar from slipping.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'incline-dumbbell-press': {
    targetMuscles: ['Pectoralis major (clavicular head)'],
    secondaryMuscles: ['Anterior deltoid', 'Triceps brachii'],
    equipmentRequired: ['Dumbbells', 'Incline bench'],
    difficulty: 'Beginner',
    movementPattern: 'Incline horizontal push',
    startingPosition: 'Set an adjustable bench to a 30-45 degree incline. Sit with dumbbells resting on thighs. Kick the weights up to shoulder level and lie back.',
    executionSteps: [
      'Press the dumbbells upward and slightly inward until arms are fully extended over the upper chest.',
      'Slowly lower the dumbbells back to the starting position until a stretch is felt in the chest.'
    ],
    commonMistakes: [
      'Setting the bench incline too high, shifting focus to the front deltoids.',
      'Clashing the dumbbells together at the top.'
    ],
    safetyNotes: 'Control the descent phase. Do not drop the weights abruptly when finishing the set to protect the rotator cuffs.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'flat-dumbbell-press': {
    targetMuscles: ['Pectoralis major (sternal head)'],
    secondaryMuscles: ['Anterior deltoid', 'Triceps brachii'],
    equipmentRequired: ['Dumbbells', 'Flat bench'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal push',
    startingPosition: 'Sit on a flat bench with a dumbbell in each hand resting on your thighs. Lie back while bringing the weights to shoulder level.',
    executionSteps: [
      'Press the dumbbells straight up until your arms are fully extended.',
      'Lower the dumbbells slowly to the sides of your chest in a controlled manner.'
    ],
    commonMistakes: [
      'Dropping the weights too quickly.',
      'Failing to keep the wrists straight and stable.'
    ],
    safetyNotes: 'Keep feet flat on the floor for stability. Engage the core to avoid arching the lower back excessively.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'cable-chest-fly': {
    targetMuscles: ['Pectoralis major'],
    secondaryMuscles: ['Anterior deltoid'],
    equipmentRequired: ['Cable machine', 'D-handles'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal adduction',
    startingPosition: 'Set pulleys to chest height or slightly lower. Stand in the center with a split stance for balance, holding a handle in each hand with arms slightly bent.',
    executionSteps: [
      'Bring your hands together in a wide arc in front of your chest, squeezing the pecs.',
      'Slowly return to the starting position until a stretch is felt in the chest.'
    ],
    commonMistakes: [
      'Pressing the weight instead of flying.',
      'Using momentum or bending the elbows excessively.'
    ],
    safetyNotes: 'Avoid overstretching the shoulders at the bottom of the movement. Keep the elbow bend constant.',
    restInterval: '60-90s',
    resistanceType: 'Cable',
  },
  'rope-pushdown': {
    targetMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    equipmentRequired: ['Cable machine', 'Rope attachment'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow extension',
    startingPosition: 'Stand facing a high pulley machine holding the rope attachment. Tuck your elbows in close to your sides.',
    executionSteps: [
      'Push the rope downward until your arms are fully extended, pulling the rope ends apart at the bottom to maximize triceps contraction.',
      'Slowly return the rope to the starting position.'
    ],
    commonMistakes: [
      'Moving the upper arms or elbows away from the body.',
      'Using body weight to press the cable down.'
    ],
    safetyNotes: 'Maintain a straight posture and brace the core. Do not let the weight stack slam on the return.',
    restInterval: '60-90s',
    resistanceType: 'Cable',
  },
  'skull-crushers': {
    targetMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    equipmentRequired: ['EZ-bar or barbell', 'Flat bench'],
    difficulty: 'Intermediate',
    movementPattern: 'Elbow extension',
    startingPosition: 'Lie on a flat bench holding an EZ-bar above your chest with a relatively narrow, overhand grip. Keep your arms fully extended.',
    executionSteps: [
      'Keeping your upper arms stationary and elbows pointing forward, lower the bar by bending your elbows until it is just above your forehead.',
      'Extend your elbows to press the bar back to the starting position.'
    ],
    commonMistakes: [
      'Moving the elbows or upper arms during the movement.',
      'Lowering the bar too fast.'
    ],
    safetyNotes: 'Perform with a spotter if lifting heavy to prevent dropping the bar on your face or head. Ensure a firm grip.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'close-grip-bench-press': {
    targetMuscles: ['Triceps brachii', 'Pectoralis major'],
    secondaryMuscles: ['Anterior deltoid'],
    equipmentRequired: ['Barbell', 'Flat bench', 'Rack with safety arms'],
    difficulty: 'Intermediate',
    movementPattern: 'Horizontal push',
    startingPosition: 'Lie on a flat bench and grip the barbell slightly narrower than shoulder-width. Unrack the bar and hold it over your chest.',
    executionSteps: [
      'Lower the bar to your lower chest while keeping your elbows tucked close to your body.',
      'Press the bar back up until your arms are fully extended.'
    ],
    commonMistakes: [
      'Using a grip that is too narrow, which can cause wrist strain.',
      'Flaring the elbows outward.'
    ],
    safetyNotes: 'Use a spotter or safety arms. Maintain control of the bar at all times.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'deadlift': {
    targetMuscles: ['Gluteus maximus', 'Hamstrings', 'Erector spinae'],
    secondaryMuscles: ['Quadriceps', 'Trapezius', 'Latissimus dorsi', 'Core'],
    equipmentRequired: ['Barbell', 'Weight plates'],
    difficulty: 'Advanced',
    movementPattern: 'Hip hinge',
    startingPosition: 'Stand with your mid-foot under the barbell, feet shoulder-width apart. Bend at the hips and knees to grip the bar. Keep your back straight, chest up, and core braced.',
    executionSteps: [
      'Drive through your heels, extending your hips and knees simultaneously to lift the bar.',
      'Keep the bar close to your body as you stand up straight. Lock out your hips at the top.',
      'Hinge at the hips to lower the bar back to the ground under control.'
    ],
    commonMistakes: [
      'Rounding the lower back.',
      'Letting the bar drift away from the legs.',
      'Hyperextending the back at the top.'
    ],
    safetyNotes: 'Maintain a neutral spine throughout the movement. If you experience lower back pain, stop and assess your form.',
    restInterval: '120-180s',
    resistanceType: 'Free weight',
  },
  'lat-pulldown': {
    targetMuscles: ['Latissimus dorsi'],
    secondaryMuscles: ['Biceps brachii', 'Trapezius', 'Rhomboids'],
    equipmentRequired: ['Lat pulldown machine'],
    difficulty: 'Beginner',
    movementPattern: 'Vertical pull',
    startingPosition: 'Sit at a lat pulldown machine and adjust the knee pad. Grasp the wide bar with an overhand grip, slightly wider than shoulder-width.',
    executionSteps: [
      'Pull the bar down towards your upper chest, squeezing your shoulder blades together and keeping your chest up.',
      'Slowly return the bar to the starting position, allowing your lats to stretch fully.'
    ],
    commonMistakes: [
      'Pulling the bar behind the neck.',
      'Using momentum by leaning back too far.',
      'Not using a full range of motion.'
    ],
    safetyNotes: 'Keep your movements controlled. Avoid jerking the weight.',
    restInterval: '90-120s',
    resistanceType: 'Cable/Machine',
  },
  'seated-cable-row': {
    targetMuscles: ['Latissimus dorsi', 'Rhomboids', 'Trapezius'],
    secondaryMuscles: ['Biceps brachii', 'Posterior deltoid'],
    equipmentRequired: ['Seated row machine', 'V-handle or straight bar'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal pull',
    startingPosition: 'Sit on the machine bench with your knees slightly bent. Grasp the handle, keep your back straight, and lean back slightly.',
    executionSteps: [
      'Pull the handle towards your lower abdomen, squeezing your shoulder blades together.',
      'Slowly return to the starting position, allowing your arms to fully extend and your shoulder blades to protract.'
    ],
    commonMistakes: [
      'Rounding the back.',
      'Using the lower back to jerk the weight backwards.',
      'Pulling with the biceps rather than the back.'
    ],
    safetyNotes: 'Maintain a neutral spine and avoid excessive torso movement.',
    restInterval: '90-120s',
    resistanceType: 'Cable',
  },
  'one-arm-dumbbell-row': {
    targetMuscles: ['Latissimus dorsi', 'Rhomboids'],
    secondaryMuscles: ['Biceps brachii', 'Posterior deltoid', 'Trapezius'],
    equipmentRequired: ['Dumbbell', 'Flat bench'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal pull',
    startingPosition: 'Place one knee and the same-side hand on a flat bench. Keep your back straight and parallel to the floor. Hold a dumbbell in the opposite hand with your arm fully extended.',
    executionSteps: [
      'Pull the dumbbell straight up to the side of your chest, keeping your elbow close to your body.',
      'Lower the dumbbell back down in a controlled manner to the starting position.'
    ],
    commonMistakes: [
      'Twisting the torso to lift the weight.',
      'Pulling the weight towards the shoulder rather than the hip.',
      'Rounding the lower back.'
    ],
    safetyNotes: 'Keep your core engaged to stabilize the spine.',
    restInterval: '60-90s (per arm)',
    resistanceType: 'Free weight',
  },
  'barbell-curl': {
    targetMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Brachioradialis'],
    equipmentRequired: ['Barbell'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Stand up straight with your feet shoulder-width apart. Hold a barbell with an underhand grip, hands shoulder-width apart, arms fully extended down.',
    executionSteps: [
      'Curl the barbell up towards your shoulders while keeping your upper arms stationary.',
      'Squeeze your biceps at the top of the movement.',
      'Slowly lower the barbell back to the starting position.'
    ],
    commonMistakes: [
      'Swinging the body to use momentum.',
      'Moving the elbows forward during the curl.'
    ],
    safetyNotes: 'Maintain a straight posture. Do not lean back as you lift the weight.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'dumbbell-biceps-curl': {
    targetMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Brachioradialis'],
    equipmentRequired: ['Dumbbells'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Stand holding a dumbbell in each hand with your arms fully extended and palms facing forward (supinated grip).',
    executionSteps: [
      'Curl the dumbbells up towards your shoulders, keeping your upper arms stationary and elbows close to your sides.',
      'Squeeze your biceps at the top, then slowly lower the dumbbells back down.'
    ],
    commonMistakes: [
      'Swinging the weights or using the back to lift.',
      'Not fully extending the arms at the bottom.'
    ],
    safetyNotes: 'Keep your core braced and avoid arching your back.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'hammer-curl': {
    targetMuscles: ['Brachialis', 'Brachioradialis'],
    secondaryMuscles: ['Biceps brachii'],
    equipmentRequired: ['Dumbbells'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Stand holding a dumbbell in each hand by your sides with a neutral grip (palms facing your body).',
    executionSteps: [
      'Curl the dumbbells up towards your shoulders while maintaining the neutral grip.',
      'Squeeze at the top, then slowly lower the weights back to the starting position.'
    ],
    commonMistakes: [
      'Swinging the body or shoulders.',
      'Turning the wrists during the movement.'
    ],
    safetyNotes: 'Keep your elbows tucked into your sides throughout the movement.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'barbell-back-squat': {
    targetMuscles: ['Quadriceps', 'Gluteus maximus'],
    secondaryMuscles: ['Hamstrings', 'Adductors', 'Core', 'Erector spinae'],
    equipmentRequired: ['Barbell', 'Squat rack'],
    difficulty: 'Intermediate',
    movementPattern: 'Squat',
    startingPosition: 'Rest a barbell on your upper back/traps. Stand with feet slightly wider than shoulder-width, toes pointed slightly outward. Brace your core.',
    executionSteps: [
      'Hinge at the hips and bend your knees to lower your body as if sitting in a chair.',
      'Descend until your thighs are at least parallel to the floor, keeping your chest up and back straight.',
      'Drive through your heels to stand back up to the starting position.'
    ],
    commonMistakes: [
      'Letting the knees cave inward (valgus collapse).',
      'Rounding the lower back (butt wink).',
      'Not squatting deep enough.'
    ],
    safetyNotes: 'Always use safety pins or a spotter when squatting heavy. Keep your chest up to avoid folding forward.',
    restInterval: '120-180s',
    resistanceType: 'Free weight',
  },
  'leg-press': {
    targetMuscles: ['Quadriceps'],
    secondaryMuscles: ['Gluteus maximus', 'Hamstrings', 'Adductors'],
    equipmentRequired: ['Leg press machine'],
    difficulty: 'Beginner',
    movementPattern: 'Squat',
    startingPosition: 'Sit in the leg press machine with your back flat against the pad. Place your feet shoulder-width apart on the sled platform.',
    executionSteps: [
      'Release the safety catches and lower the sled towards you by bending your knees.',
      'Descend until your knees are at a 90-degree angle, or slightly deeper if comfortable.',
      'Push the sled back up by extending your hips and knees, stopping just short of locking out your knees.'
    ],
    commonMistakes: [
      'Locking the knees out forcefully at the top.',
      'Lowering the sled too far, causing the lower back to round off the pad.'
    ],
    safetyNotes: 'Keep your lower back firmly pressed against the pad at all times.',
    restInterval: '90-120s',
    resistanceType: 'Machine',
  },
  'leg-extension': {
    targetMuscles: ['Quadriceps'],
    secondaryMuscles: [],
    equipmentRequired: ['Leg extension machine'],
    difficulty: 'Beginner',
    movementPattern: 'Knee extension',
    startingPosition: 'Sit on the machine with your back against the pad. Place the front of your lower legs under the padded lever, aligning your knees with the machine\'s axis of rotation.',
    executionSteps: [
      'Extend your legs straight out in front of you by contracting your quadriceps.',
      'Hold the contracted position briefly at the top.',
      'Slowly lower the weight back to the starting position.'
    ],
    commonMistakes: [
      'Using momentum to swing the weight up.',
      'Not controlling the eccentric (lowering) phase.'
    ],
    safetyNotes: 'Avoid over-extending the knees. If you have knee issues, use light weight and controlled movements.',
    restInterval: '60-90s',
    resistanceType: 'Machine',
  },
  'romanian-deadlift': {
    targetMuscles: ['Hamstrings', 'Gluteus maximus'],
    secondaryMuscles: ['Erector spinae', 'Core'],
    equipmentRequired: ['Barbell', 'Weight plates'],
    difficulty: 'Intermediate',
    movementPattern: 'Hip hinge',
    startingPosition: 'Stand holding a barbell with an overhand grip in front of your thighs. Feet should be hip-width apart with a slight bend in your knees.',
    executionSteps: [
      'Hinge at your hips, pushing your glutes back and keeping your back perfectly straight. Lower the barbell down the front of your legs.',
      'Descend until you feel a deep stretch in your hamstrings.',
      'Drive your hips forward to return to the standing position, squeezing your glutes at the top.'
    ],
    commonMistakes: [
      'Bending the knees too much, turning it into a squat.',
      'Rounding the back.',
      'Allowing the bar to drift away from the body.'
    ],
    safetyNotes: 'Keep a neutral spine throughout. Only lower the bar as far as your hamstring flexibility allows without rounding your back.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'dumbbell-shoulder-press': {
    targetMuscles: ['Anterior deltoid', 'Lateral deltoid'],
    secondaryMuscles: ['Triceps brachii', 'Upper trapezius'],
    equipmentRequired: ['Dumbbells', 'Bench with back support'],
    difficulty: 'Beginner',
    movementPattern: 'Vertical push',
    startingPosition: 'Sit on a bench with back support, holding a dumbbell in each hand at shoulder level. Palms should be facing forward.',
    executionSteps: [
      'Press the dumbbells straight up above your head until your arms are fully extended.',
      'Slowly lower the dumbbells back to shoulder level.'
    ],
    commonMistakes: [
      'Arching the lower back excessively to press the weight.',
      'Clashing the dumbbells together at the top.',
      'Not lowering the dumbbells far enough.'
    ],
    safetyNotes: 'Keep your core tight and back pressed against the bench. Do not use momentum to jerk the weights up.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'dumbbell-lateral-raises': {
    targetMuscles: ['Lateral deltoid'],
    secondaryMuscles: ['Anterior deltoid', 'Supraspinatus', 'Upper trapezius'],
    equipmentRequired: ['Dumbbells'],
    difficulty: 'Beginner',
    movementPattern: 'Shoulder abduction',
    startingPosition: 'Stand tall with a dumbbell in each hand resting by your sides, palms facing inward. Keep a slight bend in your elbows.',
    executionSteps: [
      'Raise your arms straight out to the sides until they reach shoulder height, keeping the slight bend in your elbows.',
      'Pause briefly at the top, then slowly lower the dumbbells back to the starting position.'
    ],
    commonMistakes: [
      'Using momentum to swing the weights up.',
      'Raising the arms higher than shoulder level, which engages the traps more than the delts.',
      'Locking the elbows straight.'
    ],
    safetyNotes: 'Use a weight you can control. Lead with the elbows rather than the hands.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'front-raises': {
    targetMuscles: ['Anterior deltoid'],
    secondaryMuscles: ['Lateral deltoid', 'Pectoralis major (clavicular head)'],
    equipmentRequired: ['Dumbbells'],
    difficulty: 'Beginner',
    movementPattern: 'Shoulder flexion',
    startingPosition: 'Stand holding dumbbells in front of your thighs with an overhand grip (palms facing your legs). Keep a slight bend in your elbows.',
    executionSteps: [
      'Raise one or both dumbbells straight up in front of you until your arms are parallel to the floor.',
      'Lower the dumbbells slowly back to the starting position.'
    ],
    commonMistakes: [
      'Leaning back to lift the weight.',
      'Swinging the dumbbells.'
    ],
    safetyNotes: 'Keep your torso still and focus on using only the shoulder muscles to lift.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'decline-bench-press': {
    targetMuscles: ['Pectoralis major (sternal/lower head)'],
    secondaryMuscles: ['Triceps brachii', 'Anterior deltoid'],
    equipmentRequired: ['Barbell', 'Decline bench', 'Rack'],
    difficulty: 'Intermediate',
    movementPattern: 'Horizontal push',
    startingPosition: 'Lie on a decline bench and secure your feet. Grip the barbell slightly wider than shoulder-width and unrack it.',
    executionSteps: [
      'Lower the bar to your lower chest, keeping your elbows tucked at roughly 45 degrees.',
      'Press the bar back up until your arms are fully extended.'
    ],
    commonMistakes: [
      'Bouncing the bar off the chest.',
      'Flaring elbows too wide.'
    ],
    safetyNotes: 'Use a spotter, especially when lifting heavy on a decline. Ensure your feet are securely hooked.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'pec-deck-fly': {
    targetMuscles: ['Pectoralis major'],
    secondaryMuscles: ['Anterior deltoid'],
    equipmentRequired: ['Pec deck machine'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal adduction',
    startingPosition: 'Sit on the machine with your back flat against the pad. Grasp the handles with your elbows slightly bent and aligned with your shoulders.',
    executionSteps: [
      'Squeeze your chest and bring the handles together in front of you.',
      'Pause, then slowly return to the starting position until you feel a stretch in your chest.'
    ],
    commonMistakes: [
      'Straightening the arms fully.',
      'Using momentum instead of controlled muscle contraction.'
    ],
    safetyNotes: 'Do not overstretch the shoulders on the eccentric portion of the movement.',
    restInterval: '60-90s',
    resistanceType: 'Machine',
  },
  'chest-dips': {
    targetMuscles: ['Pectoralis major', 'Triceps brachii'],
    secondaryMuscles: ['Anterior deltoid'],
    equipmentRequired: ['Dip station'],
    difficulty: 'Intermediate',
    movementPattern: 'Vertical push',
    startingPosition: 'Mount the dip station and hold your body up with arms fully extended. Lean your torso forward slightly to target the chest.',
    executionSteps: [
      'Lower your body by bending your elbows until your shoulders are slightly below your elbows.',
      'Push yourself back up to the starting position.'
    ],
    commonMistakes: [
      'Staying too upright, which shifts focus to the triceps.',
      'Dropping down too fast.'
    ],
    safetyNotes: 'Avoid going too deep to protect the shoulder joints. Keep the core engaged.',
    restInterval: '90-120s',
    resistanceType: 'Bodyweight',
  },
  'push-up': {
    targetMuscles: ['Pectoralis major', 'Triceps brachii'],
    secondaryMuscles: ['Anterior deltoid', 'Core'],
    equipmentRequired: ['None'],
    difficulty: 'Beginner',
    movementPattern: 'Horizontal push',
    startingPosition: 'Get into a high plank position with hands slightly wider than shoulder-width apart and your body in a straight line.',
    executionSteps: [
      'Lower your body until your chest nearly touches the floor, keeping your elbows at roughly a 45-degree angle.',
      'Push back up to the starting position.'
    ],
    commonMistakes: [
      'Sagging the hips.',
      'Flaring the elbows out 90 degrees.',
      'Not going all the way down.'
    ],
    safetyNotes: 'Maintain a rigid core and neutral spine. Modify by dropping to knees if needed.',
    restInterval: '60-90s',
    resistanceType: 'Bodyweight',
  },
  'overhead-triceps-extension': {
    targetMuscles: ['Triceps brachii (long head focus)'],
    secondaryMuscles: [],
    equipmentRequired: ['Dumbbell'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow extension',
    startingPosition: 'Sit or stand holding one dumbbell with both hands overhead, arms fully extended.',
    executionSteps: [
      'Lower the dumbbell behind your head by bending your elbows, keeping your upper arms stationary.',
      'Extend your elbows to press the dumbbell back to the overhead starting position.'
    ],
    commonMistakes: [
      'Flaring elbows out excessively.',
      'Moving the upper arms during the movement.'
    ],
    safetyNotes: 'Ensure a secure grip on the dumbbell. Keep the core tight to avoid arching the lower back.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'triceps-dips': {
    targetMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Pectoralis major', 'Anterior deltoid'],
    equipmentRequired: ['Dip station'],
    difficulty: 'Intermediate',
    movementPattern: 'Vertical push',
    startingPosition: 'Mount the dip station with arms fully extended. Keep your torso as upright as possible.',
    executionSteps: [
      'Lower your body by bending your elbows until they reach a 90-degree angle.',
      'Push yourself back up to the starting position, focusing on contracting the triceps.'
    ],
    commonMistakes: [
      'Leaning forward too much, shifting focus to the chest.',
      'Going too deep and stressing the shoulders.'
    ],
    safetyNotes: 'Control the descent. If you have shoulder issues, limit the range of motion or avoid this exercise.',
    restInterval: '90-120s',
    resistanceType: 'Bodyweight',
  },
  'bench-dips': {
    targetMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Anterior deltoid', 'Pectoralis major'],
    equipmentRequired: ['Flat bench'],
    difficulty: 'Beginner',
    movementPattern: 'Vertical push',
    startingPosition: 'Place your hands on the edge of a bench behind you, fingers facing forward. Extend your legs straight out in front of you.',
    executionSteps: [
      'Lower your body by bending your elbows until they reach a 90-degree angle.',
      'Push back up until your arms are fully extended.'
    ],
    commonMistakes: [
      'Letting the hips drift far away from the bench.',
      'Dropping the shoulders forward at the bottom.'
    ],
    safetyNotes: 'Keep your back close to the bench. Limit depth if you feel discomfort in the front of your shoulders.',
    restInterval: '60-90s',
    resistanceType: 'Bodyweight',
  },
  'barbell-bent-over-row': {
    targetMuscles: ['Latissimus dorsi', 'Rhomboids', 'Trapezius'],
    secondaryMuscles: ['Erector spinae', 'Biceps brachii', 'Posterior deltoid'],
    equipmentRequired: ['Barbell'],
    difficulty: 'Intermediate',
    movementPattern: 'Horizontal pull',
    startingPosition: 'Hold a barbell with an overhand grip. Hinge at the hips, keeping your back straight and nearly parallel to the floor, knees slightly bent.',
    executionSteps: [
      'Pull the barbell towards your lower chest or upper abdomen, squeezing your shoulder blades together.',
      'Slowly lower the barbell back to the starting position.'
    ],
    commonMistakes: [
      'Rounding the lower back.',
      'Standing up too straight during the set.',
      'Jerking the weight up.'
    ],
    safetyNotes: 'Maintain a strong brace in your core. Do not perform if you have lower back pain.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  't-bar-row': {
    targetMuscles: ['Latissimus dorsi', 'Rhomboids', 'Middle trapezius'],
    secondaryMuscles: ['Biceps brachii', 'Posterior deltoid', 'Erector spinae'],
    equipmentRequired: ['T-bar row machine or landmine setup'],
    difficulty: 'Intermediate',
    movementPattern: 'Horizontal pull',
    startingPosition: 'Straddle the bar. Hinge at the hips with a flat back and grasp the handles.',
    executionSteps: [
      'Pull the weight towards your chest, squeezing the back muscles.',
      'Lower the weight under control until your arms are fully extended.'
    ],
    commonMistakes: [
      'Rounding the back.',
      'Using too much momentum or moving the torso up and down.'
    ],
    safetyNotes: 'Keep a neutral spine and braced core.',
    restInterval: '90-120s',
    resistanceType: 'Machine/Free weight',
  },
  'pull-up': {
    targetMuscles: ['Latissimus dorsi'],
    secondaryMuscles: ['Biceps brachii', 'Trapezius', 'Rhomboids', 'Core'],
    equipmentRequired: ['Pull-up bar'],
    difficulty: 'Intermediate',
    movementPattern: 'Vertical pull',
    startingPosition: 'Hang from a pull-up bar with an overhand grip, hands slightly wider than shoulder-width.',
    executionSteps: [
      'Pull your body up until your chin is above the bar, focusing on driving your elbows down.',
      'Lower your body under control back to a full dead hang.'
    ],
    commonMistakes: [
      'Kipping or swinging.',
      'Not using a full range of motion.'
    ],
    safetyNotes: 'Control the descent. Avoid dropping into the bottom position aggressively.',
    restInterval: '90-120s',
    resistanceType: 'Bodyweight',
  },
  'straight-arm-pulldown': {
    targetMuscles: ['Latissimus dorsi'],
    secondaryMuscles: ['Teres major', 'Triceps brachii (long head)'],
    equipmentRequired: ['Cable machine', 'Straight bar or rope'],
    difficulty: 'Beginner',
    movementPattern: 'Shoulder extension',
    startingPosition: 'Stand facing a high pulley holding a straight bar with an overhand grip. Take a step back and bend slightly at the hips, keeping arms straight with a slight bend in the elbows.',
    executionSteps: [
      'Pull the bar down in an arc towards your thighs, keeping your arms straight.',
      'Slowly return the bar to the starting position until you feel a stretch in your lats.'
    ],
    commonMistakes: [
      'Bending the elbows and turning it into a triceps pushdown.',
      'Using the lower back to swing the weight.'
    ],
    safetyNotes: 'Keep your core braced and torso stationary throughout.',
    restInterval: '60-90s',
    resistanceType: 'Cable',
  },
  'preacher-curl': {
    targetMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Brachioradialis'],
    equipmentRequired: ['Preacher bench', 'EZ-bar or dumbbells'],
    difficulty: 'Intermediate',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Sit at a preacher bench and rest your upper arms on the pad. Grasp the bar with an underhand grip.',
    executionSteps: [
      'Curl the bar upwards towards your shoulders, keeping your upper arms firmly on the pad.',
      'Lower the bar slowly until your arms are fully extended.'
    ],
    commonMistakes: [
      'Lifting the upper arms off the pad.',
      'Bouncing the weight out of the bottom position.'
    ],
    safetyNotes: 'Do not hyperextend the elbows at the bottom of the movement.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'concentration-curl': {
    targetMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    equipmentRequired: ['Dumbbell', 'Flat bench'],
    difficulty: 'Beginner',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Sit on a bench with your legs spread. Rest the back of your working arm on the inside of your thigh, holding a dumbbell.',
    executionSteps: [
      'Curl the dumbbell up towards your chest, isolating the bicep.',
      'Squeeze at the top, then lower the dumbbell slowly back down.'
    ],
    commonMistakes: [
      'Swinging the body.',
      'Lifting the elbow off the thigh.'
    ],
    safetyNotes: 'Ensure your arm is firmly supported to isolate the bicep effectively.',
    restInterval: '60-90s (per arm)',
    resistanceType: 'Free weight',
  },
  'incline-dumbbell-curl': {
    targetMuscles: ['Biceps brachii (long head focus)'],
    secondaryMuscles: ['Brachialis'],
    equipmentRequired: ['Dumbbells', 'Incline bench'],
    difficulty: 'Intermediate',
    movementPattern: 'Elbow flexion',
    startingPosition: 'Set a bench to a 45-degree incline. Sit back holding a dumbbell in each hand, letting your arms hang straight down, palms facing forward.',
    executionSteps: [
      'Curl the dumbbells up towards your shoulders while keeping your upper arms stationary.',
      'Lower the dumbbells slowly back to the full stretch position.'
    ],
    commonMistakes: [
      'Moving the elbows forward during the curl.',
      'Not extending the arms fully at the bottom.'
    ],
    safetyNotes: 'If you feel discomfort in your shoulders at the bottom, reduce the incline or the weight.',
    restInterval: '60-90s',
    resistanceType: 'Free weight',
  },
  'hack-squat': {
    targetMuscles: ['Quadriceps'],
    secondaryMuscles: ['Gluteus maximus', 'Hamstrings', 'Calves'],
    equipmentRequired: ['Hack squat machine'],
    difficulty: 'Intermediate',
    movementPattern: 'Squat',
    startingPosition: 'Position your back and shoulders against the machine pads. Place your feet shoulder-width apart on the platform.',
    executionSteps: [
      'Release the safety handles and lower the carriage by bending your knees until your thighs are at least parallel to the platform.',
      'Drive through your heels to push the carriage back up.'
    ],
    commonMistakes: [
      'Letting the knees cave inward.',
      'Rounding the lower back off the pad.'
    ],
    safetyNotes: 'Keep your back flat against the pad at all times. Do not lock your knees forcefully at the top.',
    restInterval: '90-120s',
    resistanceType: 'Machine',
  },
  'walking-lunges': {
    targetMuscles: ['Quadriceps', 'Gluteus maximus'],
    secondaryMuscles: ['Hamstrings', 'Calves', 'Core'],
    equipmentRequired: ['Dumbbells (optional)'],
    difficulty: 'Intermediate',
    movementPattern: 'Lunge',
    startingPosition: 'Stand tall with your feet together, holding dumbbells by your sides if using weight.',
    executionSteps: [
      'Take a large step forward with one leg and lower your hips until both knees are bent at a 90-degree angle.',
      'Push off your front foot to bring your back foot forward, stepping into the next lunge.'
    ],
    commonMistakes: [
      'Taking steps that are too short or too long.',
      'Letting the front knee track far past the toes.',
      'Dropping the chest forward.'
    ],
    safetyNotes: 'Maintain an upright posture. If you struggle with balance, perform stationary lunges first.',
    restInterval: '90-120s',
    resistanceType: 'Free weight / Bodyweight',
  },
  'bulgarian-split-squat': {
    targetMuscles: ['Quadriceps', 'Gluteus maximus'],
    secondaryMuscles: ['Hamstrings', 'Core', 'Stabilizers'],
    equipmentRequired: ['Dumbbells', 'Bench or box'],
    difficulty: 'Intermediate',
    movementPattern: 'Lunge',
    startingPosition: 'Stand a couple of feet in front of a bench. Place the top of one foot on the bench behind you. Hold dumbbells by your sides.',
    executionSteps: [
      'Lower your body by bending your front knee until your front thigh is parallel to the floor.',
      'Push through your front heel to return to the starting position.'
    ],
    commonMistakes: [
      'Placing the front foot too close or too far from the bench.',
      'Leaning too far forward.'
    ],
    safetyNotes: 'Focus on balance. Start with bodyweight if new to the movement.',
    restInterval: '90-120s (per leg)',
    resistanceType: 'Free weight',
  },
  'lying-leg-curl': {
    targetMuscles: ['Hamstrings'],
    secondaryMuscles: ['Gastrocnemius'],
    equipmentRequired: ['Lying leg curl machine'],
    difficulty: 'Beginner',
    movementPattern: 'Knee flexion',
    startingPosition: 'Lie face down on the machine pad. Hook your heels under the roller pad. Align your knees with the machine pivot point.',
    executionSteps: [
      'Curl your legs upwards towards your glutes as far as possible.',
      'Squeeze your hamstrings at the top, then slowly lower the weight back down.'
    ],
    commonMistakes: [
      'Lifting the hips off the pad to lift the weight.',
      'Moving too quickly and using momentum.'
    ],
    safetyNotes: 'Keep your hips pressed firmly into the pad to prevent lower back strain.',
    restInterval: '60-90s',
    resistanceType: 'Machine',
  },
  'seated-leg-curl': {
    targetMuscles: ['Hamstrings'],
    secondaryMuscles: ['Gastrocnemius'],
    equipmentRequired: ['Seated leg curl machine'],
    difficulty: 'Beginner',
    movementPattern: 'Knee flexion',
    startingPosition: 'Sit in the machine and adjust the back pad so your knees align with the pivot point. Rest your legs on top of the padded lever and lower the thigh pad securely over your legs.',
    executionSteps: [
      'Pull the lever down and back towards you by flexing your knees.',
      'Squeeze at the bottom, then slowly return to the starting position.'
    ],
    commonMistakes: [
      'Not using a full range of motion.',
      'Allowing the weight stack to slam at the top.'
    ],
    safetyNotes: 'Ensure the thigh pad is secure to prevent your body from lifting out of the seat.',
    restInterval: '60-90s',
    resistanceType: 'Machine',
  },
  'hip-thrust': {
    targetMuscles: ['Gluteus maximus'],
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipmentRequired: ['Barbell', 'Bench', 'Barbell pad'],
    difficulty: 'Intermediate',
    movementPattern: 'Hip extension',
    startingPosition: 'Sit on the floor with your upper back resting against a bench. Roll a padded barbell over your hips. Plant your feet flat on the floor, shoulder-width apart.',
    executionSteps: [
      'Drive through your heels to extend your hips upwards until your body forms a straight line from your shoulders to your knees.',
      'Squeeze your glutes hard at the top.',
      'Lower your hips back down in a controlled manner.'
    ],
    commonMistakes: [
      'Overarching the lower back at the top.',
      'Not extending the hips fully.',
      'Placing feet too far away or too close.'
    ],
    safetyNotes: 'Keep your chin tucked and ribs down to maintain a neutral spine. Use a thick pad for the barbell.',
    restInterval: '90-120s',
    resistanceType: 'Free weight',
  },
  'standing-calf-raise': {
    targetMuscles: ['Gastrocnemius'],
    secondaryMuscles: ['Soleus'],
    equipmentRequired: ['Calf raise machine or step'],
    difficulty: 'Beginner',
    movementPattern: 'Plantar flexion',
    startingPosition: 'Stand on the edge of a step or machine platform with the balls of your feet. Let your heels drop down as far as possible for a stretch.',
    executionSteps: [
      'Push up onto your toes as high as possible, contracting your calves.',
      'Hold the contraction briefly at the top.',
      'Slowly lower your heels back below the level of the platform.'
    ],
    commonMistakes: [
      'Bouncing at the bottom.',
      'Bending the knees to use the quads.',
      'Not using a full range of motion.'
    ],
    safetyNotes: 'Maintain control, especially on the descent, to avoid Achilles tendon strain.',
    restInterval: '60-90s',
    resistanceType: 'Machine / Bodyweight',
  }
};

module.exports = getSourceInventory().map((source) => {
  const details = draftDetails[source.id];
  if (!details) {
    throw new Error(`Missing metadata for ${source.id}`);
  }
  return {
    id: source.id,
    imageAssetId: source.id,
    name: source.name,
    sourceName: source.name,
    day: source.day,
    dayIndex: source.dayIndex,
    focus: source.focus,
    sourceSets: source.sourceSets,
    sourceReps: source.sourceReps,
    targetMuscles: details.targetMuscles,
    secondaryMuscles: details.secondaryMuscles,
    equipmentRequired: details.equipmentRequired,
    difficulty: details.difficulty,
    movementPattern: details.movementPattern,
    startingPosition: details.startingPosition,
    executionSteps: details.executionSteps,
    commonMistakes: details.commonMistakes,
    safetyNotes: details.safetyNotes,
    restInterval: details.restInterval,
    resistanceType: details.resistanceType,
    breathing: details.breathing || 'Breathe out through the effort and in through the controlled return; avoid prolonged breath-holding.',
  };
});
