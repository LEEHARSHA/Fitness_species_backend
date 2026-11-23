import { ObjectId } from 'mongodb';
import { askGrokAiCoach, getGrokConfig, GrokApiError, GrokConfigurationError } from './grokService.js';
import { getAuthenticatedUserContext } from './userContextService.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function createAiCoachControllers({ getDb }) {
  const collection = (name) => getDb().collection(name);

  // 1. CHAT WITH AI COACH
  const chatWithAiCoach = asyncRoute(async (req, res) => {
    const { message, conversationHistory = [] } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Message text is required.' });
      return;
    }

    try {
      getGrokConfig();
      const userContext = await getAuthenticatedUserContext(getDb(), req.user);
      const result = await askGrokAiCoach({
        userMessage: message.trim(),
        userContext,
        conversationHistory,
      });

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
    } catch (error) {
      if (error instanceof GrokConfigurationError) {
        res.status(503).json({
          success: false,
          message: 'AI Coach is not configured. Set XAI_API_KEY in the backend environment.',
        });
        return;
      }
      if (error instanceof GrokApiError) {
        res.status(502).json({
          success: false,
          message: 'AI Coach is temporarily unavailable.',
        });
        return;
      }
      throw error;
    }
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
