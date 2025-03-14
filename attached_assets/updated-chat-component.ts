// Inside chat.tsx, add these changes to the existing component

// Add this import
import { useEffect, useRef, useState } from "react";

// Add this new state inside your Chat component
const [isProcessing, setIsProcessing] = useState(false);
const [typingIndicator, setTypingIndicator] = useState(false);
const eventSourceRef = useRef<EventSource | null>(null);

// Add this useEffect to set up the SSE connection
useEffect(() => {
  // Only set up SSE if we have a valid conversation ID
  if (!conversationId) return;

  // Create EventSource for SSE connection
  const eventSource = new EventSource(`/api/conversation/${conversationId}/stream`);
  eventSourceRef.current = eventSource;
  
  // Connection established
  eventSource.addEventListener('connected', (event) => {
    console.log('SSE connection established');
  });
  
  // User message received
  eventSource.addEventListener('user-message', (event) => {
    const data = JSON.parse(event.data);
    console.log('User message event:', data);
  });
  
  // AI thinking indication
  eventSource.addEventListener('thinking', (event) => {
    setTypingIndicator(true);
    console.log('AI thinking...');
  });
  
  // AI response received
  eventSource.addEventListener('ai-response', (event) => {
    setTypingIndicator(false);
    setIsProcessing(false);
    
    const data = JSON.parse(event.data);
    console.log('AI response event:', data);
    
    // Update the conversation with the new message
    queryClient.setQueryData<ConversationResponse>(
      ["/api/conversation", conversationId],
      (old) => {
        if (!old) return old;
        
        // Create a copy of the current messages
        const updatedMessages = [...old.messages];
        
        // Check if the AI message already exists (avoid duplicates)
        const messageExists = updatedMessages.some(m => 
          m.id === data.message.id && m.role === "assistant"
        );
        
        if (!messageExists) {
          updatedMessages.push(data.message);
        }
        
        // Update conversation object if step was advanced
        const updatedConversation = data.stepAdvanced 
          ? { ...old, currentStep: data.conversation.currentStep }
          : old;
          
        return {
          ...updatedConversation,
          messages: updatedMessages
        };
      }
    );
  });
  
  // Error handling
  eventSource.addEventListener('error', (event) => {
    const data = JSON.parse(event.data);
    console.error('SSE error:', data);
    setTypingIndicator(false);
    setIsProcessing(false);
    
    toast({
      title: "Error",
      description: data.error || "An error occurred during message processing",
      variant: "destructive"
    });
  });
  
  // Clean up on unmount
  return () => {
    console.log('Closing SSE connection');
    eventSource.close();
    eventSourceRef.current = null;
  };
}, [conversationId, queryClient]);

// Update the sendMessage mutation to work with the streaming approach
const sendMessage = useMutation({
  mutationFn: async (message: string) => {
    if (!conversationId || isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
      throw new Error(`Cannot send message - invalid conversation ID: ${conversationId}`);
    }

    setIsProcessing(true);
    
    const response = await apiRequest(
      "POST",
      `/api/conversation/${conversationId}/message`,
      { message }
    );

    const data = await response.json();
    return data;
  },
  onMutate: async (newMessage) => {
    await queryClient.cancelQueries({ queryKey: ["/api/conversation", conversationId] });
    const previousConversation = queryClient.getQueryData<ConversationResponse>(["/api/conversation", conversationId]);

    if (previousConversation) {
      const optimisticMessage = {
        id: Date.now(),
        conversationId: Number(conversationId),
        stepId: previousConversation.currentStep,
        role: "user" as MessageRole,
        content: newMessage,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ConversationResponse>(
        ["/api/conversation", conversationId],
        old => ({
          ...old!,
          messages: [...(old?.messages || []), optimisticMessage],
        })
      );
    }

    return { previousConversation };
  },
  onError: (err, newMessage, context) => {
    setIsProcessing(false);
    if (context?.previousConversation) {
      queryClient.setQueryData(
        ["/api/conversation", conversationId],
        context.previousConversation
      );
    }
    toast({
      title: "Error",
      description: `Failed to send message: ${err.message}`,
      variant: "destructive"
    });
    setError(err.message);
  },
  onSuccess: (data) => {
    setInput("");
    // No need to update conversation here as SSE will handle it
    setError(null);
    // We don't call setIsProcessing(false) here because the SSE events will handle that
  },
  onSettled: () => {
    // No need to invalidate queries here
    // queryClient.invalidateQueries({ queryKey: ["/api/conversation", conversationId] });
  }
});

// Update the conversation messages rendering to include typing indicator
// Inside your JSX where you render the messages, add:

{conversation.messages?.map((message, i) => (
  <div key={i}>
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${
        message.role === "user"
          ? "bg-primary text-primary-foreground ml-4"
          : "bg-muted"
      }`}>
        {message.content}
      </div>
    </div>
  </div>
))}

{typingIndicator && (
  <div className="flex justify-start">
    <div className="max-w-[80%] rounded-lg p-3 bg-muted">
      <div className="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
)}

// Add this CSS somewhere in your styles:
/*
.typing-indicator {
  display: flex;
  align-items: center;
}

.typing-indicator span {
  height: 8px;
  width: 8px;
  margin: 0 2px;
  background-color: #999;
  border-radius: 50%;
  opacity: 0.4;
  animation: pulse 1.5s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}
*/

// Update the form submit button to be disabled when processing
<Button type="submit" disabled={sendMessage.isPending || isProcessing} size="icon">
  <Send className="h-4 w-4" />
</Button>
