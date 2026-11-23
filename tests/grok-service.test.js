import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAiCoachControllers } from '../src/ai-coach/controllers.js';

test('backend app can start and serve health without XAI_API_KEY', async () => {
  const previousApiKey = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;

  try {
    const app = createApp({
      checkDB: async () => {},
      getDbStatus: () => 'connected',
      getDbName: () => 'fitness_species',
    });
    const response = await request(app).get('/api/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  } finally {
    if (previousApiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousApiKey;
  }
});

test('AI Coach returns a safe configuration error when XAI_API_KEY is absent', async () => {
  const previousApiKey = process.env.XAI_API_KEY;
  const previousModel = process.env.XAI_MODEL;
  delete process.env.XAI_API_KEY;
  process.env.XAI_MODEL = 'grok-4.7';

  try {
    const controllers = createAiCoachControllers({
      getDb() {
        throw new Error('Database should not be queried without Grok configuration.');
      },
    });
    const response = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await controllers.chatWithAiCoach({
      body: { message: 'Can I eat pizza?' },
      user: { uid: 'authenticated-user' },
    }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      success: false,
      message: 'AI Coach is not configured. Set XAI_API_KEY in the backend environment.',
    });
  } finally {
    if (previousApiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.XAI_MODEL;
    else process.env.XAI_MODEL = previousModel;
  }
});
