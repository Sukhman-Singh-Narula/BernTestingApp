import { useState, useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Import types from schema
import type {
  Message,
  Step,
  MessageMetrics,
  SystemPrompt,
  MessageRole
} from "@shared/schema";

interface ConversationResponse {
  id: number;
  activityId: number;
  currentStep: number;
  userName: string;
  systemPromptId: number | null;
  messages: (Message & { metrics?: MessageMetrics })[];
  systemPrompt?: SystemPrompt;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);

  // Get and validate conversation ID from URL params or localStorage
  const rawConversationId = params.id || localStorage.getItem("currentConversationId");
  const conversationId = rawConversationId && !isNaN(Number(rawConversationId)) ? Number(rawConversationId) : null;

  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (!userName) {
      setLocation("/");
      return;
    }

    // Validate conversation ID
    if (!conversationId || isNaN(conversationId) || conversationId <= 0) {
      console.warn(`Invalid conversation ID detected: ${rawConversationId}, redirecting to home`);
      localStorage.removeItem("currentConversationId");
      setLocation("/");
      return;
    }

    // Only set localStorage for valid conversation IDs
    localStorage.setItem("currentConversationId", conversationId.toString());

    console.log(`Active conversation ID: ${conversationId}`);
  }, [setLocation, conversationId, rawConversationId, params.id]);

  // Fetch conversation data with consistent query key
  const { data: conversation, isError, isLoading } = useQuery<ConversationResponse>({
    queryKey: ["/api/conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      console.log("Fetching conversation:", conversationId);
      const res = await fetch(`/api/conversation/${conversationId}`);
      if (!res.ok) {
        throw new Error(`Conversation not found: ${res.statusText}`);
      }
      const data = await res.json();
      return data;
    },
    enabled: !!conversationId
  });

  const { data: steps } = useQuery<Step[]>({
    queryKey: ["/api/steps", conversation?.activityId],
    queryFn: async () => {
      if (!conversation?.activityId) return [];
      const res = await fetch(`/api/activity/${conversation.activityId}/steps`);
      if (!res.ok) {
        throw new Error('Failed to fetch steps');
      }
      return res.json();
    },
    enabled: !!conversation?.activityId
  });

  const getCurrentStep = () => {
    if (!steps || !conversation) return null;
    return steps.find(step => step.stepNumber === conversation.currentStep);
  };

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId || isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
        throw new Error(`Cannot send message - invalid conversation ID: ${conversationId}`);
      }

      setIsProcessing(true);

      return await apiRequest(
        "POST",
        `/api/conversation/${conversationId}/message`,
        { message }
      );
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
          metadata: null, // Add this to match the required type
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
      setError(null);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!conversationId || isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
      setError("Invalid conversation ID. Please start a new conversation.");
      toast({
        title: "Error",
        description: "Invalid conversation ID. Please start a new conversation.",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendMessage.mutateAsync(input);
    } catch (error) {
      console.error("Error sending message:", error);
      setError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
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
      console.log('Step advanced:', data.stepAdvanced);
      console.log('Updated conversation:', data.conversation);

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
    eventSource.addEventListener('error', (event: any) => {
      console.error('SSE error:', event);
      setTypingIndicator(false);
      setIsProcessing(false);

      let errorMessage = "An error occurred during message processing";
      
      // Only try to parse data if it exists
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          errorMessage = data.error || errorMessage;
        } catch (e) {
          console.error('Error parsing SSE error data:', e);
        }
      }

      toast({
        title: "Error",
        description: errorMessage,
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  if (isLoading) {
    return <div>Loading conversation...</div>;
  }

  if (isError || !conversation) {
    localStorage.removeItem("currentConversationId");
    setLocation("/");
    return <div>Redirecting to welcome page...</div>;
  }

  const currentStep = getCurrentStep();

  return (
    <div className="container mx-auto h-screen p-4 flex flex-col gap-4">
      {error && <div className="text-red-500">{error}</div>}
      <div className="flex justify-between items-center">
        <Link href="/chat">
          <Button variant="outline">Back to Conversations</Button>
        </Link>
        <Link href="/">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex gap-4">
        <div className="flex-1 flex flex-col gap-4">
          <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Activity Details</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4">
              {currentStep && (
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-2">Current Step ({conversation.currentStep})</h4>
                  <p className="text-sm text-muted-foreground mb-2">Objective: {currentStep.objective}</p>
                  <p className="text-sm text-muted-foreground">Script: {currentStep.suggestedScript}</p>
                </div>
              )}

              {steps && steps.length > 0 && (
                <ScrollArea className="h-64 rounded-md border">
                  <div className="min-w-[800px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Step</TableHead>
                          <TableHead className="min-w-[200px]">Description</TableHead>
                          <TableHead className="min-w-[200px]">Objective</TableHead>
                          <TableHead className="min-w-[250px]">Suggested Script</TableHead>
                          <TableHead className="min-w-[200px]">Expected Responses</TableHead>
                          <TableHead className="min-w-[150px]">Spanish Words</TableHead>
                          <TableHead className="min-w-[200px]">Success Response</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {steps.map((step) => (
                          <TableRow key={step.id} className={step.stepNumber === conversation.currentStep ? "bg-muted" : ""}>
                            <TableCell>{step.stepNumber}</TableCell>
                            <TableCell>{step.description}</TableCell>
                            <TableCell>{step.objective}</TableCell>
                            <TableCell>{step.suggestedScript}</TableCell>
                            <TableCell>{step.expectedResponses}</TableCell>
                            <TableCell>{step.spanishWords}</TableCell>
                            <TableCell>{step.successResponse}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={isAnalyticsOpen} onOpenChange={setIsAnalyticsOpen} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Message Analytics</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isAnalyticsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4">
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Message</TableHead>
                        <TableHead>Cost (USD)</TableHead>
                        <TableHead>Latency (ms)</TableHead>
                        <TableHead>Prompt Tokens</TableHead>
                        <TableHead>Completion Tokens</TableHead>
                        <TableHead>Total Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversation.messages?.filter(m => m.metrics).map((message, index) => (
                        <TableRow key={index}>
                          <TableCell className="max-w-[200px] truncate">{message.content}</TableCell>
                          <TableCell>${message.metrics!.costUsd}</TableCell>
                          <TableCell>{message.metrics!.latencyMs}ms</TableCell>
                          <TableCell>{message.metrics!.promptTokens}</TableCell>
                          <TableCell>{message.metrics!.completionTokens}</TableCell>
                          <TableCell>{message.metrics!.totalTokens}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          <Card className="flex-1 flex flex-col p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              <div className="space-y-4">
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
              </div>
            </ScrollArea>

            <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={sendMessage.isPending || isProcessing}
                className="flex-1"
              />
              <Button type="submit" disabled={sendMessage.isPending || isProcessing} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Card>
        </div>

        <div className="w-96 flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-full px-1"
            onClick={() => setIsSystemPromptOpen(!isSystemPromptOpen)}
          >
            {isSystemPromptOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          {isSystemPromptOpen && (
            <Card className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">System Prompt</h3>
              </div>
              <ScrollArea className="flex-1">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {conversation.systemPrompt?.systemPrompt || 'No system prompt available'}
                  </pre>
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}