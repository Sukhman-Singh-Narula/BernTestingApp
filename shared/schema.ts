import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
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
  totalSteps: integer("total_steps").notNull()
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

// Conversation table
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => activities.id),
  currentStep: integer("current_step").notNull().default(1),
  messages: text("messages").array().notNull().default([])
});

// Define relationships
export const activitiesRelations = relations(activities, ({ many }) => ({
  steps: many(steps),
  conversations: many(conversations)
}));

export const stepsRelations = relations(steps, ({ one }) => ({
  activity: one(activities, {
    fields: [steps.activityId],
    references: [activities.id],
  })
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  activity: one(activities, {
    fields: [conversations.activityId],
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

// Export types
export type ActivityScript = typeof activityScripts.$inferSelect;
export type InsertActivityScript = z.infer<typeof insertScriptSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Step = typeof steps.$inferSelect;
export type InsertStep = z.infer<typeof insertStepSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};