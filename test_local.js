import { createApp } from './src/app.js';
import request from 'supertest';

const app = createApp({
  getDbStatus: () => 'connected',
  checkDB: async () => {},
  getDbName: () => 'fitness_species',
  verifyIdToken: async () => ({ uid: 'admin123', aud: 'sellerportal-2786c', iss: 'https://securetoken.google.com/sellerportal-2786c' }),
  adminUids: ['admin123'],
});

async function run() {
  try {
    const res = await request(app)
      .get('/api/doctor-portal/admin/organizations?status=pending')
      .set('Authorization', 'Bearer dummy_token');

    console.log(res.status, res.body);
  } catch (err) {
    console.error(err);
  }
}

run();
