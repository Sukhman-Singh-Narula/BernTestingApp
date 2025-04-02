import { activities, steps, conversations, messages, activitySystemPrompts, choiceLayerPrompts, type Activity, type Step, type InsertActivity, type InsertStep, type Conversation, type InsertConversation, type Message, type InsertMessage, messageMetrics, type ActivitySystemPrompt, type InsertActivitySystemPrompt, type ChoiceLayerPrompt, type InsertChoiceLayerPrompt } from "@shared/schema";
import { evaluators, conversationEvaluators, type Evaluator, type InsertEvaluator, type ConversationEvaluator, type InsertConversationEvaluator } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count } from "drizzle-orm";

export interface IStorage {
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getActivity(id: number): Promise<Activity | undefined>;
  getAllActivities(): Promise<Activity[]>;
  getAllActivitiesWithConversationCounts(): Promise<(Activity & { conversationCount: number })[]>;
  updateActivityHidden(id: number, hidden: boolean): Promise<Activity>;
  getAllVisibleActivities(): Promise<Activity[]>;
  getAllVisibleActivitiesWithConversationCounts(): Promise<(Activity & { conversationCount: number })[]>;

  // Step operations
  createStep(step: InsertStep): Promise<Step>;
  getStepsByActivity(activityId: number): Promise<Step[]>;
  getStepByActivityAndNumber(activityId: number, stepNumber: number): Promise<Step | undefined>;

  // Conversation operations
  createConversation(conversation: InsertConversation & { systemPrompt?: string, choiceLayerPrompt?: string, choiceLayerPromptId?: number }): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  updateConversation(conversation: Partial<Conversation> & { id: number }): Promise<Conversation>;
  updateConversationStep(id: number, currentStep: number): Promise<Conversation>;
  updateConversationActivity(id: number, activityId: number, previousActivityId: number): Promise<Conversation>;
  getConversationWithSystemPrompt(id: number): Promise<(Conversation & { systemPrompt?: ActivitySystemPrompt, choiceLayerPrompt?: ChoiceLayerPrompt }) | undefined>;

  // Message operations
  createMessage(message: InsertMessage & { metadata?: Record<string, any> }): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;

  // Add system prompt operations
  createActivitySystemPrompt(prompt: InsertActivitySystemPrompt): Promise<ActivitySystemPrompt>;
  getActivitySystemPromptByActivity(activityId: number): Promise<ActivitySystemPrompt | undefined>;
  getActivitySystemPromptsByActivity(activityId: number): Promise<ActivitySystemPrompt[]>;

  // Choice layer prompt operations
  createChoiceLayerPrompt(prompt: InsertChoiceLayerPrompt): Promise<ChoiceLayerPrompt>;
  getChoiceLayerPrompt(id: number): Promise<ChoiceLayerPrompt | undefined>;
  getLatestChoiceLayerPrompt(): Promise<ChoiceLayerPrompt | undefined>;
  getAllChoiceLayerPrompts(): Promise<ChoiceLayerPrompt[]>;

  // Evaluator operations
  createEvaluator(evaluator: InsertEvaluator): Promise<Evaluator>;
  getEvaluator(id: number): Promise<Evaluator | undefined>;
  getAllEvaluators(): Promise<Evaluator[]>;

  // Conversation evaluator operations
  assignEvaluatorToConversation(data: InsertConversationEvaluator): Promise<ConversationEvaluator>;
  getConversationEvaluators(conversationId: number): Promise<ConversationEvaluator[]>;
  toggleEvaluator(conversationId: number, evaluatorId: number, isActive: boolean): Promise<ConversationEvaluator>;
}

export class DatabaseStorage implements IStorage {
  // Activity operations
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [created] = await db.insert(activities).values(activity).returning();
    return created;
  }

  async getActivity(id: number): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity;
  }

  async getAllActivities(): Promise<Activity[]> {
    return await db.select().from(activities);
  }

  async getAllActivitiesWithConversationCounts(): Promise<(Activity & { conversationCount: number })[]> {
    const activitiesWithCounts = await db
      .select({
        id: activities.id,
        name: activities.name,
        contentType: activities.contentType,
        totalSteps: activities.totalSteps,
        createdBy: activities.createdBy,
        createdAt: activities.createdAt,
        hidden: activities.hidden,
        language: activities.language,
        conversationCount: count(conversations.id)
      })
      .from(activities)
      .leftJoin(conversations, eq(activities.id, conversations.activityId))
      .groupBy(activities.id)
      .orderBy(desc(activities.createdAt));

    return activitiesWithCounts;
  }

  async updateActivityHidden(id: number, hidden: boolean): Promise<Activity> {
    const [updated] = await db
      .update(activities)
      .set({ hidden })
      .where(eq(activities.id, id))
      .returning();
    return updated;
  }

  async getAllVisibleActivities(): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .where(eq(activities.hidden, false));
  }

  async getAllVisibleActivitiesWithConversationCounts(): Promise<(Activity & { conversationCount: number })[]> {
    const activitiesWithCounts = await db
      .select({
        id: activities.id,
        name: activities.name,
        contentType: activities.contentType,
        totalSteps: activities.totalSteps,
        createdBy: activities.createdBy,
        createdAt: activities.createdAt,
        hidden: activities.hidden,
        language: activities.language,
        conversationCount: count(conversations.id)
      })
      .from(activities)
      .leftJoin(conversations, eq(activities.id, conversations.activityId))
      .where(eq(activities.hidden, false))
      .groupBy(activities.id)
      .orderBy(desc(activities.createdAt));

    return activitiesWithCounts;
  }


  // Step operations
  async createStep(step: InsertStep): Promise<Step> {
    const [created] = await db.insert(steps).values(step).returning();
    return created;
  }

  async getStepsByActivity(activityId: number): Promise<Step[]> {
    return await db
      .select()
      .from(steps)
      .where(eq(steps.activityId, activityId))
      .orderBy(steps.stepNumber);
  }

  async getStepByActivityAndNumber(activityId: number, stepNumber: number): Promise<Step | undefined> {
    const [step] = await db
      .select()
      .from(steps)
      .where(
        and(
          eq(steps.activityId, activityId),
          eq(steps.stepNumber, stepNumber)
        )
      );
    return step;
  }

  // Conversation operations
  async createConversation(conversation: InsertConversation & { 
    systemPrompt?: string, 
    choiceLayerPrompt?: string,
    choiceLayerPromptId?: number  
  }): Promise<Conversation> {
    let systemPromptId: number | undefined;
    let choiceLayerPromptId: number | undefined;

    // If a new system prompt is provided, create it
    if (conversation.systemPrompt) {
      const [createdPrompt] = await db.insert(activitySystemPrompts).values({
        systemPrompt: conversation.systemPrompt,
        activityId: conversation.activityId,
        createdBy: conversation.userName
      }).returning();
      systemPromptId = createdPrompt.id;
    } else {
      // Get the most recent system prompt for this activity
      const [latestPrompt] = await db
        .select()
        .from(activitySystemPrompts)
        .where(eq(activitySystemPrompts.activityId, conversation.activityId))
        .orderBy(desc(activitySystemPrompts.createdAt))
        .limit(1);
      systemPromptId = latestPrompt?.id;
    }

    // If a choiceLayerPromptId is directly provided, use it
    if (conversation.choiceLayerPromptId) {
      choiceLayerPromptId = conversation.choiceLayerPromptId;
    } 
    // If a choice layer prompt text is provided, create it
    else if (conversation.choiceLayerPrompt) {
      const [createdPrompt] = await db.insert(choiceLayerPrompts).values({
        systemPrompt: conversation.choiceLayerPrompt,
        createdBy: conversation.userName
      }).returning();
      choiceLayerPromptId = createdPrompt.id;
    } else {
      // Get the most recent choice layer prompt
      const [latestPrompt] = await db
        .select()
        .from(choiceLayerPrompts)
        .orderBy(desc(choiceLayerPrompts.createdAt))
        .limit(1);
      choiceLayerPromptId = latestPrompt?.id;
    }

    const [created] = await db.insert(conversations)
      .values({
        ...conversation,
        systemPromptId,
        choiceLayerPromptId
      })
      .returning();
    return created;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async updateConversationStep(id: number, currentStep: number): Promise<Conversation> {
    const [updated] = await db
      .update(conversations)
      .set({ currentStep })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async updateConversationActivity(id: number, activityId: number, previousActivityId: number): Promise<Conversation> {
    // First, get the system prompt ID for the new activity
    const systemPrompt = await this.getActivitySystemPromptByActivity(activityId);

    // Get the first step of the new activity
    const [firstStep] = await db
      .select()
      .from(steps)
      .where(eq(steps.activityId, activityId))
      .orderBy(steps.stepNumber)
      .limit(1);

    if (!firstStep) {
      throw new Error(`No steps found for activity ${activityId}`);
    }

    // Update conversation with the new activity, system prompt, and step
    const [updated] = await db
      .update(conversations)
      .set({ 
        activityId,
        previousActivityId,
        currentStep: firstStep.stepNumber,
        systemPromptId: systemPrompt?.id
      })
      .where(eq(conversations.id, id))
      .returning();

    console.log(`Updated conversation ${id} with new activity ${activityId}, system prompt ID ${systemPrompt?.id || 'none'}, and step ${firstStep.stepNumber}`);
    return updated;
  }

  async updateConversation(conversation: Partial<Conversation> & { id: number }): Promise<Conversation> {
    const { id, ...updateData } = conversation;
    const [updated] = await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async getConversationWithSystemPrompt(id: number): Promise<(Conversation & { systemPrompt?: ActivitySystemPrompt, choiceLayerPrompt?: ChoiceLayerPrompt }) | undefined> {
    const [result] = await db
      .select({
        id: conversations.id,
        activityId: conversations.activityId,
        currentStep: conversations.currentStep,
        userName: conversations.userName,
        systemPromptId: conversations.systemPromptId,
        choiceLayerPromptId: conversations.choiceLayerPromptId,
        previousActivityId: conversations.previousActivityId,
        systemPrompt: activitySystemPrompts,
        choiceLayerPrompt: choiceLayerPrompts
      })
      .from(conversations)
      .leftJoin(activitySystemPrompts, eq(conversations.systemPromptId, activitySystemPrompts.id))
      .leftJoin(choiceLayerPrompts, eq(conversations.choiceLayerPromptId, choiceLayerPrompts.id))
      .where(eq(conversations.id, id));

    if (!result) return undefined;

    // Convert the joined query result to the expected return type
    return {
      id: result.id,
      activityId: result.activityId,
      currentStep: result.currentStep,
      userName: result.userName,
      systemPromptId: result.systemPromptId,
      choiceLayerPromptId: result.choiceLayerPromptId,
      previousActivityId: result.previousActivityId,
      systemPrompt: result.systemPrompt || undefined,
      choiceLayerPrompt: result.choiceLayerPrompt || undefined
    };
  }

  // Message operations
  async createMessage(message: InsertMessage & { metadata?: Record<string, any> }): Promise<Message> {
    const messageData = {
      ...message,
      metadata: message.metadata ? JSON.stringify(message.metadata) : null
    };
    const [created] = await db.insert(messages).values(messageData).returning();
    return created;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    // Ensure conversationId is a valid integer to prevent NaN errors
    if (!conversationId || isNaN(conversationId)) {
      console.error(`Invalid conversation ID: ${conversationId}`);
      return [];
    }

    // Convert to a number to ensure it's a valid integer
    const validConversationId = Number(conversationId);

    const messagesWithMetrics = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        stepId: messages.stepId,
        role: messages.role,
        content: messages.content,
        metadata: messages.metadata,
        createdAt: messages.createdAt,
        metrics: {
          id: messageMetrics.id,
          messageId: messageMetrics.messageId,
          promptTokens: messageMetrics.promptTokens,
          completionTokens: messageMetrics.completionTokens,
          totalTokens: messageMetrics.totalTokens,
          costUsd: messageMetrics.costUsd,
          latencyMs: messageMetrics.latencyMs,
          createdAt: messageMetrics.createdAt
        }
      })
      .from(messages)
      .leftJoin(messageMetrics, eq(messages.id, messageMetrics.messageId))
      .where(eq(messages.conversationId, validConversationId))
      .orderBy(messages.createdAt);

    // Convert the joined query result to the expected Message type
    return messagesWithMetrics.map(msg => ({
      id: msg.id,
      conversationId: msg.conversationId,
      stepId: msg.stepId,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
      createdAt: msg.createdAt
    }));
  }

  // Add system prompt operations implementation
  async createActivitySystemPrompt(prompt: InsertActivitySystemPrompt): Promise<ActivitySystemPrompt> {
    const [created] = await db.insert(activitySystemPrompts).values(prompt).returning();
    return created;
  }

  async getActivitySystemPromptByActivity(activityId: number): Promise<ActivitySystemPrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(activitySystemPrompts)
      .where(eq(activitySystemPrompts.activityId, activityId))
      .orderBy(desc(activitySystemPrompts.createdAt))
      .limit(1);
    return prompt;
  }

  async getActivitySystemPromptsByActivity(activityId: number): Promise<ActivitySystemPrompt[]> {
    return await db
      .select()
      .from(activitySystemPrompts)
      .where(eq(activitySystemPrompts.activityId, activityId))
      .orderBy(desc(activitySystemPrompts.createdAt))
      .limit(10);
  }

  // Choice layer prompt operations
  async createChoiceLayerPrompt(prompt: InsertChoiceLayerPrompt): Promise<ChoiceLayerPrompt> {
    const [created] = await db.insert(choiceLayerPrompts).values(prompt).returning();
    return created;
  }

  async getChoiceLayerPrompt(id: number): Promise<ChoiceLayerPrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(choiceLayerPrompts)
      .where(eq(choiceLayerPrompts.id, id));
    return prompt;
  }

  async getLatestChoiceLayerPrompt(): Promise<ChoiceLayerPrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(choiceLayerPrompts)
      .orderBy(desc(choiceLayerPrompts.createdAt))
      .limit(1);
    return prompt;
  }

  async getAllChoiceLayerPrompts(): Promise<ChoiceLayerPrompt[]> {
    return await db
      .select()
      .from(choiceLayerPrompts)
      .orderBy(desc(choiceLayerPrompts.createdAt))
      .limit(10);
  }

  // Evaluator operations
  async createEvaluator(evaluator: InsertEvaluator): Promise<Evaluator> {
    const [created] = await db.insert(evaluators).values(evaluator).returning();
    return created;
  }

  async getEvaluator(id: number): Promise<Evaluator | undefined> {
    const [evaluator] = await db
      .select()
      .from(evaluators)
      .where(eq(evaluators.id, id));
    return evaluator;
  }

  async getAllEvaluators(): Promise<Evaluator[]> {
    return await db.select().from(evaluators);
  }

  // Conversation evaluator operations
  async assignEvaluatorToConversation(data: InsertConversationEvaluator): Promise<ConversationEvaluator> {
    const [created] = await db.insert(conversationEvaluators).values(data).returning();
    return created;
  }

  async removeConversationEvaluators(conversationId: number): Promise<void> {
    await db
      .delete(conversationEvaluators)
      .where(eq(conversationEvaluators.conversationId, conversationId));
  }

  async getConversationEvaluators(conversationId: number): Promise<ConversationEvaluator[]> {
    return await db
      .select()
      .from(conversationEvaluators)
      .where(eq(conversationEvaluators.conversationId, conversationId));
  }

  async toggleEvaluator(conversationId: number, evaluatorId: number, isActive: boolean): Promise<ConversationEvaluator> {
    const [updated] = await db
      .update(conversationEvaluators)
      .set({ isActive })
      .where(
        and(
          eq(conversationEvaluators.conversationId, conversationId),
          eq(conversationEvaluators.evaluatorId, evaluatorId)
        )
      )
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();