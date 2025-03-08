import { activities, steps, conversations, messages, type Activity, type Step, type InsertActivity, type InsertStep, type Conversation, type InsertConversation, type Message, type InsertMessage } from "@shared/schema";
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

  // Updated conversation operations
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

  // New message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt, desc);
  }
}

export const storage = new DatabaseStorage();