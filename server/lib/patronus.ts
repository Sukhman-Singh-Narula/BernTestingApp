import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { activities, conversations, messages, steps, systemPrompts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import https from 'https';
import { URL } from 'url';

let debugCounter = 0; // Added counter for unique evaluation IDs

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

  private sanitizeText(text: string | number | null | undefined): string {
    if (text === null || text === undefined) return '';
    const stringValue = String(text);
    return stringValue.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, '_');
  }

  private sanitizeTags(tags: Record<string, any>): Record<string, string> {
    return Object.entries(tags).reduce((acc, [key, value]) => {
      acc[key] = this.sanitizeText(value);
      return acc;
    }, {} as Record<string, string>);
  }

  async evaluateMessage(userInput: string, aiResponse: string, previousAiMessage: string, stepData?: any) {
    const evaluationId = ++debugCounter;
    try {
      console.log(`[Patronus #${evaluationId}] Starting message evaluation`);

      if (!this.apiKey) {
        console.error(`[Patronus #${evaluationId}] API key is not set. Please set PATRONUS_API_KEY environment variable.`);
        return null;
      }

      console.log(`[Patronus #${evaluationId}] API key is set with length: ${this.apiKey.length}`);
      console.log(`[Patronus #${evaluationId}] Input lengths - User: ${userInput?.length ?? 0}, AI: ${aiResponse?.length ?? 0}, Previous: ${previousAiMessage?.length ?? 0}`);

      // Get conversation evaluators
      const conversationEvaluators = stepData?.conversationId ?
        await storage.getConversationEvaluators(stepData.conversationId) :
        [];

      // Use default evaluator if none are assigned
      const evaluatorsConfig = conversationEvaluators.length > 0 ?
        conversationEvaluators.map(ce => ({
          evaluator: ce.evaluator.name,
          criteria: ce.evaluator.criteria,
          ...(ce.evaluator.metadata ? JSON.parse(ce.evaluator.metadata) : {})
        })) :
        [{
          evaluator: "glider",
          criteria: "language-compliance"
        }];

      const taskContext = {
        objective: stepData?.objective || '',
        expectedResponses: stepData?.expectedResponses || '',
        description: stepData?.description || '',
        spanishWords: stepData?.spanishWords || '',
        currentStep: stepData?.stepNumber || 0,
        activityName: stepData?.activityName || '',
        systemPrompt: stepData?.systemPrompt || ''
      };

      const payload = {
        evaluators: evaluatorsConfig,
        evaluated_model_input: this.sanitizeText(userInput),
        evaluated_model_output: this.sanitizeText(aiResponse),
        evaluated_model_retrieved_context: this.sanitizeText(previousAiMessage),
        evaluated_model_gold_answer: stepData?.successResponse || "",
        evaluated_model_system_prompt: stepData?.systemPrompt || null,
        task_context: JSON.stringify(taskContext),
        tags: this.sanitizeTags({
          ...this.defaultMetadata,
          ...stepData
        })
      };

      console.log(`[Patronus #${evaluationId}] Sending request to /v1/evaluate with evaluators:`, evaluatorsConfig);
      const result = await this.sendRequest('POST', '/v1/evaluate', payload);
      console.log(`[Patronus #${evaluationId}] Evaluation completed successfully`, result ? 'with response' : 'with null response');
      return result;
    } catch (error) {
      console.error(`[Patronus #${evaluationId}] Evaluation error:`, error);
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

export const patronusEvaluationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Continue with the request immediately
  next();

  // Process Patronus evaluation in the background
  (async () => {
    try {
      const debugId = ++debugCounter;
      const fullPath = req.originalUrl || req.path;
      console.log(`[Patronus Middleware #${debugId}] Processing ${req.method} ${fullPath}`);

      // Skip evaluation for non-conversation routes
      if (!fullPath.includes('/conversation')) {
        console.log(`[Patronus Middleware #${debugId}] Skipping: Not a conversation route`);
        return;
      }

      // Skip evaluation for conversation creation
      if (req.method === 'POST' && fullPath === '/api/conversation') {
        console.log(`[Patronus Middleware #${debugId}] Skipping: Conversation creation`);
        return;
      }

      // Skip for GET requests
      if (req.method === 'GET') {
        console.log(`[Patronus Middleware #${debugId}] Skipping: GET request`);
        return;
      }

      // Extract conversation ID from URL path for POST message requests
      const pathMatch = fullPath.match(/\/api\/conversation\/(\d+)\/message/);
      if (!pathMatch || !pathMatch[1]) {
        console.log(`[Patronus Middleware #${debugId}] Skipping: Invalid path pattern`, fullPath);
        return;
      }

      console.log(`[Patronus Middleware #${debugId}] Processing message for conversation ${pathMatch[1]}`);

      const conversationId = parseInt(pathMatch[1]);
      if (isNaN(conversationId) || conversationId <= 0) {
        console.error(`Invalid conversation ID value: ${conversationId}`);
        return;
      }

      // Get messages for evaluation
      const allMessages = await storage.getMessagesByConversation(conversationId);
      const aiResponseCount = allMessages.filter(msg => msg.role === 'assistant').length;

      // Only evaluate after we have enough messages
      if (aiResponseCount < 2) {
        return;
      }

      // Get conversation and step data
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return;
      }

      const stepData = await storage.getStepByActivityAndNumber(
        conversation.activityId,
        conversation.currentStep - 1
      );

      if (!stepData) {
        return;
      }

      // Get the relevant messages for evaluation
      const messages = allMessages;
      const userMessage = messages.filter(msg => msg.role === 'user').pop();
      const currentAiMessage = messages.filter(msg => msg.role === 'assistant').pop();
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      const previousAiMessage = assistantMessages.length > 1 ?
        assistantMessages[assistantMessages.length - 2] :
        { content: '' };

      // Fire-and-forget evaluation
      patronus.evaluateMessage(
        userMessage?.content,
        currentAiMessage?.content,
        previousAiMessage?.content,
        {
          ...stepData,
          llm_advancement_decision: currentAiMessage?.metadata?.shouldAdvance
        }
      ).catch(error => {
        console.error('Background Patronus evaluation error:', error);
      });

    } catch (error) {
      console.error('Error in background Patronus evaluation:', error);
    }
  })();
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

    const step = await storage.getStepByActivityAndNumber(stepData.activityId, stepData.stepNumber);

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