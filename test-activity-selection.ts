import fetch from 'node-fetch';

const baseUrl = 'http://localhost:5000/api';

async function createConversation() {
  // Start with the Activity Selection activity (ID: 3)
  const response = await fetch(`${baseUrl}/conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      activityId: 3,
      userName: 'test-user',
      shouldGenerateFirstResponse: true
    }),
  });

  const data = await response.json();
  console.log('Created conversation:', data.id);
  console.log('Initial message:', data.messages[0].content);
  return data.id;
}

async function sendMessage(conversationId: number, message: string) {
  console.log(`\nUser: ${message}`);

  const response = await fetch(`${baseUrl}/conversation/${conversationId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
    }),
  });

  const data = await response.json();
  return data;
}

// Function to wait for the assistant's response
async function waitForResponse(conversationId: number, lastMessageId: number) {
  let attempt = 0;
  const maxAttempts = 20; // Try up to 20 times
  const delay = 1000; // Wait 1 second between attempts

  while (attempt < maxAttempts) {
    // Get the conversation with messages
    const response = await fetch(`${baseUrl}/conversation/${conversationId}`);
    const data = await response.json();
    
    // Check if there are new messages (assistant responses)
    const messages = data.messages || [];
    const newMessages = messages.filter(m => m.id > lastMessageId && m.role === 'assistant');
    
    if (newMessages.length > 0) {
      // Get the last assistant message
      const latestMessage = newMessages[newMessages.length - 1];
      console.log(`Assistant: ${latestMessage.content}`);
      
      // Return the latest message ID for future checks
      return latestMessage.id;
    }
    
    // Wait before trying again
    await new Promise(resolve => setTimeout(resolve, delay));
    attempt++;
  }
  
  console.error('Timed out waiting for response');
  return lastMessageId;
}

async function main() {
  try {
    // Create a new conversation
    const conversationId = await createConversation();
    
    // Get initial message ID
    const initialResponse = await fetch(`${baseUrl}/conversation/${conversationId}`);
    const initialData = await initialResponse.json();
    let lastMessageId = initialData.messages[0].id;
    
    // Send a message asking about available activities
    await sendMessage(conversationId, "What activities are available?");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Request to switch to Spanish Basics
    await sendMessage(conversationId, "I'd like to try Spanish Basics");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Interact with Spanish Basics
    await sendMessage(conversationId, "Hola, ¿cómo estás?");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Ask to switch back to Activity Selection
    await sendMessage(conversationId, "I want to change activities");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Ask for activity with most steps
    await sendMessage(conversationId, "Which activity has the most steps?");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Switch to Race Game
    await sendMessage(conversationId, "Let's try the Race Game");
    lastMessageId = await waitForResponse(conversationId, lastMessageId);
    
    // Interact with Race Game
    await sendMessage(conversationId, "¿Cómo empezamos?");
    await waitForResponse(conversationId, lastMessageId);
    
    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error('Error:', error);
  }
}

main();