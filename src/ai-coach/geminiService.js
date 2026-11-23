import { GoogleGenAI } from '@google/genai';
import { analyzeFoodPortion } from './userContextService.js';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 20_000;

export class GeminiConfigurationError extends Error {
  constructor(message = 'GEMINI_API_KEY is not configured.') {
    super(message);
    this.name = 'GeminiConfigurationError';
  }
}

export class GeminiTimeoutError extends Error {
  constructor() {
    super('The Gemini request timed out.');
    this.name = 'GeminiTimeoutError';
  }
}

export class GeminiApiError extends Error {
  constructor(status, message, providerCode = null) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
    this.providerCode = providerCode;
  }
}

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiConfigurationError();

  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!model) throw new GeminiConfigurationError('GEMINI_MODEL must be a non-empty model name.');

  return { apiKey, model };
}

export function extractGeminiResponseText(response) {
  if (typeof response?.text === 'string') return response.text.trim();

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

function getSafeProviderDetails(error, apiKey) {
  let payload;
  try {
    payload = JSON.parse(error?.message || '');
  } catch {
    payload = null;
  }
  const rawMessage = typeof payload?.error?.message === 'string'
    ? payload.error.message
    : typeof error?.message === 'string'
      ? error.message
      : '';
  const providerCode = typeof payload?.error?.status === 'string'
    ? payload.error.status
    : typeof error?.code === 'string'
      ? error.code
      : null;
  const safeMessage = rawMessage
    .replaceAll(apiKey, '[redacted]')
    .replace(/key=[^&\s"'`]+/gi, 'key=[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
  return { providerCode, safeMessage };
}

export async function askGeminiAiCoach({
  userMessage,
  userContext,
  conversationHistory = [],
  clientFactory = (apiKey) => new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1' },
  }),
}) {
  const { apiKey, model } = getGeminiConfig();
  const foodAdvice = analyzeFoodPortion(userMessage, userContext);
  const ai = clientFactory(apiKey);

  const systemInstruction = `You are Fitness Species AI Coach, a friendly and supportive general fitness and nutrition assistant.
Keep responses concise, practical, and encouraging, ideally 2-4 sentences.
Help with general fitness, exercise, nutrition, calorie concepts, hydration, sleep, motivation, and healthy lifestyle planning.
Support English and Telugu when appropriate.
Do not diagnose medical conditions, prescribe medication, or fabricate personal measurements.
For concerning symptoms, recommend appropriate professional medical evaluation.
Clearly distinguish general wellness guidance from personalized medical advice.
Do not claim access to the user's private fitness records.`;

  const history = Array.isArray(conversationHistory)
    ? conversationHistory
      .filter((turn) => (
        (turn?.role === 'user' || turn?.role === 'assistant' || turn?.role === 'model')
        && typeof turn.content === 'string'
      ))
      .slice(-4)
      .map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content.slice(0, 1000) }],
      }))
    : [];

  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage.slice(0, 2000) }] },
  ];

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 350,
        abortSignal: abortController.signal,
      },
    });

    const answer = extractGeminiResponseText(response);
    if (!answer) throw new GeminiApiError(0, 'Gemini returned an empty response.');

    return {
      answer,
      foodAdvice,
      userContextSummary: {
        remainingCalories: userContext.nutrition.remainingCalories,
        consumedCalories: userContext.nutrition.consumedCalories,
        steps: userContext.activity.steps,
        activeCaloriesBurned: userContext.activity.totalActiveCaloriesBurned,
      },
    };
  } catch (error) {
    if (abortController.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new GeminiTimeoutError();
    }

    const status = error?.status || error?.statusCode || error?.response?.status || 0;
    const { providerCode, safeMessage } = getSafeProviderDetails(error, apiKey);
    console.error('[ai-coach] Gemini provider request failed.', {
      model,
      status,
      providerCode,
      providerMessage: safeMessage || 'No provider message returned.',
    });
    throw new GeminiApiError(status, 'Unable to complete the Gemini request.', providerCode);
  } finally {
    clearTimeout(timeout);
  }
}
