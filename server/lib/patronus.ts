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

      console.log('Patronus evaluateMessage called with:', message.substring(0, 50) + '...');

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

      console.log(`Full Patronus API URL: ${this.BASE_URL}/v1/evaluate`);
      return this.sendRequest('POST', '/v1/evaluate', payload);
    } catch (error) {
      console.error('Patronus evaluation error:', error);
      return null;
    }
  }

  async logInteraction(data: {
    input: string;
    output: string;
    model: string;
    metadata?: Record<string, any>;
  }) {
    try {
      if (!this.apiKey) {
        console.error('Patronus API key is not set. Please set PATRONUS_API_KEY environment variable.');
        return null;
      }

      const retrievedContext = JSON.stringify({
        expected_responses: data.metadata?.expectedResponses || '',
        language: data.metadata?.language || '',
        current_step: data.metadata?.currentStep || '',
        step_objective: data.metadata?.stepObjective || '',
        system_prompt: data.metadata?.systemPrompt || ''
      });

      const sanitizedMetadata = {
        userId: this.sanitizeText(data.metadata?.userId || 'unknown'),
        activityId: String(data.metadata?.activityId || ''),
        activityName: this.sanitizeText(data.metadata?.activityName || ''),
        activityType: this.sanitizeText(data.metadata?.activityType || ''),
        language: this.sanitizeText(data.metadata?.language || ''),
        conversationId: String(data.metadata?.conversationId || ''),
        currentStep: String(data.metadata?.currentStep || ''),
        stepObjective: this.sanitizeText(data.metadata?.stepObjective || ''),
        expectedResponses: this.sanitizeText(data.metadata?.expectedResponses || ''),
        spanishWords: this.sanitizeText(data.metadata?.spanishWords || ''),
        systemPrompt: this.sanitizeText(data.metadata?.systemPrompt || '').substring(0, 256),
        endpoint: this.sanitizeText(data.metadata?.endpoint || ''),
        method: this.sanitizeText(data.metadata?.method || ''),
        timestamp: new Date().toISOString()
      };

      return this.sendRequest('POST', '/v1/evaluate', {
        evaluators: [{ 
          evaluator: "glider",
          criteria: "language-compliance" 
        }],
        evaluated_model_input: data.input,
        evaluated_model_output: data.output,
        evaluated_model_gold_answer: "",
        evaluated_model_retrieved_context: retrievedContext,
        evaluated_model_system_prompt: data.metadata?.systemPrompt || null,
        tags: sanitizedMetadata
      });
    } catch (error) {
      console.error('Patronus logging error:', error);
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
        // Get conversation details first
        const conversationId = req.params?.id || body?.conversation?.id;
        const conversation = conversationId ? 
          await db.query.conversations.findFirst({
            where: eq(conversations.id, parseInt(conversationId)),
            with: {
              activity: true,
              systemPrompt: true
            }
          }) : null;

        // Get step information
        const stepId = body?.message?.stepId || conversation?.currentStep;
        const step = stepId ?
          await db.query.steps.findFirst({
            where: eq(steps.id, stepId)
          }) : null;

        // Only log interaction, skip evaluation here since it's handled in evaluateResponse
        await patronus.logInteraction({
          input: req.body?.message || 'conversation_start',
          output: body?.message || JSON.stringify(body),
          model: 'gpt-4',
          metadata: {
            userId: req.body?.userName || body?.conversation?.userName || 'unknown',
            activityId: conversation?.activityId,
            activityName: conversation?.activity?.name,
            activityType: conversation?.activity?.contentType,
            language: conversation?.activity?.language,
            conversationId: conversationId,
            currentStep: conversation?.currentStep,
            stepObjective: step?.objective,
            expectedResponses: step?.expectedResponses,
            spanishWords: step?.spanishWords,
            systemPrompt: conversation?.systemPrompt?.systemPrompt,
            endpoint: req.path,
            method: req.method
          }
        });
      } catch (error) {
        console.error('Patronus logging error:', error);
      }
    }

    return originalJson.call(this, body);
  };

  next();
};

// Enhanced evaluation function for specific response analysis
export async function evaluateResponse(
  userInput: string,
  aiResponse: string,
  stepData: any,
  metadata: Record<string, any> = {}
) {
  try {
    // Evaluate the user input with context
    const evaluation = await patronus.evaluateMessage(userInput, stepData);

    // Gather additional context about the step and activity
    const step = await db.query.steps.findFirst({
      where: eq(steps.id, stepData.id),
      with: {
        activity: true
      }
    });

    const enrichedMetadata = {
      objective: step?.objective,
      expectedResponses: step?.expectedResponses,
      spanishWords: step?.spanishWords,
      stepNumber: step?.stepNumber,
      activityName: step?.activity?.name,
      activityType: step?.activity?.contentType,
      language: step?.activity?.language,
      evaluation,
      ...metadata
    };

    // Return the evaluation result directly
    return evaluation;
  } catch (error) {
    console.error('Patronus evaluation error:', error);
    return null;
  }
}