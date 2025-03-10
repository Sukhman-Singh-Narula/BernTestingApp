
import { Patronus } from '@patronusai/sdk';
import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Initialize Patronus with your API key
const patronus = new Patronus({
  apiKey: process.env.PATRONUS_API_KEY,
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
