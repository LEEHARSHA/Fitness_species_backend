import { exec } from 'child_process';
import fs from 'fs';

exec('npm test', (error, stdout, stderr) => {
  fs.writeFileSync('test_output.txt', `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error ? error.message : 'none'}`);
});
