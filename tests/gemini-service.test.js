import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAiCoachControllers } from '../src/ai-coach/controllers.js';
import {
  askGeminiAiCoach,
  GeminiApiError,
  extractGeminiResponseText,
} from '../src/ai-coach/geminiService.js';

const userContext = {
  nutrition: { remainingCalories: 1200, consumedCalories: 800 },
  activity: { steps: 1000, totalActiveCaloriesBurned: 40 },
};

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
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';

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

test('Gemini service returns generated text with bounded chat history', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'unit-test-key';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';

  try {
    let requestBody;
    const result = await askGeminiAiCoach({
      userMessage: 'What exercise should I start with?',
      userContext,
      conversationHistory: [
        { role: 'user', content: 'I am new to fitness.' },
        { role: 'assistant', content: 'Start with short sessions.' },
      ],
      clientFactory: () => ({
        models: {
          generateContent: async (params) => {
            requestBody = params;
            return { text: 'Start with an easy walk and build gradually.' };
          },
        },
      }),
    });

    assert.equal(requestBody.model, 'gemini-3.5-flash-lite');
    assert.equal(requestBody.contents.length, 3);
    assert.equal(requestBody.contents[1].role, 'model');
    assert.equal(result.answer, 'Start with an easy walk and build gradually.');
    assert.deepEqual(result.userContextSummary, {
      remainingCalories: 1200,
      consumedCalories: 800,
      steps: 1000,
      activeCaloriesBurned: 40,
    });
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test('Gemini provider 404 is mapped to a model-unavailable response', async () => {
  const controllers = createAiCoachControllers({
    getDb: () => ({}),
    getAiConfig: () => {},
    getUserContext: async () => userContext,
    askAiCoach: async () => {
      throw new GeminiApiError(404, 'provider failure', 'NOT_FOUND');
    },
  });
  const response = {
    statusCode: 200,
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
    body: { message: 'Hi' },
    user: { uid: 'model-test-user', firebaseProjectId: 'project-fitness-species' },
  }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.code, 'AI_MODEL_UNAVAILABLE');
});

test('Gemini quota errors return a distinct Android error code', async () => {
  const controllers = createAiCoachControllers({
    getDb: () => ({}),
    getAiConfig: () => {},
    getUserContext: async () => userContext,
    askAiCoach: async () => {
      throw new GeminiApiError(429, 'provider failure', 'RESOURCE_EXHAUSTED');
    },
  });
  const response = {
    statusCode: 200,
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
    body: { message: 'Hi' },
    user: { uid: 'quota-mapping-user', firebaseProjectId: 'project-fitness-species' },
  }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.body.code, 'AI_QUOTA_EXHAUSTED');
});

test('Gemini service preserves provider error status and classification', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'unit-test-key';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';

  try {
    for (const [status, providerCode] of [[404, 'NOT_FOUND'], [429, 'RESOURCE_EXHAUSTED']]) {
      const error = new Error(JSON.stringify({
        error: { code: status, status: providerCode, message: 'Test provider error.' },
      }));
      error.status = status;
      await assert.rejects(
        askGeminiAiCoach({
          userMessage: 'Hi',
          userContext,
          clientFactory: () => ({
            models: { generateContent: async () => { throw error; } },
          }),
        }),
        (caught) => caught instanceof GeminiApiError
          && caught.status === status
          && caught.providerCode === providerCode,
      );
    }
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test('AI Coach success preserves Android response DTO and project-scoped chat history', async () => {
  const savedChats = [];
  const controllers = createAiCoachControllers({
    getDb: () => ({
      collection: () => ({
        insertOne: async (chat) => savedChats.push(chat),
      }),
    }),
    getAiConfig: () => {},
    getUserContext: async () => userContext,
    askAiCoach: async () => ({
      answer: 'Try a short daily walk.',
      foodAdvice: null,
      userContextSummary: {
        remainingCalories: 1200,
        consumedCalories: 800,
        steps: 1000,
        activeCaloriesBurned: 40,
      },
    }),
  });
  const response = {
    statusCode: 200,
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
    body: { message: 'Hi' },
    user: { uid: 'same-uid', firebaseProjectId: 'project-fitness-species' },
  }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.answer, 'Try a short daily walk.');
  assert.equal(savedChats[0].firebaseProjectId, 'project-fitness-species');
});

test('AI Coach history query is scoped by Firebase project and UID', async () => {
  let query;
  const controllers = createAiCoachControllers({
    getDb: () => ({
      collection: () => ({
        find(filter) {
          query = filter;
          return {
            sort() { return this; },
            limit() { return this; },
            toArray: async () => [],
          };
        },
      }),
    }),
  });
  const response = { json(body) { this.body = body; return this; } };

  await controllers.getAiCoachHistory({
    user: { uid: 'same-uid', firebaseProjectId: 'project-fitness-species' },
  }, response, (error) => {
    throw error;
  });

  assert.deepEqual(query, {
    firebaseUid: 'same-uid',
    firebaseProjectId: 'project-fitness-species',
  });
});
