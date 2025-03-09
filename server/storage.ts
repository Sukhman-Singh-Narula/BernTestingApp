import { activities, steps, conversations, messages, systemPrompts, type Activity, type Step, type InsertActivity, type InsertStep, type Conversation, type InsertConversation, type Message, type InsertMessage, messageMetrics, type SystemPrompt, type InsertSystemPrompt } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getActivity(id: number): Promise<Activity | undefined>;
  getAllActivities(): Promise<Activity[]>;

  // Step operations
  createStep(step: InsertStep): Promise<Step>;
  getStepsByActivity(activityId: number): Promise<Step[]>;
  getStepByActivityAndNumber(activityId: number, stepNumber: number): Promise<Step | undefined>;

  // Conversation operations
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  updateConversationStep(id: number, currentStep: number): Promise<Conversation>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;

  // Add system prompt operations
  createSystemPrompt(prompt: InsertSystemPrompt): Promise<SystemPrompt>;
  getSystemPromptByActivity(activityId: number): Promise<SystemPrompt | undefined>;
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
  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conversation).returning();
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

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
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
      .where(eq(messages.conversationId, conversationId))
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
}

export const storage = new DatabaseStorage();