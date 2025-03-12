import { activities, steps, conversations, messages, systemPrompts, type Activity, type Step, type InsertActivity, type InsertStep, type Conversation, type InsertConversation, type Message, type InsertMessage, messageMetrics, type SystemPrompt, type InsertSystemPrompt } from "@shared/schema";
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
  createConversation(conversation: InsertConversation & { systemPrompt?: string }): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  updateConversationStep(id: number, currentStep: number): Promise<Conversation>;
  getConversationWithSystemPrompt(id: number): Promise<(Conversation & { systemPrompt?: SystemPrompt }) | undefined>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;

  // Add system prompt operations
  createSystemPrompt(prompt: InsertSystemPrompt): Promise<SystemPrompt>;
  getSystemPromptByActivity(activityId: number): Promise<SystemPrompt | undefined>;
  getSystemPromptsByActivity(activityId: number): Promise<SystemPrompt[]>;
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
  async createConversation(conversation: InsertConversation & { systemPrompt?: string }): Promise<Conversation> {
    let systemPromptId: number | undefined;

    // If a new system prompt is provided, create it
    if (conversation.systemPrompt) {
      const [createdPrompt] = await db.insert(systemPrompts).values({
        systemPrompt: conversation.systemPrompt,
        activityId: conversation.activityId,
        createdBy: conversation.userName
      }).returning();
      systemPromptId = createdPrompt.id;
    } else {
      // Get the most recent system prompt for this activity
      const [latestPrompt] = await db
        .select()
        .from(systemPrompts)
        .where(eq(systemPrompts.activityId, conversation.activityId))
        .orderBy(desc(systemPrompts.createdAt))
        .limit(1);
      systemPromptId = latestPrompt?.id;
    }

    const [created] = await db.insert(conversations)
      .values({
        ...conversation,
        systemPromptId
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

  async getConversationWithSystemPrompt(id: number): Promise<(Conversation & { systemPrompt?: SystemPrompt }) | undefined> {
    const [conversation] = await db
      .select({
        id: conversations.id,
        activityId: conversations.activityId,
        currentStep: conversations.currentStep,
        userName: conversations.userName,
        systemPrompt: systemPrompts
      })
      .from(conversations)
      .leftJoin(systemPrompts, eq(conversations.systemPromptId, systemPrompts.id))
      .where(eq(conversations.id, id));

    return conversation;
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
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
    
    return await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        stepId: messages.stepId,
        role: messages.role,
        content: messages.content,
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
  }

  // Add system prompt operations implementation
  async createSystemPrompt(prompt: InsertSystemPrompt): Promise<SystemPrompt> {
    const [created] = await db.insert(systemPrompts).values(prompt).returning();
    return created;
  }

  async getSystemPromptByActivity(activityId: number): Promise<SystemPrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.activityId, activityId))
      .orderBy(desc(systemPrompts.createdAt))
      .limit(1);
    return prompt;
  }

  async getSystemPromptsByActivity(activityId: number): Promise<SystemPrompt[]> {
    return await db
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.activityId, activityId))
      .orderBy(desc(systemPrompts.createdAt))
      .limit(10);
  }
}

export const storage = new DatabaseStorage();