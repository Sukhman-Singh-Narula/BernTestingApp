import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Import types
import type { Evaluator } from "@shared/schema";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [selectedEvaluators, setSelectedEvaluators] = useState<number[]>([]);  // Initialize with empty array
  const [isValid, setIsValid] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

  interface SystemPrompt {
    id: number; 
    systemPrompt: string; 
    createdBy: string;
    createdAt: string;
  }

  const { data: systemPrompts } = useQuery<SystemPrompt[]>({
    queryKey: ["/api/activities/1/system-prompts"],
    queryFn: () => apiRequest<SystemPrompt[]>("GET", "/api/activities/1/system-prompts")
  });

  const { data: evaluators, refetch: refetchEvaluators } = useQuery({
    queryKey: ["/api/evaluators"],
    queryFn: () => apiRequest<Evaluator[]>("GET", "/api/evaluators")
  });

  // Sync evaluators on page load and update list after
  useEffect(() => {
    const syncEvaluators = async () => {
      try {
        await apiRequest<{ message: string }>("POST", "/api/evaluators/sync");
        refetchEvaluators();
      } catch (error) {
        console.error("Failed to sync evaluators:", error);
      }
    };
    syncEvaluators();
  }, [refetchEvaluators]);

  const createSystemPrompt = useMutation({
    mutationFn: (prompt: string) => 
      apiRequest<{ id: number }>("POST", "/api/activities/1/system-prompts", { systemPrompt: prompt }),
    onSuccess: (data) => {
      setSelectedPromptId(data.id.toString());
    }
  });

  interface ConversationResponse {
    id: number;
  }

  const createConversation = useMutation<ConversationResponse>({
    mutationFn: async () => {
      setIsLoading(true);
      const response = await apiRequest<ConversationResponse>("POST", "/api/conversation", {
        activityId: 1,
        shouldGenerateFirstResponse: true,
        userName,
        systemPrompt
      });
      return response;
    },
    onSuccess: async (data) => {
      // Set the conversation ID in localStorage for future reference
      localStorage.setItem("currentConversationId", data.id.toString());

      // Assign selected evaluators to the conversation
      if (selectedEvaluators.length > 0) {
        await apiRequest<{success: boolean}>("POST", "/api/evaluators/assign", {
          conversationId: data.id,
          evaluatorIds: selectedEvaluators
        });
      }
      
      setIsLoading(false);
      // Navigate to the chat page with the new conversation
      setLocation(`/chat/${data.id}`);
    },
    onError: (error) => {
      setIsLoading(false);
      toast({
        title: "Error Creating Conversation",
        description: "There was a problem creating your conversation. Please try again.",
        variant: "destructive"
      });
      console.error("Error creating conversation:", error);
    }
  });

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
    if (systemPrompts && systemPrompts.length > 0) {
      const mostRecent = systemPrompts[0];
      setSelectedPromptId(mostRecent.id.toString());
      setSystemPrompt(mostRecent.systemPrompt);
    }
  }, [systemPrompts]);

  useEffect(() => {
    if (selectedPromptId && systemPrompts) {
      const selectedPrompt = systemPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.systemPrompt);
      }
    }
  }, [selectedPromptId, systemPrompts]);

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    if (value.trim()) {
      createSystemPrompt.mutate(value);
    }
  };

  useEffect(() => {
    setIsValid(userName.trim().length > 0);
  }, [userName]);

  const handleStartChat = async () => {
    localStorage.setItem("userName", userName);
    localStorage.setItem("lastSystemPromptId", selectedPromptId);
    localStorage.setItem("systemPrompt", systemPrompt);
    
    // Create the conversation and navigate to chat page
    await createConversation.mutateAsync();
  };

  const toggleEvaluator = (evaluatorId: number) => {
    setSelectedEvaluators(prev => {
      if (prev.includes(evaluatorId)) {
        return prev.filter(id => id !== evaluatorId);
      } else {
        return [...prev, evaluatorId];
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Welcome to Language Learning AI</CardTitle>
          <CardDescription>Start learning a new language today!</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">Your Name</label>
            <Input
              id="name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="mb-4"
            />
          </div>
          
          {/* Evaluator Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select Evaluators</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded">
              {evaluators?.map((evaluator) => (
                <div 
                  key={evaluator.id}
                  onClick={() => toggleEvaluator(evaluator.id)}
                  className={`cursor-pointer p-3 rounded-md border flex items-center justify-between ${
                    selectedEvaluators.includes(evaluator.id) 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border'
                  }`}
                >
                  <div>
                    <div className="font-medium">{evaluator.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {evaluator.description || evaluator.family}
                    </div>
                  </div>
                  {selectedEvaluators.includes(evaluator.id) && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
              ))}
              {(!evaluators || evaluators.length === 0) && (
                <div className="text-muted-foreground text-sm">
                  No evaluators available. Please try again later or proceed without evaluation.
                </div>
              )}
            </div>
          </div>
          
          <div>
            <div className="mb-2">
              <label htmlFor="prompt-select" className="text-sm font-medium">Select System Prompt</label>
            </div>
            <Select 
              value={selectedPromptId} 
              onValueChange={(value) => setSelectedPromptId(value)}
            >
              <SelectTrigger className="mb-4">
                <SelectValue placeholder="Choose a system prompt" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {systemPrompts?.map((prompt) => (
                  <SelectItem 
                    key={prompt.id} 
                    value={prompt.id.toString()}
                    className="relative flex-col py-2 px-2"
                  >
                    <div className="flex justify-between items-center w-full text-xs text-muted-foreground mb-1">
                      <span>By {prompt.createdBy}</span>
                      <span>{new Date(prompt.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-left break-words">
                      {prompt.systemPrompt.substring(0, 100)}
                      {prompt.systemPrompt.length > 100 ? '...' : ''}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <p className="text-sm text-muted-foreground mb-2">
                {!isEditing ? 'Edit this prompt to create a new system prompt' : 'A new system prompt will be saved'}
              </p>
              <Textarea
                id="prompt"
                value={systemPrompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Edit or create a new system prompt"
                className={`mt-4 mb-4 min-h-[300px] text-sm ${!isEditing ? 'bg-muted text-muted-foreground cursor-pointer' : ''}`}
                onClick={() => !isEditing && setIsEditing(true)}
                readOnly={!isEditing}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <Button 
              disabled={!isValid || isLoading} 
              onClick={handleStartChat}
              className="relative"
            >
              {isLoading ? 'Creating Conversation...' : 'Start New Chat'}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/activities">Browse Activities</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}