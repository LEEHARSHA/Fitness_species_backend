const fs = require('fs');

const dataStr = `CalisthenicsExerciseInfo("Wall Push-up", "Beginner", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Incline Push-up", "Beginner", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Knee Push-up", "Beginner", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Standard Push-up", "Beginner", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Wide Push-up", "Beginner", "Push")
CalisthenicsExerciseInfo("Diamond Knee Push-up", "Beginner", "Push")
CalisthenicsExerciseInfo("Elevated Push-up Hold", "Beginner", "Push")
CalisthenicsExerciseInfo("Scapular Push-up", "Beginner", "Push")
CalisthenicsExerciseInfo("Shoulder Tap Push-up", "Beginner", "Push")
CalisthenicsExerciseInfo("Push-up Plus", "Beginner", "Push")
CalisthenicsExerciseInfo("Dead Hang", "Beginner", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Active Hang", "Beginner", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Australian Row", "Beginner", "Pull", progressionPath = "Pull")
CalisthenicsExerciseInfo("Incline Body Row", "Beginner", "Pull")
CalisthenicsExerciseInfo("Towel Row", "Beginner", "Pull")
CalisthenicsExerciseInfo("Resistance Band Row", "Beginner", "Pull", listOf("Resistance Bands"))
CalisthenicsExerciseInfo("Negative Pull-up", "Beginner", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Assisted Pull-up", "Beginner", "Pull", listOf("Pull-up Bar", "Resistance Bands"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Scapular Pull-up", "Beginner", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Band Face Pull", "Beginner", "Pull", listOf("Resistance Bands"))
CalisthenicsExerciseInfo("Bodyweight Squat", "Beginner", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Box Squat", "Beginner", "Legs", listOf("Chair"))
CalisthenicsExerciseInfo("Assisted Split Squat", "Beginner", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Reverse Lunge", "Beginner", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Walking Lunge", "Beginner", "Legs")
CalisthenicsExerciseInfo("Step-up", "Beginner", "Legs", listOf("Chair"))
CalisthenicsExerciseInfo("Glute Bridge", "Beginner", "Legs")
CalisthenicsExerciseInfo("Single-leg Glute Bridge", "Beginner", "Legs")
CalisthenicsExerciseInfo("Standing Calf Raise", "Beginner", "Legs")
CalisthenicsExerciseInfo("Wall Sit", "Beginner", "Legs")
CalisthenicsExerciseInfo("Plank", "Beginner", "Core", progressionPath = "Core")
CalisthenicsExerciseInfo("Side Plank", "Beginner", "Core")
CalisthenicsExerciseInfo("Dead Bug", "Beginner", "Core", progressionPath = "Core")
CalisthenicsExerciseInfo("Bird Dog", "Beginner", "Core")
CalisthenicsExerciseInfo("Hollow Hold", "Beginner", "Core", progressionPath = "Core")
CalisthenicsExerciseInfo("Reverse Crunch", "Beginner", "Core")
CalisthenicsExerciseInfo("Knee Raises", "Beginner", "Core")
CalisthenicsExerciseInfo("Heel Touches", "Beginner", "Core")
CalisthenicsExerciseInfo("Bent Knee Leg Raise", "Beginner", "Core")
CalisthenicsExerciseInfo("Mountain Climbers", "Beginner", "Core")
CalisthenicsExerciseInfo("Modified Burpees", "Beginner", "Full Body")
CalisthenicsExerciseInfo("Bear Crawl", "Beginner", "Full Body")
CalisthenicsExerciseInfo("Crab Walk", "Beginner", "Full Body")
CalisthenicsExerciseInfo("High Knees", "Beginner", "Full Body")
CalisthenicsExerciseInfo("Jumping Jacks", "Beginner", "Full Body")
CalisthenicsExerciseInfo("Skater Steps", "Beginner", "Full Body")
CalisthenicsExerciseInfo("Decline Push-up", "Intermediate", "Push", listOf("Chair"), progressionPath = "Push")
CalisthenicsExerciseInfo("Archer Push-up", "Intermediate", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Diamond Push-up", "Intermediate", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Pike Push-up", "Intermediate", "Push")
CalisthenicsExerciseInfo("Hindu Push-up", "Intermediate", "Push")
CalisthenicsExerciseInfo("Explosive Push-up", "Intermediate", "Push")
CalisthenicsExerciseInfo("Clap Push-up", "Intermediate", "Push")
CalisthenicsExerciseInfo("Pseudo Planche Push-up", "Intermediate", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Ring Push-up", "Intermediate", "Push", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("Korean Dip", "Intermediate", "Push", listOf("Pull-up Bar"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Chin-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Neutral Grip Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Archer Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Commando Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Chest-to-Bar Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Wide Grip Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Close Grip Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Typewriter Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Towel Pull-up", "Intermediate", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Bench Dip", "Intermediate", "Push", listOf("Chair"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Parallel Bar Dip", "Intermediate", "Push", listOf("Dip Bars"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Ring Dip", "Intermediate", "Push", listOf("Gymnastic Rings"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Straight Bar Dip", "Intermediate", "Push", listOf("Pull-up Bar"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Deep Dip", "Intermediate", "Push", listOf("Dip Bars"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Bulgarian Split Squat", "Intermediate", "Legs", listOf("Chair"), progressionPath = "Squat")
CalisthenicsExerciseInfo("Cossack Squat", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Jump Squat", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Shrimp Squat", "Intermediate", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Assisted Pistol Squat", "Intermediate", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Nordic Curl", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Single-leg Romanian Deadlift", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Broad Jump", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Box Jump", "Intermediate", "Legs", listOf("Chair"))
CalisthenicsExerciseInfo("Jump Lunge", "Intermediate", "Legs")
CalisthenicsExerciseInfo("Hanging Knee Raise", "Intermediate", "Core", listOf("Pull-up Bar"), progressionPath = "Core")
CalisthenicsExerciseInfo("Hanging Leg Raise", "Intermediate", "Core", listOf("Pull-up Bar"), progressionPath = "Core")
CalisthenicsExerciseInfo("Partial Toes to Bar", "Intermediate", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Dragon Flag Negative", "Intermediate", "Core")
CalisthenicsExerciseInfo("V-Up", "Intermediate", "Core")
CalisthenicsExerciseInfo("Hollow Rocks", "Intermediate", "Core")
CalisthenicsExerciseInfo("Bent Windshield Wipers", "Intermediate", "Core")
CalisthenicsExerciseInfo("Tucked L-Sit", "Intermediate", "Core", listOf("Parallettes"), progressionPath = "Core")
CalisthenicsExerciseInfo("Plank Reach", "Intermediate", "Core")
CalisthenicsExerciseInfo("Hanging Oblique Raise", "Intermediate", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Burpee Push-up", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("Bear Crawl Push-up", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("Jump Lunges", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("Broad Jump Burpee", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("Monkey Crawl", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("Shuttle Runs", "Intermediate", "Full Body")
CalisthenicsExerciseInfo("One Arm Push-up", "Advanced", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Planche Lean Push-up", "Advanced", "Push")
CalisthenicsExerciseInfo("Planche Push-up", "Advanced", "Push", progressionPath = "Push")
CalisthenicsExerciseInfo("Handstand Push-up", "Advanced", "Push", listOf("Wall"))
CalisthenicsExerciseInfo("Deficit Handstand Push-up", "Advanced", "Push", listOf("Parallettes"))
CalisthenicsExerciseInfo("90 Degree Push-up", "Advanced", "Push")
CalisthenicsExerciseInfo("Tiger Bend Push-up", "Advanced", "Push")
CalisthenicsExerciseInfo("Maltese Push-up", "Advanced", "Push")
CalisthenicsExerciseInfo("Impossible Dip", "Advanced", "Push", listOf("Pull-up Bar"), progressionPath = "Dip")
CalisthenicsExerciseInfo("Ring Handstand Push-up", "Advanced", "Push", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("Muscle-up", "Advanced", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Strict Muscle-up", "Advanced", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Ring Muscle-up", "Advanced", "Pull", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("One Arm Pull-up", "Advanced", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Front Lever Pull-up", "Advanced", "Pull", listOf("Pull-up Bar"), progressionPath = "Pull")
CalisthenicsExerciseInfo("Archer Muscle-up", "Advanced", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Advanced Typewriter Pull-up", "Advanced", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Ice Cream Makers", "Advanced", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Front Lever Rows", "Advanced", "Pull", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Victorian Pull Progression", "Advanced", "Pull", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("Handstand", "Advanced", "Static Skills")
CalisthenicsExerciseInfo("Freestanding Handstand", "Advanced", "Static Skills")
CalisthenicsExerciseInfo("Wall Handstand", "Advanced", "Static Skills", listOf("Wall"))
CalisthenicsExerciseInfo("Handstand Walk", "Advanced", "Static Skills")
CalisthenicsExerciseInfo("Planche", "Advanced", "Static Skills")
CalisthenicsExerciseInfo("Tuck Planche", "Advanced", "Static Skills", listOf("Parallettes"))
CalisthenicsExerciseInfo("Advanced Tuck Planche", "Advanced", "Static Skills", listOf("Parallettes"))
CalisthenicsExerciseInfo("Straddle Planche", "Advanced", "Static Skills", listOf("Parallettes"))
CalisthenicsExerciseInfo("Front Lever", "Advanced", "Static Skills", listOf("Pull-up Bar"), progressionPath = "Core")
CalisthenicsExerciseInfo("Back Lever", "Advanced", "Static Skills", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Human Flag", "Advanced", "Static Skills", listOf("Pull-up Bar"), progressionPath = "Core")
CalisthenicsExerciseInfo("Iron Cross", "Advanced", "Static Skills", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("Victorian", "Advanced", "Static Skills", listOf("Gymnastic Rings"))
CalisthenicsExerciseInfo("Elbow Lever", "Advanced", "Static Skills")
CalisthenicsExerciseInfo("Pistol Squat", "Advanced", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Elevated Pistol Squat", "Advanced", "Legs", listOf("Chair"))
CalisthenicsExerciseInfo("Dragon Squat", "Advanced", "Legs", progressionPath = "Squat")
CalisthenicsExerciseInfo("Natural Leg Extension", "Advanced", "Legs")
CalisthenicsExerciseInfo("Sissy Squat", "Advanced", "Legs")
CalisthenicsExerciseInfo("Jump Pistol Squat", "Advanced", "Legs")
CalisthenicsExerciseInfo("Single-leg Box Jump", "Advanced", "Legs", listOf("Chair"))
CalisthenicsExerciseInfo("Advanced Shrimp Squat", "Advanced", "Legs")
CalisthenicsExerciseInfo("Dragon Flag", "Advanced", "Core", progressionPath = "Core")
CalisthenicsExerciseInfo("Full L-Sit", "Advanced", "Core", listOf("Parallettes"), progressionPath = "Core")
CalisthenicsExerciseInfo("V-Sit", "Advanced", "Core", listOf("Parallettes"))
CalisthenicsExerciseInfo("Hanging Toes to Bar", "Advanced", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Front Lever Hold", "Advanced", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Front Lever Raise", "Advanced", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Human Flag Hold", "Advanced", "Core", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Advanced Windshield Wipers", "Advanced", "Core")
CalisthenicsExerciseInfo("Advanced Hollow Rocks", "Advanced", "Core")
CalisthenicsExerciseInfo("Compression Hold", "Advanced", "Core")
CalisthenicsExerciseInfo("Muscle-up Burpee", "Advanced", "Explosive", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Plyometric Pull-up", "Advanced", "Explosive", listOf("Pull-up Bar"))
CalisthenicsExerciseInfo("Superman Push-up", "Advanced", "Explosive")
CalisthenicsExerciseInfo("Double Clap Push-up", "Advanced", "Explosive")
CalisthenicsExerciseInfo("360 Push-up", "Advanced", "Explosive")
CalisthenicsExerciseInfo("Box Jump to Muscle-up", "Advanced", "Explosive", listOf("Chair", "Pull-up Bar"))
CalisthenicsExerciseInfo("Handstand Walk Sprint", "Advanced", "Explosive")
CalisthenicsExerciseInfo("Wall Run", "Advanced", "Explosive", listOf("Wall"))
CalisthenicsExerciseInfo("Kong Vault", "Advanced", "Explosive")
CalisthenicsExerciseInfo("Precision Jump", "Advanced", "Explosive")`;

const extracted = [];
dataStr.split('\n').forEach(line => {
    if (!line.trim()) return;
    const parts = line.split('"');
    const name = parts[1];
    const level = parts[3];
    const category = parts[5];

    const hasEquipment = line.includes('listOf(');
    let equipment = ["None"];
    if (hasEquipment) {
        const eqStr = line.substring(line.indexOf('listOf(') + 7, line.indexOf(')'));
        equipment = eqStr.split(',').map(s => s.replace(/"/g, '').trim());
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const ex = {
        id,
        name,
        environments: ["Calisthenics"],
        targetMuscle: category === "Push" ? "Chest/Triceps" :
                      category === "Pull" ? "Back/Biceps" :
                      category === "Legs" ? "Quads/Hamstrings" :
                      category === "Core" ? "Core" : "Full Body",
        targetMuscles: category === "Push" ? ["Chest", "Triceps", "Shoulders"] :
                       category === "Pull" ? ["Back", "Biceps"] :
                       category === "Legs" ? ["Quads", "Hamstrings", "Glutes"] :
                       category === "Core" ? ["Core"] : ["Full Body"],
        equipmentRequired: equipment,
        difficulty: level,
        instructions: "Maintain full body tension. Focus on quality over quantity. Keep the core engaged.",
        safetyNotes: "Stop if you feel sharp pain in the joints. Progress slowly.",
        movementPattern: category,
        secondaryMuscles: [],
        startingPosition: equipment.includes("None") ? "Start on the floor." : `Grab the ${equipment[0]}.`,
        executionSteps: ["Initiate the movement with control.", "Hold the peak contraction.", "Return smoothly."],
        breathing: "Inhale before the concentric phase, exhale during exertion.",
        commonMistakes: ["Using momentum", "Arching the lower back"],
        prerequisites: level === "Beginner" ? "None" : `Mastery of Beginner ${category} movements`,
        alternatives: ["Easier progression variant", "Resistance band assistance"]
    };
    extracted.push(ex);
});

fs.writeFileSync('D:/FitnessSpeciesBackend/scripts/calisthenics_exercises.json', JSON.stringify(extracted, null, 2));
console.log("Extracted " + extracted.length + " calisthenics exercises.");
