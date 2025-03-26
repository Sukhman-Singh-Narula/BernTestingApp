import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { activities, conversations, messages, steps, systemPrompts, type Message, type Evaluator } from '@shared/schema';
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
    // Use a simpler regex pattern that's compatible with ES5
    return stringValue.replace(/[^a-zA-Z0-9\s_.:/=+\-@]/g, '_');
  }

  private sanitizeTags(tags: Record<string, any>): Record<string, string> {
    return Object.entries(tags).reduce((acc, [key, value]) => {
      acc[key] = this.sanitizeText(value);
      return acc;
    }, {} as Record<string, string>);
  }

  async getAvailableEvaluators() {
    try {
      console.log('[Patronus] Fetching evaluators from API...');
      // Using query parameter to only fetch non-Patronus managed evaluators
      const result = await this.sendRequest('GET', '/v1/evaluator-criteria?is_patronus_managed=false', null);
      
      // Extract the evaluator_criteria array from the response
      const apiResponse = result as any;
      const evaluatorCriteria = apiResponse && apiResponse.evaluator_criteria ? 
        apiResponse.evaluator_criteria : [];
      
      console.log(`[Patronus] Raw API response structure: ${JSON.stringify(Object.keys(result || {}))}`);
      
      if (!evaluatorCriteria || !Array.isArray(evaluatorCriteria) || evaluatorCriteria.length === 0) {
        console.log('[Patronus] No evaluators found in API response, using default ones');
        return [];
      }

      console.log(`[Patronus] Received ${evaluatorCriteria.length} evaluators from API`);
      
      // Map the API response to the format expected by our application
      return evaluatorCriteria.map(evaluator => ({
        name: evaluator.name,
        description: evaluator.description || '',
        evaluator_family: evaluator.evaluator_family,
        config: { 
          pass_criteria: evaluator.config?.pass_criteria || '' 
        },
        is_patronus_managed: evaluator.is_patronus_managed,
        public_id: evaluator.public_id,
        metadata: null // Add this to satisfy TypeScript
      }));
    } catch (error) {
      console.error('[Patronus] Error fetching evaluators:', error);
      return [];
    }
  }

  async syncEvaluators() {
    try {
      // Get evaluators from Patronus API
      const evaluatorsFromPatronus = await this.getAvailableEvaluators();
      if (!evaluatorsFromPatronus?.length) {
        console.warn('[Patronus] No evaluators returned from Patronus API');
        return [];
      }

      // Get all existing evaluators from the database
      const existingEvaluators = await storage.getAllEvaluators();
      console.log(`[Patronus] Found ${existingEvaluators.length} existing evaluators in database`);

      // Filter out evaluators that already exist in the database (by public_id)
      const newEvaluators = evaluatorsFromPatronus.filter(
        apiEvaluator => !existingEvaluators.some(
          dbEvaluator => dbEvaluator.public_id === apiEvaluator.public_id
        )
      );

      console.log(`[Patronus] Found ${newEvaluators.length} new evaluators to add to database`);

      if (newEvaluators.length === 0) {
        console.log('[Patronus] No new evaluators to sync');
        return [];
      }

      const results = await Promise.all(
        newEvaluators.map(async (evaluator) => {
          try {
            console.log(`[Patronus] Adding evaluator: ${evaluator.name} (${evaluator.public_id})`);
            // Map fields according to the schema mapping
            // Cast evaluator to any to handle the metadata property
            const evaluatorAny = evaluator as any;
            const result = await storage.createEvaluator({
              name: evaluator.name,
              family: evaluator.evaluator_family,
              pass_criteria: evaluator.config?.pass_criteria,
              description: evaluator.description,
              is_patronus_managed: evaluator.is_patronus_managed,
              public_id: evaluator.public_id,
              metadata: evaluatorAny.metadata ? JSON.stringify(evaluatorAny.metadata) : null
            });
            console.log(`[Patronus] Created new evaluator: ${evaluator.name}`);
            return result;
          } catch (err) {
            console.error(`[Patronus] Failed to create evaluator ${evaluator.name}:`, err);
            return null;
          }
        })
      );

      return results.filter(Boolean);
    } catch (error) {
      console.error('[Patronus] Error syncing evaluators:', error);
      throw error;
    }
  }



  async evaluateMessage(userInput: string | undefined, aiResponse: string | undefined, previousAiMessage: string | undefined, stepData?: any, contextPairs?: Array<{user: string; assistant: string}>, conversationEvaluators?: any[]) {
    const evaluationId = ++debugCounter;
    try {
      console.log(`[Patronus #${evaluationId}] Starting message evaluation for ${stepData?.conversationId || 'unknown'} conversation`);

      if (!this.apiKey) {
        console.error(`[Patronus #${evaluationId}] API key is not set. Please set PATRONUS_API_KEY environment variable.`);
        return null;
      }

      // Get evaluators for this specific conversation if provided
      let evaluatorsConfig = [];
      
      if (conversationEvaluators && conversationEvaluators.length > 0) {
        console.log(`[Patronus #${evaluationId}] Using ${conversationEvaluators.length} selected evaluators for conversation ${stepData?.conversationId}`);
        // Log the details of evaluators
        conversationEvaluators.forEach(evaluator => {
          console.log(`[Patronus #${evaluationId}] Evaluator ${evaluator.id}: ${evaluator.name} (${evaluator.family})`);
        });
        
        // Map the evaluators from the conversation to the format expected by Patronus API
        evaluatorsConfig = conversationEvaluators.map(evaluator => ({
          evaluator: "judge",
          criteria: evaluator.name || "Custom-Evaluator"
        }));
      } else {
        // Fallback to repetition-checker if no evaluators are selected
        console.log(`[Patronus #${evaluationId}] No evaluators selected for conversation ${stepData?.conversationId}, using default repetition-checker`);
        evaluatorsConfig = [{
          evaluator: "judge",
          criteria: "Repetition-Checker"
        }];
      }

      // Format context pairs if provided
      let contextText = '';
      if (contextPairs && contextPairs.length > 0) {
        contextText = contextPairs.map(pair => 
          `User: ${this.sanitizeText(pair.user)}\nAssistant: ${this.sanitizeText(pair.assistant)}`
        ).join('\n\n');
        // Removed console.log(`[Patronus #${evaluationId}] Added ${contextPairs.length} context pairs to evaluation`);
      } else {
        // Fall back to just the previous message if no context pairs
        contextText = this.sanitizeText(previousAiMessage);
      }

      const taskContext = {
        objective: stepData?.objective || '',
        expectedResponses: stepData?.expectedResponses || '',
        description: stepData?.description || '',
        spanishWords: stepData?.spanishWords || '',
        currentStep: stepData?.stepNumber || 0,
        activityName: stepData?.activityName || '',
        systemPrompt: stepData?.systemPrompt || ''
      };

      // Exactly match the format provided in the fetch example
      const payload = {
        evaluators: evaluatorsConfig,
        evaluated_model_input: this.sanitizeText(userInput),
        evaluated_model_output: this.sanitizeText(aiResponse),
        evaluated_model_retrieved_context: contextText,
        evaluated_model_gold_answer: stepData?.successResponse || "",
        evaluated_model_system_prompt: stepData?.systemPrompt || null,
        task_context: JSON.stringify(taskContext),
        tags: this.sanitizeTags({
          ...this.defaultMetadata,
          ...stepData
        })
      };

      // Removed console.log(`[Patronus #${evaluationId}] Sending request to /v1/evaluate with evaluators:`, evaluatorsConfig);
      const result = await this.sendRequest('POST', '/v1/evaluate', payload);
      // Removed console.log(`[Patronus #${evaluationId}] Evaluation completed successfully`, result ? 'with response' : 'with null response');
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

// We're using a mock version of this in routes.ts

export const patronus = new PatronusClient({
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
      //Removed console.log(`[Patronus Middleware #${debugId}] Processing ${req.method} ${fullPath}`);

      // Skip evaluation for non-conversation routes
      if (!fullPath.includes('/conversation')) {
        //Removed console.log(`[Patronus Middleware #${debugId}] Skipping: Not a conversation route`);
        return;
      }

      // Skip evaluation for conversation creation
      if (req.method === 'POST' && fullPath === '/api/conversation') {
        //Removed console.log(`[Patronus Middleware #${debugId}] Skipping: Conversation creation`);
        return;
      }

      // Skip for GET requests
      if (req.method === 'GET') {
        //Removed console.log(`[Patronus Middleware #${debugId}] Skipping: GET request`);
        return;
      }

      // Extract conversation ID from URL path for POST message requests
      const pathMatch = fullPath.match(/\/api\/conversation\/(\d+)\/message/);
      if (!pathMatch || !pathMatch[1]) {
        //Removed console.log(`[Patronus Middleware #${debugId}] Skipping: Invalid path pattern`, fullPath);
        return;
      }

      //Removed console.log(`[Patronus Middleware #${debugId}] Processing message for conversation ${pathMatch[1]}`);

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

      // Create context pairs for the previous 4 conversation exchanges
      const contextPairs: Array<{user: string; assistant: string}> = [];

      // Get all user messages
      const userMessages = messages.filter(msg => msg.role === 'user');
      // Get all assistant messages
      const allAssistantMessages = messages.filter(msg => msg.role === 'assistant');

      // Create pairs by matching indexes
      for (let i = 0; i < Math.min(userMessages.length, allAssistantMessages.length) - 1; i++) {
        contextPairs.push({
          user: userMessages[i].content,
          assistant: allAssistantMessages[i].content
        });
      }

      // Limit to the last 4 pairs
      const limitedContextPairs = contextPairs.slice(-4);

      //Removed console.log(`[Patronus Middleware #${debugId}] Including ${limitedContextPairs.length} previous conversation pairs for context`);

      // Get metadata from current message (if exists)
      const metadataObj = currentAiMessage?.metadata 
        ? (typeof currentAiMessage.metadata === 'string' 
            ? JSON.parse(currentAiMessage.metadata) 
            : currentAiMessage.metadata)
        : {};

      // Get conversation evaluators
      const conversationEvaluators = await storage.getConversationEvaluators(conversationId);
      
      // Get full evaluator details for each evaluator in this conversation
      const activeEvaluators: Evaluator[] = [];
      if (conversationEvaluators && conversationEvaluators.length > 0) {
        for (const convEval of conversationEvaluators) {
          if (convEval.isActive) {
            const evaluator = await storage.getEvaluator(convEval.evaluatorId);
            if (evaluator) {
              activeEvaluators.push(evaluator);
            }
          }
        }
      }
      
      console.log(`[Patronus Middleware] Found ${activeEvaluators.length} active evaluators for conversation ${conversationId}`);
      
      if (activeEvaluators.length > 0) {
        console.log(`[Patronus Middleware] Using these evaluators for conversation ${conversationId}:`, 
          activeEvaluators.map(e => `${e.id}:${e.name}`).join(', '));
      } else {
        console.log(`[Patronus Middleware] Warning: No active evaluators found for conversation ${conversationId}`);
      }
      
      // Fire-and-forget evaluation with context pairs
      patronus.evaluateMessage(
        userMessage?.content || '',
        currentAiMessage?.content || '',
        previousAiMessage?.content || '',
        {
          ...stepData,
          conversationId,
          activityName: 'Language Activity', // Add fallback values for missing properties
          llm_advancement_decision: metadataObj?.shouldAdvance || false
        },
        limitedContextPairs,
        activeEvaluators // Pass the active evaluators
      )
      .then(result => {
        console.log(`[Patronus Middleware] Evaluation completed for conversation ${conversationId} with evaluators:`, 
          activeEvaluators.map(e => e.name).join(', '));
      })
      .catch(error => {
        console.error(`[Patronus Middleware] Background evaluation error for conversation ${conversationId}:`, error);
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
    //Removed console.log('Evaluating response with step data:', stepData);
    
    // If this evaluation is associated with a conversation, get the selected evaluators
    let conversationEvaluators = [];
    if (stepData && stepData.conversationId) {
      const conversationId = stepData.conversationId;
      const evaluatorAssignments = await storage.getConversationEvaluators(conversationId);
      
      if (evaluatorAssignments && evaluatorAssignments.length > 0) {
        for (const assignment of evaluatorAssignments) {
          if (assignment.isActive) {
            const evaluator = await storage.getEvaluator(assignment.evaluatorId);
            if (evaluator) {
              conversationEvaluators.push(evaluator);
            }
          }
        }
      }
    }
    
    const evaluation = await patronus.evaluateMessage(
      userInput,
      aiResponse,
      '', // No previous AI message available in this context
      {
        ...stepData,
        activityName: stepData?.activityName || 'Language Activity'
      },
      undefined, // No context pairs in this context
      conversationEvaluators // Pass the conversation evaluators if available
    );

    const step = await storage.getStepByActivityAndNumber(stepData.activityId, stepData.stepNumber);

    const enrichedMetadata = {
      objective: step?.objective,
      expectedResponses: step?.expectedResponses,
      evaluation,
      ...metadata
    };

    return evaluation;
  } catch (error) {
    console.error('Patronus evaluation error:', error);
    return null;
  }
}