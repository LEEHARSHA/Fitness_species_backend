import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAiCoachControllers } from '../src/ai-coach/controllers.js';
import { extractGeminiResponseText } from '../src/ai-coach/geminiService.js';

test('backend app can start and serve health without GEMINI_API_KEY', async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

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
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
  }
});

test('AI Coach returns a safe configuration error when GEMINI_API_KEY is absent', async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';

  try {
    const controllers = createAiCoachControllers({
      getDb() {
        throw new Error('Database should not be queried without Gemini configuration.');
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
      user: { uid: 'authenticated-user-config-test' },
    }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      success: false,
      code: 'AI_CONFIG_MISSING',
      message: 'AI Coach is temporarily unavailable. Please try again later.',
    });
  } finally {
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test('Gemini response text is extracted from SDK response text', () => {
  assert.equal(extractGeminiResponseText({
    text: 'Drink water and add a balanced meal.',
  }), 'Drink water and add a balanced meal.');
});

test('Gemini response text is extracted from candidate parts', () => {
  assert.equal(extractGeminiResponseText({
    candidates: [{
      content: {
        parts: [{ text: 'A short workout ' }, { text: 'can help.' }],
      },
    }],
  }), 'A short workout can help.');
});
