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

  async evaluateMessage(message: string, stepData?: any) {
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
        evaluated_model_input: message,
        evaluated_model_output: "",
        evaluated_model_gold_answer: "",
        evaluated_model_retrieved_context: retrievedContext,
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
    // Only process conversation and message endpoints
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

        // Get conversation with related data
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

        // Check for step number in conversation - note this is the step number, not the ID
        const stepNumber = conversation.currentStep;
        console.log('Using step number:', stepNumber);

        if (stepNumber === undefined || stepNumber === null) {
          console.error(`No step number found for conversation ${conversationId}`);
          return originalJson.call(this, { message: 'Activity step not found', status: 404 });
        }

        // Find the step by activity ID and step number
        const step = await db.query.steps.findFirst({
          where: (eq(steps.activityId, conversation.activityId) && eq(steps.stepNumber, stepNumber))
        });

        if (!step) {
          console.error(`Step ${stepNumber} not found`);
          return originalJson.call(this, { message: 'Activity step not found', status: 404 });
        }

        // Process message evaluation if this is a message request
        if (req.body?.message) {
          const stepData = {
            id: step.id,
            objective: step.objective,
            expectedResponses: step.expectedResponses,
            stepNumber: step.stepNumber,
            language: conversation.activity.language,
            systemPrompt: conversation.systemPrompt?.systemPrompt
          };

          console.log('Step data attached to request:', stepData);
          const evaluation = await patronus.evaluateMessage(req.body.message, stepData);

          if (evaluation) {
            body.evaluation = evaluation;
          }
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
    const evaluation = await patronus.evaluateMessage(userInput, stepData);

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