// Test script to verify evaluator assignments
import { storage } from './server/storage.js';
import { db } from './server/db.js';
import { conversations } from './shared/schema.js';

async function main() {
  try {
    console.log('🔍 Testing evaluator assignments...');
    
    // Get all evaluators
    const evaluators = await storage.getAllEvaluators();
    console.log(`📋 Found ${evaluators.length} evaluators:`);
    evaluators.forEach(e => console.log(`   - ${e.id}: ${e.name} (${e.family})`));
    
    // Get the first conversation in the database
    // This is just for testing purposes
    const allConversations = await getAllConversations();
    if (!allConversations || allConversations.length === 0) {
      console.log('❌ No conversations found. Please create a conversation first.');
      return;
    }
    
    const conversation = allConversations[0];
    console.log(`🗣️ Using conversation #${conversation.id} for testing`);
    
    // Get current evaluators for this conversation
    const currentEvaluators = await storage.getConversationEvaluators(conversation.id);
    console.log(`📋 Found ${currentEvaluators.length} evaluators assigned to conversation #${conversation.id}:`);
    
    for (const assignment of currentEvaluators) {
      const evaluator = await storage.getEvaluator(assignment.evaluatorId);
      if (evaluator) {
        console.log(`   - ${evaluator.id}: ${evaluator.name} (${evaluator.family}) - Active: ${assignment.isActive}`);
      } else {
        console.log(`   - Evaluator ID ${assignment.evaluatorId} not found - Active: ${assignment.isActive}`);
      }
    }
    
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function getAllConversations() {
  try {
    // Direct database query to get all conversations
    return await db.select().from(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

main();