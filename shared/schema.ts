import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const activityScripts = pgTable("activity_scripts", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull(),
  instruction: text("instruction").notNull(),
  allowedResponses: text("allowed_responses").notNull(),
  nextPrompt: text("next_prompt").notNull()
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  currentStep: integer("current_step").notNull().default(1),
  messages: text("messages").array().notNull()
});

export const insertScriptSchema = createInsertSchema(activityScripts).omit({ 
  id: true 
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ 
  id: true 
});

export type ActivityScript = typeof activityScripts.$inferSelect;
export type InsertActivityScript = z.infer<typeof insertScriptSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};
