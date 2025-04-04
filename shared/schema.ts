import { pgTable, text, serial, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  hidden: boolean("hidden").notNull().default(false),
  language: text("language").notNull().default('Spanish')
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
  systemPromptId: integer("system_prompt_id").references(() => activitySystemPrompts.id),
  choiceLayerPromptId: integer("choice_layer_prompt_id").references(() => choiceLayerPrompts.id),
  previousActivityId: integer("previous_activity_id").references(() => activities.id)
});

// New messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  stepId: integer("step_id").notNull().references(() => steps.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // Stored as JSON string in the database
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

// Add new evaluators table after the messageMetrics table
export const evaluators = pgTable("evaluators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pass_criteria: text("pass_criteria"),
  family: text("family"),
  description: text("description"),
  is_patronus_managed: boolean("is_patronus_managed").notNull().default(false),
  public_id: text("public_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata")
});

export const conversationEvaluators = pgTable("conversation_evaluators", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  evaluatorId: integer("evaluator_id").notNull().references(() => evaluators.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// Add system_prompt table definition
export const choiceLayerPrompts = pgTable("choice_layer_prompts", {
  id: serial("id").primaryKey(),
  systemPrompt: text("system_prompt").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull()
});

export const activitySystemPrompts = pgTable("activity_system_prompts", {
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
  systemPrompts: many(activitySystemPrompts)
}));

export const stepsRelations = relations(steps, ({ one, many }) => ({
  activity: one(activities, {
    fields: [steps.activityId],
    references: [activities.id],
  }),
  messages: many(messages)
}));

// Update conversation relations to include system prompt, choice layer prompt, previous activity and evaluators
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  activity: one(activities, {
    fields: [conversations.activityId],
    references: [activities.id],
  }),
  previousActivity: one(activities, {
    fields: [conversations.previousActivityId],
    references: [activities.id],
  }),
  messages: many(messages),
  systemPrompt: one(activitySystemPrompts, {
    fields: [conversations.systemPromptId],
    references: [activitySystemPrompts.id],
  }),
  choiceLayerPrompt: one(choiceLayerPrompts, {
    fields: [conversations.choiceLayerPromptId],
    references: [choiceLayerPrompts.id],
  }),
  evaluators: many(conversationEvaluators)
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
export const activitySystemPromptsRelations = relations(activitySystemPrompts, ({ one }) => ({
  activity: one(activities, {
    fields: [activitySystemPrompts.activityId],
    references: [activities.id],
  })
}));

// Add these relations after the existing relations
export const evaluatorsRelations = relations(evaluators, ({ many }) => ({
  conversationEvaluators: many(conversationEvaluators)
}));

export const conversationEvaluatorsRelations = relations(conversationEvaluators, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationEvaluators.conversationId],
    references: [conversations.id],
  }),
  evaluator: one(evaluators, {
    fields: [conversationEvaluators.evaluatorId],
    references: [evaluators.id],
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

// Add insert schema for choice layer prompts
export const insertChoiceLayerPromptSchema = createInsertSchema(choiceLayerPrompts).omit({
  id: true,
  createdAt: true
});

// Add insert schema for system prompts
export const insertActivitySystemPromptSchema = createInsertSchema(activitySystemPrompts).omit({
  id: true,
  createdAt: true
});

// Add insert schemas for new tables
export const insertEvaluatorSchema = createInsertSchema(evaluators).omit({
  id: true
});

export const insertConversationEvaluatorSchema = createInsertSchema(conversationEvaluators).omit({
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

// Add type exports for choice layer prompts
export type ChoiceLayerPrompt = typeof choiceLayerPrompts.$inferSelect;
export type InsertChoiceLayerPrompt = z.infer<typeof insertChoiceLayerPromptSchema>;

// Add type exports for system prompts
export type ActivitySystemPrompt = typeof activitySystemPrompts.$inferSelect;
export type InsertActivitySystemPrompt = z.infer<typeof insertActivitySystemPromptSchema>;

// Add type exports
export type Evaluator = typeof evaluators.$inferSelect;
export type InsertEvaluator = z.infer<typeof insertEvaluatorSchema>;
export type ConversationEvaluator = typeof conversationEvaluators.$inferSelect;
export type InsertConversationEvaluator = z.infer<typeof insertConversationEvaluatorSchema>;

// Message role type (used in the frontend)
export type MessageRole = 'user' | 'assistant';