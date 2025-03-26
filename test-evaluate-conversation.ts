// Test script to verify the evaluator assignment and usage flow
import { storage } from './server/storage';
import { db } from './server/db';
import { conversations, conversationEvaluators } from './shared/schema';

async function main() {
  try {
    console.log('🔍 Testing evaluator assignment flow...');
    
    // Get all evaluators
    const evaluators = await storage.getAllEvaluators();
    console.log(`📋 Found ${evaluators.length} evaluators in the database:`);
    evaluators.forEach(e => console.log(`   - ${e.id}: ${e.name} (${e.family})`));
    
    // Get all conversations and sort them in memory by ID descending
    const allConversations = await db.select().from(conversations);
    allConversations.sort((a, b) => b.id - a.id); // Sort in descending order
    console.log(`📋 Found ${allConversations.length} conversations in the database`);
    
    if (allConversations.length === 0) {
      console.log('❌ No conversations found. Please create a conversation first.');
      return;
    }
    
    // Get all conversation evaluator assignments
    const allAssignments = await db.select().from(conversationEvaluators);
    console.log(`📋 Found ${allAssignments.length} total evaluator assignments in the database`);
    
    // Check each conversation - look at the 5 most recent
    for (const conversation of allConversations.slice(0, 5)) { // Limit to 5 most recent conversations
      console.log(`\n🗣️ Checking conversation #${conversation.id}:`);
      
      // Get evaluators for this conversation
      const conversationEvals = await storage.getConversationEvaluators(conversation.id);
      console.log(`   - Found ${conversationEvals.length} evaluators assigned to conversation #${conversation.id}`);
      
      if (conversationEvals.length > 0) {
        for (const assignment of conversationEvals) {
          const evaluator = await storage.getEvaluator(assignment.evaluatorId);
          if (evaluator) {
            console.log(`     - ${evaluator.id}: ${evaluator.name} (${evaluator.family}) - Active: ${assignment.isActive}`);
          } else {
            console.log(`     - Evaluator ID ${assignment.evaluatorId} not found - Active: ${assignment.isActive}`);
          }
        }
      } else {
        console.log('     - No evaluators assigned to this conversation');
        
        // Test assigning an evaluator to this conversation
        console.log(`   - Testing assigning evaluator to conversation #${conversation.id}...`);
        const testEvaluator = evaluators[0]; // Use the first evaluator for testing
        
        try {
          // First remove any existing evaluators (shouldn't be any, but just to be safe)
          await storage.removeConversationEvaluators(conversation.id);
          
          // Now assign the test evaluator
          const assignment = await storage.assignEvaluatorToConversation({
            conversationId: conversation.id,
            evaluatorId: testEvaluator.id,
            isActive: true
          });
          
          console.log(`   - ✅ Successfully assigned evaluator ${testEvaluator.id}:${testEvaluator.name} to conversation ${conversation.id}`);
          
          // Verify the assignment
          const updatedAssignments = await storage.getConversationEvaluators(conversation.id);
          console.log(`   - After assignment: Found ${updatedAssignments.length} evaluators assigned to conversation #${conversation.id}`);
          
          // Remove the test evaluator
          await storage.removeConversationEvaluators(conversation.id);
          console.log(`   - Removed test evaluator assignment`);
        } catch (error) {
          console.error(`   - ❌ Error assigning evaluator: ${error}`);
        }
      }
    }
    
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

main();