import { execSync } from 'child_process';
import fs from 'fs';
try {
  const status = execSync('git status', { encoding: 'utf-8' });
  console.log('STATUS:', status);
  execSync('git add .', { encoding: 'utf-8' });
  execSync('git commit -m "feat: integrate admin organization endpoints"', { encoding: 'utf-8' });
  const push = execSync('git push origin main', { encoding: 'utf-8' });
  console.log('PUSH:', push);
  fs.writeFileSync('git_backend_log.txt', 'SUCCESS: ' + push);
} catch (error) {
  fs.writeFileSync('git_backend_log.txt', 'ERROR: ' + error.message + '\n' + (error.stdout || '') + '\n' + (error.stderr || ''));
}
