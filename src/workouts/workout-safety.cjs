const NONE_VALUES = /^(none|no|no injuries?|no medical conditions?|prefer not to disclose|not applicable|n\/a)$/i;

const SCREENED_CONDITIONS = /diabetes|prediabetes|blood pressure|hypertension|asthma|arthritis|osteoporosis|back pain|herniated disc|knee pain|shoulder injury|musculoskeletal injury|parkinson|cervical spondylosis|sciatica|plantar fasciitis|tennis elbow/i;
const CLEARANCE_CONDITIONS = /heart disease|cardiac|recent surgery|pregnan|stroke rehabilitation/i;
const CLEARANCE_INJURIES = /replacement recovery|acl rehabilitation|fracture recovery|stroke rehabilitation|shoulder (injury )?rehabilitation/i;

function disclosed(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value).trim())
    .filter((value) => value && !NONE_VALUES.test(value));
}

function confirmed(value) {
  return /^(yes|confirmed|professional clearance confirmed|cleared)$/i.test(String(value || '').trim());
}

function isHistorical(status) {
  return /historical|resolved|past/i.test(String(status || ''));
}

function buildRestrictions(profile, conditions, injuries) {
  const activeConditions = /historical|resolved|past/i.test(String(profile.healthConditionStatus || ''))
    ? []
    : conditions;
  const activeInjuries = isHistorical(profile.injuryStatus) ? [] : injuries;
  const text = [
    ...activeConditions,
    ...activeInjuries,
    profile.healthConditionRestrictions,
    profile.injuryRestrictions,
  ].filter(Boolean).join(' ').toLowerCase();
  const groups = new Set();

  if (/knee|acl|leg joint/.test(text)) groups.add('knee');
  if (/shoulder|rotator cuff|frozen shoulder/.test(text)) groups.add('shoulder');
  if (/back|disc|sciatica|spondylosis/.test(text)) groups.add('back');
  if (/osteoporosis|fracture/.test(text)) groups.add('bone');
  if (/hip replacement|hip injury/.test(text)) groups.add('hip');
  if (/plantar fasciitis|foot injury|ankle injury/.test(text)) groups.add('foot');
  if (/parkinson|stroke/.test(text)) groups.add('balance');
  if (/tennis elbow|elbow injury/.test(text)) groups.add('elbow');
  if (/low impact|avoid high impact/.test(text)) groups.add('low_impact');

  const restrictionsText = [
    profile.healthConditionRestrictions,
    profile.injuryRestrictions,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/avoid|no|limit/.test(restrictionsText)) {
    if (/knee flexion|squat|lunge|leg press|knee extension/.test(restrictionsText)) groups.add('knee');
    if (/overhead|shoulder|press|dip|fly|raise/.test(restrictionsText)) groups.add('shoulder');
    if (/spinal flexion|back|deadlift|hinge|bent.over row/.test(restrictionsText)) groups.add('back');
    if (/balance|fall risk/.test(restrictionsText)) groups.add('balance');
    if (/elbow|curl|grip/.test(restrictionsText)) groups.add('elbow');
    if (/foot|ankle|calf|plantar/.test(restrictionsText)) groups.add('foot');
    if (/hip/.test(restrictionsText)) groups.add('hip');
    if (/low impact|avoid high impact/.test(restrictionsText)) groups.add('low_impact');
  }

  return [...groups];
}

function restrictionsAreActionable(value) {
  const text = String(value || '').trim();
  return /^(none|no restrictions|no exercise restrictions|not applicable|n\/a)$/i.test(text)
    || /knee|squat|lunge|leg press|flexion|extension|shoulder|overhead|press|dip|fly|raise|back|spinal|deadlift|hinge|row|balance|fall|elbow|curl|grip|foot|ankle|calf|plantar|hip|impact|intensity|load|weight|range of motion/i.test(text);
}

function evaluateWorkoutSafety(profile = {}) {
  const conditions = disclosed(profile.healthConditions);
  if (profile.otherHealthCondition) conditions.push(String(profile.otherHealthCondition).trim());
  const injuries = disclosed(profile.injuries);
  if (profile.otherInjury) injuries.push(String(profile.otherInjury).trim());
  const healthStatus = String(profile.healthConditionStatus || '').trim().toLowerCase();
  const injuryStatus = String(profile.injuryStatus || '').trim().toLowerCase();
  const healthClearance = confirmed(profile.healthConditionClearedToExercise);
  const injuryClearance = confirmed(profile.injuryClearedToExercise);
  const healthRestrictions = String(profile.healthConditionRestrictions || '').trim();
  const injuryRestrictions = String(profile.injuryRestrictions || '').trim();

  if (conditions.some((condition) => /^other$/i.test(condition)) && !profile.otherHealthCondition?.trim()) {
    return {
      state: 'screening_required',
      code: 'HEALTH_SCREENING_REQUIRED',
      message: 'Specify the selected health condition before a workout can be screened.',
      requiredScreening: ['otherHealthCondition'],
      restrictions: [],
    };
  }
  if (injuries.some((injury) => /^other$/i.test(injury)) && !profile.otherInjury?.trim()) {
    return {
      state: 'screening_required',
      code: 'INJURY_SCREENING_REQUIRED',
      message: 'Specify the selected injury or rehabilitation need before a workout can be screened.',
      requiredScreening: ['otherInjury', 'injuryStatus'],
      restrictions: [],
    };
  }

  const clearanceCondition = conditions.some((condition) => CLEARANCE_CONDITIONS.test(condition));
  if (clearanceCondition && !healthClearance) {
    return {
      state: 'clearance_required',
      code: 'PROFESSIONAL_CLEARANCE_REQUIRED',
      message: 'Please confirm professional exercise clearance and enter any prescribed restrictions before a plan is assigned.',
      requiredScreening: ['healthConditionClearedToExercise', 'healthConditionRestrictions'],
      restrictions: buildRestrictions(profile, conditions, injuries),
    };
  }
  if (clearanceCondition && !restrictionsAreActionable(healthRestrictions)) {
    return {
      state: 'screening_required',
      code: 'EXERCISE_RESTRICTIONS_REQUIRED',
      message: 'Add the exercise limits provided by your health professional so the plan can stay within them.',
      requiredScreening: ['healthConditionRestrictions'],
      restrictions: buildRestrictions(profile, conditions, injuries),
    };
  }

  if (
    conditions.some((condition) => /osteoarthritis|rheumatoid arthritis|current musculoskeletal injury/i.test(condition))
    && !(/^(none|no restrictions|no exercise restrictions|not applicable|n\/a)$/i.test(healthRestrictions)
      || /knee|hip|shoulder|elbow|spine|back|ankle|foot|wrist/i.test(healthRestrictions))
  ) {
    return {
      state: 'screening_required',
      code: 'EXERCISE_RESTRICTIONS_REQUIRED',
      message: 'Identify the affected joint or current exercise restrictions so unsuitable movements can be left out.',
      requiredScreening: ['healthConditionRestrictions'],
      restrictions: buildRestrictions(profile, conditions, injuries),
    };
  }

  if (healthStatus === 'current symptoms' || healthStatus === 'not sure') {
    return {
      state: 'screening_required',
      code: 'HEALTH_SCREENING_REQUIRED',
      message: 'Review your current symptoms and exercise guidance in workout preferences before a plan is assigned.',
      requiredScreening: ['healthConditionStatus', 'healthConditionRestrictions'],
      restrictions: buildRestrictions(profile, conditions, injuries),
    };
  }

  if (conditions.some((condition) => SCREENED_CONDITIONS.test(condition)) && !healthStatus) {
    return {
      state: 'screening_required',
      code: 'HEALTH_SCREENING_REQUIRED',
      message: 'Confirm whether the selected condition is stable, and add any exercise restrictions that apply.',
      requiredScreening: ['healthConditionStatus'],
      restrictions: buildRestrictions(profile, conditions, injuries),
    };
  }

  if (injuries.length > 0 && !isHistorical(injuryStatus)) {
    if (!injuryStatus) {
      return {
        state: 'screening_required',
        code: 'INJURY_SCREENING_REQUIRED',
        message: 'Mark the selected injury as current or historical and enter any current exercise restrictions.',
        requiredScreening: ['injuryStatus', 'injuryRestrictions'],
        restrictions: buildRestrictions(profile, conditions, injuries),
      };
    }

    const clearanceInjury = injuries.some((injury) => CLEARANCE_INJURIES.test(injury))
      || /active rehabilitation|recovering|recovery/i.test(injuryStatus);
    if (clearanceInjury && !injuryClearance) {
      return {
        state: 'clearance_required',
        code: 'PROFESSIONAL_CLEARANCE_REQUIRED',
        message: 'Active recovery or rehabilitation needs professional exercise clearance before a general workout is assigned.',
        requiredScreening: ['injuryClearedToExercise', 'injuryRestrictions'],
        restrictions: buildRestrictions(profile, conditions, injuries),
      };
    }
    if (clearanceInjury && !restrictionsAreActionable(injuryRestrictions)) {
      return {
        state: 'screening_required',
        code: 'EXERCISE_RESTRICTIONS_REQUIRED',
        message: 'Enter the professionally approved exercise restrictions before a plan is assigned.',
        requiredScreening: ['injuryRestrictions'],
        restrictions: buildRestrictions(profile, conditions, injuries),
      };
    }
    if (!restrictionsAreActionable(injuryRestrictions)) {
      return {
        state: 'screening_required',
        code: 'INJURY_RESTRICTIONS_REQUIRED',
        message: 'Add current exercise restrictions or confirm that there are none before a plan is assigned.',
        requiredScreening: ['injuryRestrictions', 'injuryClearedToExercise'],
        restrictions: buildRestrictions(profile, conditions, injuries),
      };
    }
  }

  return {
    state: 'ready',
    code: 'WORKOUT_READY',
    message: '',
    requiredScreening: [],
    restrictions: buildRestrictions(profile, conditions, injuries),
    disclosedConditions: conditions,
    disclosedInjuries: injuries,
  };
}

function isExerciseEligible(exercise, restrictions = []) {
  const pattern = String(exercise.movementPattern || '').toLowerCase();
  const name = `${exercise.name || ''} ${exercise.id || ''}`.toLowerCase();
  const has = (group) => restrictions.includes(group);

  if (has('knee') && /squat|lunge|knee extension|knee flexion/.test(pattern)) return false;
  if (has('shoulder') && /push|adduction|abduction|shoulder|vertical pull/.test(pattern)) return false;
  if (has('back') && (
    /hip hinge|squat|lunge/.test(pattern)
    || /deadlift|bent.over row|t.bar row|one.arm dumbbell row/.test(name)
  )) return false;
  if (has('bone') && (
    /hip hinge/.test(pattern)
    || /deadlift|bent.over row|t.bar row/.test(name)
  )) return false;
  if (has('hip') && /squat|lunge|hip hinge/.test(pattern)) return false;
  if (has('foot') && /lunge|plantar flexion/.test(pattern)) return false;
  if (has('balance') && /lunge/.test(pattern)) return false;
  if (has('elbow') && /elbow flexion|elbow extension/.test(pattern)) return false;

  return true;
}

function buildExerciseSafetyNotes(exercise, assessment) {
  const notes = [exercise.safetyNotes || 'Use controlled technique and a comfortable range of motion.'];
  const conditions = assessment.disclosedConditions || [];
  if (conditions.some((condition) => /blood pressure|hypertension/i.test(condition))) {
    notes.push('Breathe continuously and avoid breath-holding during exertion.');
  }
  if (conditions.some((condition) => /asthma/i.test(condition))) {
    notes.push('Follow your asthma action plan and stop if breathing symptoms occur.');
  }
  if (conditions.some((condition) => /diabetes|prediabetes/i.test(condition))) {
    notes.push("Follow your clinician's guidance for exercise and stop if you feel unwell.");
  }
  if (assessment.restrictions.length > 0) {
    notes.push('Stay within your documented exercise restrictions and stop if symptoms worsen.');
  }
  return [...new Set(notes)].join(' ');
}

module.exports = {
  buildExerciseSafetyNotes,
  evaluateWorkoutSafety,
  isExerciseEligible,
};
