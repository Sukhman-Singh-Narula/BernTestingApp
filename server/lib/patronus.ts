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

/**
 * Middleware that handles Patronus evaluation for conversations
 * Only evaluates after 3+ AI responses or for message creation that will be the 3rd response
 */
export const patronusEvaluationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Early exit for non-conversation routes
  if (!req.path.includes('/api/conversation') && !req.path.includes('/api/message')) {
    return next();
  }

  // Log middleware entry point for debugging
  console.log(`Patronus middleware called for ${req.method} ${req.path}`);

  // Skip evaluation for conversation creation
  if (req.method === 'POST' && req.path === '/api/conversation') {
    console.log('Skipping evaluation for conversation creation request');
    return next();
  }

  // For GET requests to /api/conversation/:id, just pass through
  if (req.method === 'GET' && req.path.match(/^\/api\/conversation\/\d+$/)) {
    // For GET requests, check message count in the response
    const originalJson = res.json;
    res.json = function(body) {
      if (body.messages) {
        const messageCount = body.messages.length;
        const aiCount = body.messages.filter((msg: any) => msg.role === 'assistant').length;
        console.log(`Processing request: { path: '${req.path}', method: '${req.method}', body: ${JSON.stringify(req.body)} }`);
        console.log(`Not enough messages for evaluation (${aiCount} < 3)`);
      }
      return originalJson.apply(this, arguments);
    };
    return next();
  }

  // For POST requests to /api/conversation/:id/message
  if (req.method === 'POST' && req.path.match(/^\/api\/conversation\/\d+\/message$/)) {
    const conversationId = parseInt(req.params.id);
    
    // Validate conversationId
    if (isNaN(conversationId)) {
      console.error(`Invalid conversation ID: ${req.params.id}`);
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    // Get all messages for this conversation to check count
    const allMessages = await storage.getMessagesByConversation(conversationId);
    const aiResponseCount = allMessages.filter(msg => msg.role === 'assistant').length;

    console.log(`Processing request: { path: '${req.path}', method: '${req.method}', body: ${JSON.stringify(req.body)} }`);
    console.log(`AI response count: ${aiResponseCount}`);

    // If fewer than 2 AI responses (meaning this will be the 3rd including the one we're about to add)
    if (aiResponseCount < 2) {
      console.log(`Skipping evaluation - only ${aiResponseCount} AI responses so far (need 3+)`);
      return next();
    }

    // This is the 3rd or later AI response, so we'll evaluate
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.log(`Conversation ${conversationId} not found`);
      return next();
    }

    // Get step data for evaluation
    const stepData = await storage.getStepByActivityAndNumber(
      conversation.activityId,
      conversation.currentStep - 1  // Use the current step - 1 since this is for the message being processed
    );

    if (!stepData) {
      console.log(`Step data not found for conversation ${conversationId}, step ${conversation.currentStep - 1}`);
      return next();
    }

    console.log('Evaluating response with step data:', stepData);

    // Now override the json method to process the response
    const originalJson = res.json;
    res.json = async function(body) {
      try {
        if (body.message && body.conversation?.messages) {
          const messages = body.conversation.messages;

          // We should have at least 3 messages now (including the one just added)
          if (messages.length >= 3) {
            const userMessage = messages.filter(msg => msg.role === 'user').pop();
            const currentAiMessage = messages.filter(msg => msg.role === 'assistant').pop();
            const assistantMessages = messages.filter(msg => msg.role === 'assistant');
            const previousAiMessage = assistantMessages.length > 1 ? 
              assistantMessages[assistantMessages.length - 2] : 
              { content: '' };

            // Log the sequence for debugging
            console.log('Using step number:', conversation.currentStep - 1);
            console.log('Evaluating message sequence:', {
              messageCount: messages.length,
              exactSequence: `${messages[0].role} → ${messages[1].role} → ${messages[2].role}`,
              userMessage: userMessage.content,
              currentAiMessage: currentAiMessage.content,
              conversationId
            });

            // Perform the evaluation
            const evaluation = await patronus.evaluateMessage(
              userMessage.content,
              currentAiMessage.content,
              previousAiMessage.content,
              stepData
            );

            if (evaluation) {
              body.evaluation = evaluation;
            }
          }
        }
      } catch (error) {
        console.error('Error in Patronus middleware evaluation:', error);
      }

      return originalJson.call(this, body);
    };

    return next();
  }

  // For all other routes, just pass through
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