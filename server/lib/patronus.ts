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
  private readonly API_VERSION = 'v2';

  constructor(options: { apiKey: string, defaultMetadata?: Record<string, any> }) {
    this.apiKey = options.apiKey;
    this.defaultMetadata = options.defaultMetadata || {};

    // Validate API key format
    if (!this.apiKey.startsWith('pt_')) {
      console.warn('Warning: Patronus API key does not start with "pt_". Please verify the key format.');
    }

    // Log API key length for debugging
    console.log(`Patronus API key length: ${this.apiKey.length}`);
  }

  async evaluateMessage(message: string) {
    try {
      if (!this.apiKey || this.apiKey === '') {
        console.error('Patronus API key is not set. Please set PATRONUS_API_KEY environment variable.');
        return null;
      }

      console.log('Patronus evaluateMessage called with:', message.substring(0, 50) + '...');

      const payload = {
        name: "is-Spanish",
        input: message,
        metadata: {
          ...this.defaultMetadata,
          evaluationType: "language-detection"
        }
      };

      const endpoint = `/api/${this.API_VERSION}/evaluations`;
      console.log(`Full Patronus API URL: ${this.BASE_URL}${endpoint}`);
      return this.sendRequest('POST', endpoint, payload);
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
      if (!this.apiKey || this.apiKey === '') {
        console.error('Patronus API key is not set. Please set PATRONUS_API_KEY environment variable.');
        return null;
      }

      console.log('Patronus logInteraction called with data:', {
        input: data.input.substring(0, 50) + '...',
        output: data.output.substring(0, 50) + '...',
        model: data.model,
        metadata: data.metadata ? Object.keys(data.metadata) : 'none'
      });

      const payload = {
        name: "language-learning-interaction",
        input: data.input,
        output: data.output,
        model: data.model,
        metadata: {
          ...this.defaultMetadata,
          ...data.metadata
        }
      };

      const endpoint = `/api/${this.API_VERSION}/logs`;
      console.log(`Full Patronus API URL: ${this.BASE_URL}${endpoint}`);
      return this.sendRequest('POST', endpoint, payload);
    } catch (error) {
      console.error('Patronus logging error:', error);
      return null;
    }
  }

  private sendRequest(method: string, path: string, data: any) {
    return new Promise((resolve, reject) => {
      console.log(`Patronus sending ${method} request to ${path}`);
      console.log('Request payload:', JSON.stringify(data, null, 2));

      const url = new URL(path, this.BASE_URL);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'LanguageLearningAI/1.0',
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      console.log('Patronus request headers:', JSON.stringify({
        contentType: options.headers['Content-Type'],
        authPresent: options.headers['Authorization'] ? 'Yes (token length: ' + this.apiKey.length + ')' : 'No',
        userAgent: options.headers['User-Agent']
      }));

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          console.log(`Patronus response complete: status ${res.statusCode}, data length: ${responseData.length}`);
          console.log('Full response data:', responseData); 
          console.log(`Response headers:`, JSON.stringify(res.headers, null, 2));

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // Check if response looks like HTML
              if (responseData.trim().startsWith('<!DOCTYPE') || responseData.trim().startsWith('<html')) {
                console.error('Received HTML response instead of JSON');
                reject(new Error('Received HTML response from Patronus API'));
                return;
              }

              // Handle empty response
              if (!responseData.trim()) {
                console.error('Received empty response from Patronus API');
                reject(new Error('Empty response from Patronus API'));
                return;
              }

              const parsed = JSON.parse(responseData);
              console.log('Patronus request successful, parsed response:', JSON.stringify(parsed, null, 2));
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
        console.error('Error sending request to Patronus:', error.message);
        reject(error);
      });

      req.on('timeout', () => {
        console.error('Patronus request timed out after 5 seconds');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(data));
      req.end();
      console.log('Patronus request sent');
    });
  }
}

// Initialize Patronus with the API key
const patronus = new PatronusClient({
  apiKey: process.env.PATRONUS_API_KEY || '',
  defaultMetadata: {
    environment: process.env.NODE_ENV || 'development',
    application: 'language-learning-ai',
    version: '1.0.0'
  }
});

// Enhanced middleware to capture detailed conversation data
export const patronusEvaluationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;

  res.json = async function(body) {
    if (req.path.includes('/api/conversation') || req.path.includes('/api/message')) {
      try {
        // If this is a user message, evaluate it for Spanish content
        if (req.body?.message) {
          const evaluationResult = await patronus.evaluateMessage(req.body.message);
          console.log('Patronus evaluation result:', evaluationResult);

          // You can use the evaluation result here to make decisions
          // For example, you might want to store it with the message
          // or use it to provide feedback to the user
        }

        // Gather detailed data about the conversation
        const conversationId = req.params?.id || body?.conversation?.id;
        const conversation = conversationId ? 
          await db.query.conversations.findFirst({
            where: eq(conversations.id, parseInt(conversationId)),
            with: {
              activity: true,
              systemPrompt: true
            }
          }) : null;

        // Get relevant step information
        const stepId = body?.message?.stepId || conversation?.currentStep;
        const step = stepId ?
          await db.query.steps.findFirst({
            where: eq(steps.id, stepId)
          }) : null;

        // Create comprehensive metadata
        const metadata = {
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
          method: req.method,
          timestamp: new Date().toISOString()
        };

        await patronus.logInteraction({
          input: req.body?.message || 'conversation_start',
          output: body?.message || JSON.stringify(body),
          model: 'gpt-4',
          metadata
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
    // First, evaluate if the user input contains Spanish
    const spanishEvaluation = await patronus.evaluateMessage(userInput);

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
      spanishEvaluation: spanishEvaluation,
      ...metadata
    };

    return await patronus.logInteraction({
      input: userInput,
      output: aiResponse,
      model: 'gpt-4',
      metadata: enrichedMetadata
    });
  } catch (error) {
    console.error('Patronus evaluation error:', error);
    return null;
  }
}