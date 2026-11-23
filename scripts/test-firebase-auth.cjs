
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const FIREBASE_API_KEY = 'AIzaSyCTGpPufo40LQg2xlL60Tq1SlCroK2trGQ';
const BACKEND_URL = 'http://localhost:5000';

function askHiddenPassword() {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Please run this script in the VS Code terminal.'));
      return;
    }

    stdout.write('Enter your Firebase test password: ');
    let password = '';

    stdin.setRawMode(true);
    stdin.resume();

    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    }

    function onData(key) {
      if (key.toString() === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (key.toString() === '\r' || key.toString() === '\n') {
        cleanup();
        resolve(password);
      } else if (key.toString() === '\u007f' || key.toString() === '\b') {
        password = password.slice(0, -1);
      } else {
        password += key.toString();
      }
    }

    stdin.on('data', onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    console.log('\n=== FITNESS SPECIES FIREBASE TEST ===\n');

    const email = await rl.question('Enter your Firebase test email: ');

    const password = await rl.question('Enter your Firebase test password: ');
    rl.close
    console.log('\n1. Signing in to Firebase...');

    const loginResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      throw new Error(
        loginData.error?.message || 'Firebase login failed.'
      );
    }

    console.log('SUCCESS: Firebase login worked!');

    console.log('\n2. Sending ID token to your backend...');

    const backendResponse = await fetch(
      `${BACKEND_URL}/api/users/me`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginData.idToken}`
        },
        body: JSON.stringify({})
      }
    );

    const backendData = await backendResponse.json();

    if (!backendResponse.ok) {
      throw new Error(
        backendData.message || 'Backend rejected the Firebase token.'
      );
    }

    console.log('\nSUCCESS: Backend accepted the Firebase token!');
    console.log('User profile created or updated successfully.');
    console.log('Firebase project:', loginData.projectId);

  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
  } finally {
    if (!rl.closed) rl.close();
  }
}

if (
  FIREBASE_API_KEY === 'PASTE_YOUR_WEB_API_KEY_HERE' ||
  !FIREBASE_API_KEY.trim()
) {
  console.error('Please add your Firebase Web API key at the top of this file.');
} else {
  main();
}
