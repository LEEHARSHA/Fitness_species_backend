import { exec } from 'child_process';
import fs from 'fs';

exec('node tests/exercise-library.test.js', { cwd: 'D:/FitnessSpeciesBackend' }, (error, stdout, stderr) => {
  fs.writeFileSync('test_gym_output.txt', `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error ? error.message : 'none'}`);
});