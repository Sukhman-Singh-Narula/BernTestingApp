import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { activities, conversations, messages, steps, systemPrompts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import https from 'https';
import { URL } from 'url';

export class PatronusClient {
  private apiKey: string;
  private defaultMetadata: Record<string, any>;
  private readonly BASE_URL = 'https://api.patronus.ai';

  constructor(options: { apiKey: string, defaultMetadata?: Record<string, any> }) {
    this.apiKey = options.apiKey;
    this.defaultMetadata = options.defaultMetadata || {};

    if (!this.apiKey) {
      console.warn('Warning: Patronus API key is not set');
    }
    console.log(`Patronus API key length: ${this.apiKey?.length || 0}`);
  }

  private sanitizeText(text: string): string {
    if (!text) return '';
    return text.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, '_');
  }

  async evaluateMessage(userInput: string, aiResponse: string, previousAiMessage: string, stepData?: any) {
    try {
      if (!this.apiKey) {
        console.error('Patronus API key is not set. Please set PATRONUS_API_KEY environment variable.');
        return null;
      }

      let retrievedContext = '';
      if (stepData) {
        retrievedContext = JSON.stringify({
          expected_responses: stepData.expectedResponses,
          language: stepData.language,
          current_step: stepData.stepNumber,
          step_objective: stepData.objective,
          system_prompt: stepData.systemPrompt
        });
      }

      const payload = {
        evaluators: [{ 
          evaluator: "glider",
          criteria: "language-compliance" 
        }],
        evaluated_model_input: userInput,
        evaluated_model_output: aiResponse,
        evaluated_model_retrieved_context: previousAiMessage,
        evaluated_model_gold_answer: "",
        evaluated_model_system_prompt: stepData?.systemPrompt || null,
        tags: {
          environment: process.env.NODE_ENV || 'development',
          application: 'language-learning-ai',
          version: '1.0.0'
        }
      };

      return this.sendRequest('POST', '/v1/evaluate', payload);
    } catch (error) {
      console.error('Patronus evaluation error:', error);
      return null;
    }
  }

  private sendRequest(method: string, path: string, data: any) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.BASE_URL);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'LanguageLearningAI/1.0'
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              if (responseData.trim().startsWith('<!DOCTYPE') || responseData.trim().startsWith('<html')) {
                console.error('Received HTML response instead of JSON');
                reject(new Error('Received HTML response from Patronus API'));
                return;
              }

              if (!responseData.trim()) {
                console.error('Received empty response from Patronus API');
                reject(new Error('Empty response from Patronus API'));
                return;
              }

              const parsed = JSON.parse(responseData);
              resolve(parsed);
            } catch (e) {
              console.error('Failed to parse Patronus response:', e);
              console.error('Raw response:', responseData);
              reject(new Error('Invalid JSON response from Patronus'));
            }
          } else {
            console.error(`Patronus API error: ${res.statusCode} - ${responseData}`);
            reject(new Error(`Request failed with status ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Error sending request to Patronus:', error);
        reject(error);
      });

      req.on('timeout', () => {
        console.error('Patronus request timed out after 5 seconds');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

const patronus = new PatronusClient({
  apiKey: process.env.PATRONUS_API_KEY || '',
  defaultMetadata: {
    environment: process.env.NODE_ENV || 'development',
    application: 'language-learning-ai',
    version: '1.0.0'
  }
});

export const patronusEvaluationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  res.json = async function(body) {
    if (req.path.includes('/api/conversation') || req.path.includes('/api/message')) {
      try {
        console.log('Processing request:', { path: req.path, method: req.method, body: req.body });

        // Skip evaluation for POST to /api/conversation (creation requests)
        if (req.method === 'POST' && req.path === '/api/conversation') {
          console.log('Skipping evaluation for conversation creation request');
          return originalJson.apply(this, arguments);
        }

        const conversationId = req.params?.id || body?.conversation?.id;
        if (!conversationId) {
          console.log('No conversation ID found in request - continuing');
          return originalJson.apply(this, arguments);
        }

        // Get all messages for this conversation
        const allMessages = await db.query.messages.findMany({
          where: eq(messages.conversationId, parseInt(conversationId)),
          orderBy: (messages, { asc }) => [asc(messages.createdAt)]
        });

        // Ensure we have enough messages for evaluation
        if (allMessages.length < 3) {
          console.log(`Not enough messages for evaluation (${allMessages.length} < 3)`);
          return originalJson.apply(this, arguments);
        }

        // Validate message positions - only evaluate messages where:
        // 1. We have at least 3 total messages in the conversation
        // 2. The latest message is from the assistant (response we're evaluating)
        // 3. Only evaluate messages when we're on the 3rd or later AI response

        // Count how many AI responses we have
        const aiResponseCount = allMessages.filter(msg => msg.role === 'assistant').length;
        console.log(`AI response count: ${aiResponseCount}`);

        if (aiResponseCount < 3) {
          console.log(`Skipping evaluation - only ${aiResponseCount} AI responses so far (need 3+)`);
          return originalJson.apply(this, arguments);
        }

        const currentMessageIndex = allMessages.length - 1;
        if (allMessages[currentMessageIndex].role !== 'assistant' || 
            allMessages[currentMessageIndex-1].role !== 'user') {
          console.log('Skipping evaluation - not an AI response to a user message');
          return originalJson.apply(this, arguments);
        }

        // Skip if we've already added an evaluation for this message
        if (body.evaluation) {
          console.log('Evaluation already exists in response - skipping duplicate evaluation');
          return originalJson.apply(this, arguments);
        }

        // Create a unique key for this evaluation to prevent duplicates
        const evaluationKey = `${conversationId}-${allMessages[currentMessageIndex].id}`;
        // Check if we've already evaluated this message in this request cycle
        const globalAny = global as any;
        globalAny.__evaluatedMessages = globalAny.__evaluatedMessages || new Set();

        if (globalAny.__evaluatedMessages.has(evaluationKey)) {
          console.log(`Already evaluated message ${allMessages[currentMessageIndex].id} - skipping duplicate evaluation`);
          return originalJson.apply(this, arguments);
        }

        // Mark this message as being evaluated
        globalAny.__evaluatedMessages.add(evaluationKey);

        const userMessage = allMessages[currentMessageIndex-1];
        const currentAiMessage = allMessages[currentMessageIndex];
        const previousAiMessage = allMessages[currentMessageIndex-2];


        const conversation = await db.query.conversations.findFirst({
          where: eq(conversations.id, parseInt(conversationId)),
          with: {
            activity: true,
            systemPrompt: true
          }
        });

        if (!conversation) {
          console.error(`Conversation ${conversationId} not found`);
          return originalJson.call(this, { message: 'Conversation not found', status: 404 });
        }

        const stepNumber = conversation.currentStep;
        console.log('Using step number:', stepNumber);

        if (stepNumber === undefined || stepNumber === null) {
          console.error(`No step number found for conversation ${conversationId}`);
          return originalJson.call(this, { message: 'Activity step not found', status: 404 });
        }

        const step = await db.query.steps.findFirst({
          where: (eq(steps.activityId, conversation.activityId) && eq(steps.stepNumber, stepNumber))
        });

        if (!step) {
          console.error(`Step ${stepNumber} not found`);
          return originalJson.call(this, { message: 'Activity step not found', status: 404 });
        }

        // Get the last three messages in the sequence (AI-User-AI)
        const lastThreeMessages = allMessages.slice(-3);
        const [previousAiMessageCheck, userMessageCheck, currentAiMessageCheck] = lastThreeMessages;

        // Verify we have the correct message sequence
        if (previousAiMessageCheck?.role !== 'assistant' || 
            userMessageCheck?.role !== 'user' || 
            currentAiMessageCheck?.role !== 'assistant') {
          console.log('Message sequence is not in the expected AI-User-AI format:', {
            previousRole: previousAiMessageCheck?.role,
            userRole: userMessageCheck?.role,
            currentRole: currentAiMessageCheck?.role
          });
          return originalJson.apply(this, arguments);
        }

        const stepData = {
          id: step.id,
          objective: step.objective,
          expectedResponses: step.expectedResponses,
          stepNumber: step.stepNumber,
          language: conversation.activity.language,
          systemPrompt: conversation.systemPrompt?.systemPrompt
        };

        console.log('Evaluating message sequence:', {
          messageCount: allMessages.length,
          exactSequence: `${allMessages[0].role} → ${allMessages[1].role} → ${allMessages[2].role}`,
          userMessage: userMessage.content,
          currentAiMessage: currentAiMessage.content,
          conversationId
        });

        const evaluation = await patronus.evaluateMessage(
          userMessage.content,
          currentAiMessage.content,
          previousAiMessage.content,
          stepData
        );

        if (evaluation) {
          body.evaluation = evaluation;
        }
      } catch (error) {
        console.error('Error in Patronus middleware:', error);
      }
    }
    return originalJson.call(this, body);
  };
  next();
};

export async function evaluateResponse(
  userInput: string,
  aiResponse: string,
  stepData: any,
  metadata: Record<string, any> = {}
) {
  try {
    console.log('Evaluating response with step data:', stepData);
    const evaluation = await patronus.evaluateMessage(
      userInput,
      aiResponse,
      '', // No previous AI message available in this context
      stepData
    );

    const step = await db.query.steps.findFirst({
      where: eq(steps.id, stepData.id),
      with: {
        activity: true
      }
    });

    const enrichedMetadata = {
      objective: step?.objective,
      expectedResponses: step?.expectedResponses,
      activityName: step?.activity?.name,
      activityType: step?.activity?.contentType,
      language: step?.activity?.language,
      evaluation,
      ...metadata
    };

    return evaluation;
  } catch (error) {
    console.error('Patronus evaluation error:', error);
    return null;
  }
}