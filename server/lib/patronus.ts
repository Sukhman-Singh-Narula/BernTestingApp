import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { activities, conversations, messages, steps, systemPrompts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import https from 'https';

// Custom Patronus client that doesn't rely on an external SDK
class PatronusClient {
  private apiKey: string;
  private defaultMetadata: Record<string, any>;

  constructor(options: { apiKey: string, defaultMetadata?: Record<string, any> }) {
    this.apiKey = options.apiKey;
    this.defaultMetadata = options.defaultMetadata || {};
  }

  async logInteraction(data: {
    input: string;
    output: string;
    model: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const payload = {
        input: data.input,
        output: data.output,
        model: data.model,
        metadata: {
          ...this.defaultMetadata,
          ...data.metadata
        }
      };

      return this.sendRequest('POST', '/v1/log', payload);
    } catch (error) {
      console.error('Patronus logging error:', error);
      return null;
    }
  }

  private sendRequest(method: string, path: string, data: any) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'app.patronus.ai', // Updated hostname
        port: 443,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'LanguageLearningAI/1.0'
        },
        timeout: 5000 // 5 second timeout
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData));
            } catch (e) {
              resolve(responseData);
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
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(data));
      req.end();
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