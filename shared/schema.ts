import { pgTable, text, serial, integer, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const activityScripts = pgTable("activity_scripts", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull(),
  instruction: text("instruction").notNull(),
  allowedResponses: text("allowed_responses").notNull(),
  nextPrompt: text("next_prompt").notNull()
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  totalSteps: integer("total_steps").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const steps = pgTable("steps", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => activities.id),
  stepNumber: integer("step_number").notNull(),
  description: text("description").notNull(),
  objective: text("objective").notNull(),
  suggestedScript: text("suggested_script").notNull(),
  spanishWords: text("spanish_words").notNull(),
  expectedResponses: text("expected_responses").notNull(),
  successResponse: text("success_response").notNull()
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => activities.id),
  currentStep: integer("current_step").notNull().default(1),
  userName: text("user_name").notNull(),
  systemPromptId: integer("system_prompt_id").references(() => systemPrompts.id) // Add reference to system prompt
});

// New messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  stepId: integer("step_id").notNull().references(() => steps.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// New metrics table
export const messageMetrics = pgTable("message_metrics", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// Add system_prompt table definition
export const systemPrompts = pgTable("system_prompts", {
  id: serial("id").primaryKey(),
  systemPrompt: text("system_prompt").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  activityId: integer("activity_id").notNull().references(() => activities.id)
});

// Define relationships
export const activitiesRelations = relations(activities, ({ many }) => ({
  steps: many(steps),
  conversations: many(conversations),
  systemPrompts: many(systemPrompts)
}));

export const stepsRelations = relations(steps, ({ one, many }) => ({
  activity: one(activities, {
    fields: [steps.activityId],
    references: [activities.id],
  }),
  messages: many(messages)
}));

// Update conversation relations to include system prompt
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  activity: one(activities, {
    fields: [conversations.activityId],
    references: [activities.id],
  }),
  messages: many(messages),
  systemPrompt: one(systemPrompts, {
    fields: [conversations.systemPromptId],
    references: [systemPrompts.id],
  })
}));

// Add relation to messages
export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  step: one(steps, {
    fields: [messages.stepId],
    references: [steps.id],
  }),
  metrics: one(messageMetrics, {
    fields: [messages.id],
    references: [messageMetrics.messageId],
  })
}));

// Add metrics relations
export const messageMetricsRelations = relations(messageMetrics, ({ one }) => ({
  message: one(messages, {
    fields: [messageMetrics.messageId],
    references: [messages.id],
  })
}));

// Add relation to activities
export const systemPromptsRelations = relations(systemPrompts, ({ one }) => ({
  activity: one(activities, {
    fields: [systemPrompts.activityId],
    references: [activities.id],
  })
}));


// Create insert schemas
export const insertScriptSchema = createInsertSchema(activityScripts).omit({
  id: true
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true
});

export const insertStepSchema = createInsertSchema(steps).omit({
  id: true
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true
});

// Create insert schema for metrics
export const insertMessageMetricsSchema = createInsertSchema(messageMetrics).omit({
  id: true,
  createdAt: true
});

// Add insert schema for system prompts
export const insertSystemPromptSchema = createInsertSchema(systemPrompts).omit({
  id: true,
  createdAt: true
});

// Export types
export type ActivityScript = typeof activityScripts.$inferSelect;
export type InsertActivityScript = z.infer<typeof insertScriptSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Step = typeof steps.$inferSelect;
export type InsertStep = z.infer<typeof insertStepSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Add metrics type exports
export type MessageMetrics = typeof messageMetrics.$inferSelect;
export type InsertMessageMetrics = z.infer<typeof insertMessageMetricsSchema>;

// Add type exports for system prompts
export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type InsertSystemPrompt = z.infer<typeof insertSystemPromptSchema>;

// Message role type (used in the frontend)
export type MessageRole = 'user' | 'assistant';