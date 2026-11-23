import {
  askGeminiAiCoach,
  getGeminiConfig,
  GeminiApiError,
  GeminiConfigurationError,
  GeminiTimeoutError,
} from './geminiService.js';
import { getAuthenticatedUserContext } from './userContextService.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const MAX_MESSAGE_LENGTH = 2000;
const requestCounts = new Map();
const REQUEST_LIMIT_PER_MINUTE = 20;

function consumeUserRequest(uid) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requestCounts.get(uid) || []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= REQUEST_LIMIT_PER_MINUTE) {
    requestCounts.set(uid, recent);
    return false;
  }
  recent.push(now);
  requestCounts.set(uid, recent);
  return true;
}

export function createAiCoachControllers({ getDb }) {
  const collection = (name) => getDb().collection(name);

  // 1. CHAT WITH AI COACH
  const chatWithAiCoach = asyncRoute(async (req, res) => {
    const { message, conversationHistory = [] } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Message text is required.' });
      return;
    }
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        success: false,
        code: 'AI_MESSAGE_TOO_LONG',
        message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
      return;
    }
    if (!consumeUserRequest(req.user.uid)) {
      res.status(429).json({
        success: false,
        code: 'AI_RATE_LIMITED',
        message: 'AI Coach is receiving too many requests. Please try again shortly.',
      });
      return;
    }

    try {
      getGeminiConfig();
    } catch (error) {
      if (!(error instanceof GeminiConfigurationError)) throw error;
      res.status(503).json({
        success: false,
        code: 'AI_CONFIG_MISSING',
        message: 'AI Coach is temporarily unavailable. Please try again later.',
      });
      return;
    }

    let userContext;
    try {
      userContext = await getAuthenticatedUserContext(getDb(), req.user);
    } catch (error) {
      console.error('[ai-coach] user context retrieval failed.', {
        errorName: error?.name || 'Error',
      });
      res.status(503).json({
        success: false,
        code: 'USER_CONTEXT_UNAVAILABLE',
        message: 'Fitness Species could not load your fitness data. Please try again.',
      });
      return;
    }

    let result;
    try {
      result = await askGeminiAiCoach({
        userMessage: message.trim(),
        userContext,
        conversationHistory,
      });
    } catch (error) {
      if (error instanceof GeminiConfigurationError) {
        res.status(503).json({
          success: false,
          code: 'AI_CONFIG_MISSING',
          message: 'AI Coach is temporarily unavailable. Please try again later.',
        });
        return;
      }
      if (error instanceof GeminiTimeoutError) {
        res.status(504).json({
          success: false,
          code: 'AI_PROVIDER_TIMEOUT',
          message: 'AI Coach timed out. Please try again shortly.',
        });
        return;
      }
      if (error instanceof GeminiApiError) {
        if (error.status === 429) {
          res.status(429).json({
            success: false,
            code: 'AI_RATE_LIMITED',
            message: 'AI Coach is receiving too many requests. Please try again shortly.',
          });
          return;
        }
        if (error.status === 401 || error.status === 403) {
          res.status(503).json({
            success: false,
            code: 'AI_PROVIDER_AUTH',
            message: 'AI Coach is temporarily unavailable. Please try again later.',
          });
          return;
        }
        if (error.status === 404) {
          res.status(502).json({
            success: false,
            code: 'AI_MODEL_UNAVAILABLE',
            message: 'The configured AI model is unavailable. Please try again later.',
          });
          return;
        }
        res.status(502).json({
          success: false,
          code: 'AI_PROVIDER_ERROR',
          message: 'AI Coach is temporarily unavailable. Please try again later.',
        });
        return;
      }
      throw error;
    }

    const now = new Date();
    const chatTurn = {
      firebaseUid: req.user.uid,
      userMessage: message.trim(),
      aiAnswer: result.answer,
      foodAdvice: result.foodAdvice || null,
      contextSummary: result.userContextSummary,
      createdAt: now,
    };

    await collection('ai_coach_chats').insertOne(chatTurn);

    res.json({
      success: true,
      answer: result.answer,
      foodAdvice: result.foodAdvice || null,
      contextSummary: result.userContextSummary,
      suggestedActions: result.foodAdvice ? ['Log this meal'] : [],
      createdAt: now.toISOString(),
    });
  });

  // 2. GET CONVERSATION HISTORY
  const getAiCoachHistory = asyncRoute(async (req, res) => {
    const history = await collection('ai_coach_chats')
      .find({ firebaseUid: req.user.uid })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const cleanHistory = history.reverse().map((h) => ({
      id: h._id.toString(),
      userMessage: h.userMessage,
      aiAnswer: h.aiAnswer,
      foodAdvice: h.foodAdvice || null,
      createdAt: h.createdAt,
    }));

    res.json({ success: true, history: cleanHistory });
  });

  return {
    chatWithAiCoach,
    getAiCoachHistory,
  };
}
