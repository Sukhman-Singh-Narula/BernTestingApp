import { ActivityScript, Conversation, Message, type InsertConversation } from "@shared/schema";

export interface IStorage {
  getScriptByStep(step: number): Promise<ActivityScript | undefined>;
  getAllScripts(): Promise<ActivityScript[]>;
  createConversation(): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  updateConversation(id: number, messages: Message[], currentStep: number): Promise<Conversation>;
}

export class MemStorage implements IStorage {
  private scripts: Map<number, ActivityScript>;
  private conversations: Map<number, Conversation>;
  private nextConvId: number;

  constructor() {
    this.scripts = new Map();
    this.conversations = new Map();
    this.nextConvId = 1;
    
    // Initialize with sample script
    this.scripts.set(1, {
      id: 1,
      stepNumber: 1,
      instruction: "Greet the child and ask their name",
      allowedResponses: "Any name response",
      nextPrompt: "Hello {name}! Let's learn some new words today. Are you ready?"
    });
    // Add more steps as needed
  }

  async getScriptByStep(step: number): Promise<ActivityScript | undefined> {
    return this.scripts.get(step);
  }

  async getAllScripts(): Promise<ActivityScript[]> {
    return Array.from(this.scripts.values());
  }

  async createConversation(): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.nextConvId++,
      currentStep: 1,
      messages: []
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async updateConversation(
    id: number, 
    messages: Message[], 
    currentStep: number
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id,
      messages,
      currentStep
    };
    this.conversations.set(id, conversation);
    return conversation;
  }
}

export const storage = new MemStorage();
