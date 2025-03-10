
import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
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
      
      // Send data to Patronus API
      return this.sendRequest('POST', '/api/v1/interactions', payload);
    } catch (error) {
      console.error('Patronus logging error:', error);
      return null;
    }
  }
  
  private sendRequest(method: string, path: string, data: any) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.patronusai.com',
        port: 443,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
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
            reject(new Error(`Request failed with status ${res.statusCode}: ${responseData}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
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
    environment: process.env.NODE_ENV || 'development'
  }
});

// Create a middleware to send conversation data to Patronus
export const patronusEvaluationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Store the original json method
  const originalJson = res.json;
  
  // Override the json method to capture the response
  res.json = function(body) {
    // Only log certain endpoints
    if (req.path.includes('/api/conversation') || req.path.includes('/api/message')) {
      try {
        // Create an evaluation record with custom metadata
        patronus.logInteraction({
          input: req.body?.message || 'start',
          output: body?.message || (typeof body === 'object' ? JSON.stringify(body) : body),
          model: 'gpt-4o', // From your OpenAI configuration
          metadata: {
            userId: req.body?.userName || body?.conversation?.userName || 'unknown',
            activityId: req.body?.activityId || body?.conversation?.activityId,
            conversationId: req.params?.id || body?.conversation?.id,
            endpoint: req.path,
            method: req.method,
            stepNumber: body?.conversation?.currentStep
          }
        });
      } catch (error) {
        console.error('Patronus logging error:', error);
      }
    }
    
    // Call the original json method
    return originalJson.call(this, body);
  };
  
  next();
};

// Function to evaluate a specific response against custom criteria
export async function evaluateResponse(
  userInput: string,
  aiResponse: string,
  step: any,
  metadata: Record<string, any> = {}
) {
  try {
    return await patronus.logInteraction({
      input: userInput,
      output: aiResponse,
      model: 'gpt-4o',
      metadata: {
        objective: step.objective,
        expectedResponses: step.expectedResponses,
        spanishWords: step.spanishWords,
        stepNumber: step.stepNumber,
        ...metadata
      }
    });
  } catch (error) {
    console.error('Patronus evaluation error:', error);
    return null;
  }
}
