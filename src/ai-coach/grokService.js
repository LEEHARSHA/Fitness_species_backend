import { analyzeFoodPortion } from './userContextService.js';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_MODEL = 'grok-4.7';
const REQUEST_TIMEOUT_MS = 20_000;

export class GrokConfigurationError extends Error {
  constructor(message = 'XAI_API_KEY is not configured.') {
    super(message);
    this.name = 'GrokConfigurationError';
  }
}

export class GrokApiError extends Error {
  constructor(message = 'The xAI Grok service is temporarily unavailable.') {
    super(message);
    this.name = 'GrokApiError';
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

export async function askGrokAiCoach({ userMessage, userContext, conversationHistory = [] }) {
  const { apiKey, model } = getGrokConfig();
  const foodAdvice = analyzeFoodPortion(userMessage, userContext);

  const systemInstruction = `You are Fitness Species AI Coach, an expert personalized fitness and nutrition assistant powered by xAI Grok.
You have direct access to the authenticated user's real-time Fitness Species data:
- Name: ${userContext.user.name}
- Height: ${userContext.user.height} cm | Weight: ${userContext.user.weight} kg
- Fitness Goal: ${userContext.user.goal}
- Today's Calorie Target: ${userContext.nutrition.targetCalories} kcal
- Consumed Calories Today: ${userContext.nutrition.consumedCalories} kcal
- Remaining Calorie Allowance: ${userContext.nutrition.remainingCalories} kcal
- Today's Steps: ${userContext.activity.steps} steps (${userContext.activity.stepCalories} kcal active burn)
- Today's Total Active Calories Burned: ${userContext.activity.totalActiveCaloriesBurned} kcal
- Completed Workouts Today: ${userContext.workout.completedCount} (${userContext.workout.completedWorkouts.map((w) => w.name).join(', ') || 'None yet'})

IMPORTANT INSTRUCTIONS:
1. Always use the user's actual data above to personalize your advice.
2. Be encouraging, concise, practical, and clear.
3. If the user asks about eating a specific food (e.g. cheesecake, pizza, burger):
   ${foodAdvice ? `Food match found: ${foodAdvice.foodName} (~${foodAdvice.caloriesPer100g} kcal/100g). Suggested portion: ${foodAdvice.suggestedPortionGrams}g (${foodAdvice.estimatedCalories} kcal). Remaining budget after portion: ${foodAdvice.remainingAfter} kcal.` : 'Evaluate food portions against their remaining calorie budget.'}
4. Never invent user records. If a workout or meal is not recorded, acknowledge that accurately.
5. Provide actionable advice in 2-4 sentences. Include food portion breakdowns when relevant.`;

  const messages = [
    { role: 'system', content: systemInstruction },
    ...conversationHistory.slice(-4), // Include last 2 turns of conversation history
    { role: 'user', content: userMessage },
  ];

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
        messages,
        temperature: 0.7,
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GrokApiError();
  }

  if (!response.ok) {
    throw new GrokApiError();
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new GrokApiError();
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new GrokApiError();
  }

  return {
    answer: text,
    foodAdvice,
    userContextSummary: {
      remainingCalories: userContext.nutrition.remainingCalories,
      consumedCalories: userContext.nutrition.consumedCalories,
      steps: userContext.activity.steps,
      activeCaloriesBurned: userContext.activity.totalActiveCaloriesBurned,
    },
  };
}
