import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Conversation, Message, Step, MessageMetrics, SystemPrompt } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, ChevronDown, ChevronUp, ChevronRight, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const [input, setInput] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams();

  // Get conversation ID from URL params or localStorage
  const conversationId = params.id || localStorage.getItem("currentConversationId");
  
  // Track if we need to redirect to welcome page
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Check for userName and handle redirects
  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (!userName) {
      setLocation("/");
      return;
    }
    
    // Redirect to welcome page if needed
    if (shouldRedirect) {
      setLocation("/");
      return;
    }
    
    // Only set localStorage for new conversations
    if (!params.id && conversationId) {
      localStorage.setItem("currentConversationId", conversationId);
    }
  }, [setLocation, conversationId, params.id, shouldRedirect]);

  // Fetch conversation data
  const { data: conversation, isError } = useQuery<{
    id: number;
    activityId: number;
    currentStep: number;
    messages: (Message & { metrics?: MessageMetrics })[];
    systemPrompt: SystemPrompt; // Added systemPrompt to the conversation type
  }>({
    queryKey: ["/api/conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const res = await fetch(`/api/conversation/${conversationId}`);
      if (!res.ok) {
        throw new Error('Conversation not found');
      }
      return res.json();
    },
    enabled: !!conversationId,
    onError: () => {
      // If we can't fetch the conversation, we should redirect to welcome page
      localStorage.removeItem("currentConversationId");
      setShouldRedirect(true);
    }
  });

  const { data: steps } = useQuery<Step[]>({
    queryKey: ["/api/steps", conversation?.activityId],
    queryFn: async () => {
      if (!conversation?.activityId) return [];
      const res = await fetch(`/api/activity/${conversation.activityId}/steps`);
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
      if (!conversation) return;
      const res = await apiRequest(
        "POST",
        `/api/conversation/${conversation.id}/message`,
        { message }
      );
      return res.json();
    },
    onSuccess: (data) => {
      setInput("");
      queryClient.setQueryData(["/api/conversation", conversationId], data.conversation);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage.mutate(input);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  if (!conversation) {
    // If no conversationId or error, redirect to welcome page
    if (!conversationId || isError) {
      useEffect(() => {
        setLocation("/");
      }, []);
      return <div>Redirecting to welcome page...</div>;
    }
    return <div>Loading conversation...</div>;
  }

  const currentStep = getCurrentStep();

  return (
    <div className="container mx-auto h-screen p-4 flex gap-4">
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
                  <div
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground ml-4"
                          : "bg-muted"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={sendMessage.isPending}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={sendMessage.isPending}
              size="icon"
            >
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
  );
}