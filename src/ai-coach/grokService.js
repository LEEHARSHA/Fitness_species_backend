import { analyzeFoodPortion } from './userContextService.js';

const XAI_API_URL = 'https://api.x.ai/v1/responses';
const DEFAULT_MODEL = 'grok-4.7';
const REQUEST_TIMEOUT_MS = 20_000;

export class GrokConfigurationError extends Error {
  constructor(message = 'XAI_API_KEY is not configured.') {
    super(message);
    this.name = 'GrokConfigurationError';
  }
}

export class GrokTimeoutError extends Error {
  constructor() {
    super('The xAI Grok request timed out.');
    this.name = 'GrokTimeoutError';
  }
}

export class GrokApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GrokApiError';
    this.status = status;
  }
}

export function getGrokConfig() {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new GrokConfigurationError();
  }

  const model = (process.env.XAI_MODEL || DEFAULT_MODEL).trim();
  if (!model) {
    throw new GrokConfigurationError('XAI_MODEL must be a non-empty model name.');
  }

  return { apiKey, model };
}

export function extractGrokResponseText(data) {
  if (!Array.isArray(data?.output)) return '';

  return data.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('')
    .trim();
}

function safeProviderMessage(payload) {
  const rawMessage = payload?.error?.message || payload?.message;
  if (typeof rawMessage !== 'string') return 'xAI returned an error response.';

  return rawMessage
    .replace(/xai-[A-Za-z0-9_-]{16,}/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
}

async function readProviderError(response) {
  try {
    return safeProviderMessage(await response.json());
  } catch {
    return 'xAI returned an unreadable error response.';
  }
}

export async function askGrokAiCoach({ userMessage, userContext, conversationHistory = [] }) {
  const { apiKey, model } = getGrokConfig();
  const foodAdvice = analyzeFoodPortion(userMessage, userContext);

  const instructions = `You are Fitness Species AI Coach, an expert personalized fitness and nutrition assistant powered by xAI Grok.
You have direct access to the authenticated user's real-time Fitness Species data:
- Name: ${userContext.user.name}
- Height: ${userContext.user.height} cm | Weight: ${userContext.user.weight} kg
- Fitness Goal: ${userContext.user.goal}
- Today's Calorie Target: ${userContext.nutrition.targetCalories} kcal
- Consumed Calories Today: ${userContext.nutrition.consumedCalories} kcal
- Remaining Calorie Allowance: ${userContext.nutrition.remainingCalories} kcal
- Today's Steps: ${userContext.activity.steps} steps (${userContext.activity.stepCalories} kcal active burn)
- Today's Total Active Calories Burned: ${userContext.activity.totalActiveCaloriesBurned} kcal
- Completed Workouts Today: ${userContext.workout.completedCount} (${userContext.workout.completedWorkouts.map((workout) => workout.name).join(', ') || 'None yet'})

IMPORTANT INSTRUCTIONS:
1. Always use the user's actual data above to personalize your advice.
2. Be encouraging, concise, practical, and clear.
3. If the user asks about a specific food:
   ${foodAdvice ? `Food match found: ${foodAdvice.foodName} (~${foodAdvice.caloriesPer100g} kcal/100g). Suggested portion: ${foodAdvice.suggestedPortionGrams}g (${foodAdvice.estimatedCalories} kcal). Remaining budget after portion: ${foodAdvice.remainingAfter} kcal.` : 'Evaluate food portions against their remaining calorie budget.'}
4. Never invent user records. If a workout or meal is not recorded, acknowledge that accurately.
5. Provide actionable advice in 2-4 sentences. Include food portion breakdowns when relevant.`;

  const history = Array.isArray(conversationHistory)
    ? conversationHistory
      .filter((turn) => (
        (turn?.role === 'user' || turn?.role === 'assistant')
        && typeof turn.content === 'string'
      ))
      .slice(-4)
      .map(({ role, content }) => ({ role, content }))
    : [];
  const input = [...history, { role: 'user', content: userMessage }];

  let response;
  try {
    response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        max_output_tokens: 350,
        store: false,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.warn('[ai-coach] xAI request timed out.');
      throw new GrokTimeoutError();
    }

    console.error('[ai-coach] xAI transport failed.', {
      errorName: error?.name || 'Error',
    });
    throw new GrokApiError(0, 'Unable to connect to the xAI service.');
  }

  if (!response.ok) {
    const message = await readProviderError(response);
    console.error('[ai-coach] xAI API returned an error.', {
      status: response.status,
      message,
    });
    throw new GrokApiError(response.status, message);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    console.error('[ai-coach] xAI API returned invalid JSON.', {
      status: response.status,
    });
    throw new GrokApiError(response.status, 'xAI returned an invalid response.');
  }

  const answer = extractGrokResponseText(data);
  if (!answer) {
    console.error('[ai-coach] xAI API response contained no output text.', {
      status: response.status,
    });
    throw new GrokApiError(response.status, 'xAI returned an empty response.');
  }

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
}
