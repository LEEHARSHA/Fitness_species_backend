const fs = require('node:fs');
const path = require('node:path');
const exercises = require('../src/workouts/gym-exercise-content.cjs');

const outputDirectory = path.resolve(__dirname, '../src/workouts/exercise-images/drafts');

const sceneById = {
  'barbell-bench-press': 'bench-press',
  'incline-dumbbell-press': 'incline-press',
  'low-to-high-cable-fly': 'low-high-fly',
  'machine-chest-press': 'machine-press',
  'close-grip-bench-press': 'bench-press',
  'weighted-triceps-dips': 'dip',
  'overhead-cable-rope-extension': 'overhead-extension',
  'barbell-bent-over-row': 'hinge-row',
  'one-arm-dumbbell-row': 'one-arm-row',
  'wide-grip-lat-pulldown': 'lat-pulldown',
  'cable-straight-arm-pulldown': 'straight-arm-pulldown',
  'seated-alternating-dumbbell-curl': 'seated-curl',
  'concentration-curl': 'concentration-curl',
  'cable-rope-curl': 'cable-curl',
  'front-squat': 'front-squat',
  'low-foot-leg-press': 'leg-press',
  'dumbbell-walking-lunge': 'walking-lunge',
  'leg-extension': 'leg-extension',
  'seated-dumbbell-shoulder-press': 'seated-press',
  'cable-lateral-raise': 'cable-lateral-raise',
  'ez-bar-upright-row': 'upright-row',
  'incline-machine-press': 'machine-press',
  'pec-deck-fly': 'pec-deck',
  'feet-elevated-push-up': 'elevated-push-up',
  'standing-cable-chest-press': 'standing-cable-press',
  'ez-bar-skull-crusher': 'skull-crusher',
  'single-arm-cable-pushdown': 'cable-pushdown',
  'dumbbell-triceps-kickback': 'kickback',
  'neutral-grip-pull-up': 'pull-up',
  'cable-seated-row': 'seated-row',
  'chest-supported-t-bar-row': 'supported-t-row',
  'behind-the-back-cable-row': 'behind-back-row',
  'incline-dumbbell-curl': 'incline-curl',
  'barbell-curl': 'standing-curl',
  'reverse-ez-bar-curl': 'reverse-curl',
  'barbell-romanian-deadlift': 'romanian-deadlift',
  'lying-leg-curl': 'lying-leg-curl',
  'dumbbell-step-up': 'step-up',
  'cable-glute-kickback': 'cable-kickback',
  'standing-overhead-barbell-press': 'standing-overhead-press',
  'reverse-pec-deck': 'reverse-pec-deck',
  'dumbbell-lateral-raise-dropset': 'lateral-raise',
};

function rect(x, y, width, height, fill, radius = 0) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>`;
}

function line(x1, y1, x2, y2, color = '#283044', width = 8) {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function head(x, y) {
  return `<circle cx="${x}" cy="${y}" r="19" fill="#E9B99D" stroke="#283044" stroke-width="3"/>`;
}

function torso(x, y, angle = 0) {
  return `<path d="M${x - 24} ${y - 5} Q${x} ${y - 20} ${x + 25} ${y - 5} L${x + 29} ${y + 60} Q${x} ${y + 75} ${x - 29} ${y + 60} Z" fill="#704BFF" stroke="#283044" stroke-width="4" transform="rotate(${angle} ${x} ${y + 25})"/>`;
}

function drawFigure(cx, floorY, scene, phase) {
  const top = 118;
  const isLow = phase === 'end' && ['front-squat', 'walking-lunge', 'leg-press', 'leg-extension', 'lying-leg-curl'].includes(scene);
  const kneeY = isLow ? floorY - 58 : floorY - 88;
  const bodyY = ['bench-press', 'incline-press', 'skull-crusher', 'pec-deck', 'reverse-pec-deck', 'leg-extension', 'lying-leg-curl', 'leg-press'].includes(scene)
    ? floorY - 205
    : floorY - 210;
  const horizontal = ['bench-press', 'incline-press', 'skull-crusher'].includes(scene);
  const bent = ['hinge-row', 'one-arm-row', 'supported-t-row', 'behind-back-row', 'romanian-deadlift', 'kickback'].includes(scene);
  const seated = ['machine-press', 'lat-pulldown', 'seated-curl', 'concentration-curl', 'cable-curl', 'leg-press', 'leg-extension', 'seated-press', 'pec-deck', 'reverse-pec-deck', 'seated-row', 'supported-t-row', 'incline-curl', 'lying-leg-curl'].includes(scene);
  const bodyX = cx + (horizontal ? 10 : 0);
  const torsoY = horizontal ? floorY - 215 : bodyY;
  const angle = bent ? 58 : 0;
  const hipX = bodyX;
  const shoulderX = bodyX + (bent ? -25 : 0);
  const shoulderY = torsoY + 10;

  if (horizontal) {
    return [
      head(cx - 118, torsoY + 28),
      `<path d="M${cx - 94} ${torsoY + 16} Q${cx - 15} ${torsoY - 3} ${cx + 56} ${torsoY + 18} L${cx + 62} ${torsoY + 54} Q${cx - 12} ${torsoY + 67} ${cx - 95} ${torsoY + 52} Z" fill="#704BFF" stroke="#283044" stroke-width="4"/>`,
      line(cx + 45, torsoY + 48, cx + 105, floorY - 45, '#315D86', 17),
      line(cx + 105, floorY - 45, cx + 168, floorY - 45, '#315D86', 17),
      line(cx - 58, torsoY + 47, cx - 18, phase === 'start' ? torsoY - 6 : torsoY - 42, '#E9B99D', 15),
      line(cx - 18, phase === 'start' ? torsoY - 6 : torsoY - 42, cx + 34, phase === 'start' ? torsoY - 6 : torsoY - 42, '#E9B99D', 15),
      line(cx + 34, phase === 'start' ? torsoY - 6 : torsoY - 42, cx + 58, phase === 'start' ? torsoY + 20 : torsoY - 20, '#E9B99D', 15),
    ].join('');
  }

  const armEndX = phase === 'start' ? cx + 74 : cx + (scene.includes('row') || scene.includes('curl') || scene.includes('pull') ? 45 : 105);
  const armEndY = phase === 'start' ? shoulderY + 88 : shoulderY + (scene.includes('overhead') || scene.includes('pulldown') ? -56 : 18);
  const leftArmEndX = phase === 'start' ? cx - 70 : cx - 104;
  const leftArmEndY = phase === 'start' ? shoulderY + 84 : shoulderY + (scene.includes('overhead') || scene.includes('pulldown') ? -55 : 18);
  const legOneKneeX = cx - (isLow ? 26 : 20);
  const legTwoKneeX = cx + (isLow ? 42 : 22);
  const legOneFootX = cx - (isLow ? 90 : 54);
  const legTwoFootX = cx + (isLow ? 96 : 60);
  const action = [
    head(shoulderX - 20, top + 23),
    torso(bodyX, torsoY, angle),
    line(shoulderX - 15, shoulderY, phase === 'start' ? leftArmEndX : cx - 94, phase === 'start' ? leftArmEndY : armEndY, '#E9B99D', 16),
    line(shoulderX + 16, shoulderY, armEndX, armEndY, '#E9B99D', 16),
    line(hipX - 15, torsoY + 62, legOneKneeX, kneeY, '#315D86', 20),
    line(legOneKneeX, kneeY, legOneFootX, floorY, '#315D86', 18),
    line(hipX + 15, torsoY + 62, legTwoKneeX, kneeY, '#315D86', 20),
    line(legTwoKneeX, kneeY, legTwoFootX, floorY, '#315D86', 18),
  ].join('');

  if (seated) {
    return `${rect(cx - 57, floorY - 99, 78, 12, '#5C6475', 5)}${line(cx - 35, floorY - 92, cx - 35, floorY - 18, '#5C6475', 8)}${action}`;
  }
  return action;
}

function drawEquipment(cx, floorY, scene, phase) {
  const floor = line(cx - 150, floorY + 2, cx + 150, floorY + 2, '#CBD0D9', 3);
  const barY = phase === 'start' ? floorY - 300 : floorY - 345;
  if (['bench-press', 'incline-press', 'skull-crusher'].includes(scene)) {
    return `${floor}${rect(cx - 110, floorY - 104, 170, 14, '#4C5568', 6)}${line(cx - 80, floorY - 98, cx - 80, floorY - 18, '#4C5568', 8)}${line(cx + 36, floorY - 98, cx + 36, floorY - 18, '#4C5568', 8)}${line(cx - 75, barY, cx + 77, barY, '#30384A', 8)}${rect(cx - 97, barY - 19, 16, 38, '#F08A5D', 4)}${rect(cx + 70, barY - 19, 16, 38, '#F08A5D', 4)}`;
  }
  if (scene.includes('cable') || scene.includes('pulldown') || scene.includes('fly')) {
    return `${floor}${line(cx - 128, floorY - 4, cx - 128, floorY - 316, '#4C5568', 12)}${line(cx + 128, floorY - 4, cx + 128, floorY - 316, '#4C5568', 12)}<circle cx="${cx - 128}" cy="${floorY - 316}" r="10" fill="#F08A5D"/><circle cx="${cx + 128}" cy="${floorY - 316}" r="10" fill="#F08A5D"/>${line(cx - 128, floorY - 316, cx - 74, floorY - 238, '#5C6475', 4)}${line(cx + 128, floorY - 316, cx + 78, floorY - 238, '#5C6475', 4)}`;
  }
  if (scene.includes('press') || scene.includes('pec-deck') || scene.includes('leg-press') || scene.includes('leg-extension')) {
    return `${floor}${line(cx - 104, floorY - 12, cx - 104, floorY - 278, '#4C5568', 12)}${line(cx - 104, floorY - 278, cx + 112, floorY - 278, '#4C5568', 12)}${rect(cx - 62, floorY - 106, 92, 12, '#5C6475', 6)}${line(cx - 20, floorY - 100, cx - 20, floorY - 20, '#5C6475', 8)}${line(cx + 28, floorY - 100, cx + 28, floorY - 20, '#5C6475', 8)}${line(cx + 40, floorY - 170, cx + 94, floorY - 210, '#F08A5D', 9)}`;
  }
  if (scene.includes('pull-up') || scene === 'dip') {
    return `${floor}${line(cx - 112, floorY - 4, cx - 112, floorY - 315, '#4C5568', 12)}${line(cx + 112, floorY - 4, cx + 112, floorY - 315, '#4C5568', 12)}${line(cx - 112, floorY - 315, cx + 112, floorY - 315, '#4C5568', 12)}`;
  }
  if (scene.includes('row') || scene === 'standing-cable-press' || scene.includes('kickback')) {
    return `${floor}${rect(cx - 104, floorY - 114, 132, 12, '#5C6475', 5)}${line(cx - 82, floorY - 108, cx - 82, floorY - 18, '#5C6475', 8)}${line(cx + 6, floorY - 108, cx + 6, floorY - 18, '#5C6475', 8)}${line(cx + 76, floorY - 18, cx + 76, floorY - 280, '#4C5568', 10)}<circle cx="${cx + 76}" cy="${floorY - 280}" r="9" fill="#F08A5D" />`;
  }
  return `${floor}${line(cx - 128, floorY - 4, cx - 128, floorY - 300, '#4C5568', 10)}${line(cx + 128, floorY - 4, cx + 128, floorY - 300, '#4C5568', 10)}${line(cx - 128, floorY - 300, cx + 128, floorY - 300, '#4C5568', 10)}`;
}

function renderExercise(exercise) {
  const scene = sceneById[exercise.id];
  if (!scene) throw new Error(`Missing illustration scene for ${exercise.id}`);
  const title = exercise.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const muscles = exercise.targetMuscles.join(' • ').replace(/&/g, '&amp;');
  const panels = [240, 720].map((center, index) => {
    const phase = index === 0 ? 'start' : 'end';
    const floorY = 438;
    return [
      `<rect x="${center - 208}" y="82" width="416" height="376" rx="18" fill="#FFFFFF" stroke="#D8DCE5" stroke-width="2"/>`,
      `<text x="${center}" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#704BFF">${phase.toUpperCase()}</text>`,
      drawEquipment(center, floorY, scene, phase),
      drawFigure(center, floorY, scene, phase),
      phase === 'start'
        ? `<path d="M445 267 L510 267 M495 252 L511 267 L495 282" fill="none" stroke="#F08A5D" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
        : '',
    ].join('');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560" role="img" aria-labelledby="title description">
  <title id="title">${title} - instructional illustration draft</title>
  <desc id="description">Two-phase original vector illustration draft for ${title}. Target muscles: ${muscles}. This draft requires visual and exercise-professional review before assignment.</desc>
  <rect width="960" height="560" fill="#F7F8FC"/>
  <text x="480" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#20263A">${title}</text>
  <text x="480" y="68" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#5C6475">${muscles}</text>
  ${panels}
  <text x="480" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#A1492B">DRAFT — VISUAL AND TECHNIQUE REVIEW REQUIRED</text>
  <text x="480" y="526" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#5C6475">${exercise.equipmentRequired.join(', ').replace(/&/g, '&amp;')}</text>
</svg>`;
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const exercise of exercises) {
  const destination = path.join(outputDirectory, `${exercise.imageAssetId}.svg`);
  fs.writeFileSync(destination, renderExercise(exercise), 'utf8');
}
console.log(`Created ${exercises.length} unapproved SVG review drafts in ${outputDirectory}`);
