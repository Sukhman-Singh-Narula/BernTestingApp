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
import type { Evaluator, ChoiceLayerPrompt, Activity } from "@shared/schema";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [selectedEvaluators, setSelectedEvaluators] = useState<number[]>([]);  // Initialize with empty array
  const [isValid, setIsValid] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

  // Fetch choice layer prompts instead of activity system prompts
  const { data: choiceLayerPrompts, error: promptsError } = useQuery<ChoiceLayerPrompt[]>({
    queryKey: ["choice-layer-prompts"],
    queryFn: async () => {
      try {
        const prompts = await apiRequest<ChoiceLayerPrompt[]>("GET", "/choice-layer-prompts");
        console.log("Fetched choice layer prompts:", prompts);
        return prompts;
      } catch (error) {
        console.error("Failed to fetch choice layer prompts:", error);
        throw error;
      }
    }
  });

  const { data: evaluators, refetch: refetchEvaluators } = useQuery({
    queryKey: ["evaluators"],
    queryFn: () => apiRequest<Evaluator[]>("GET", "/evaluators")
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

  // Create a new choice layer prompt
  const createChoiceLayerPrompt = useMutation({
    mutationFn: (prompt: string) => 
      apiRequest<{ id: number }>("POST", "/api/choice-layer-prompts", { 
        systemPrompt: prompt,
        createdBy: userName || 'system',
        isChoiceLayer: true // Flag to ensure it only saves to choice layer table
      }),
    onSuccess: (data) => {
      console.log(`Created new choice layer prompt with ID: ${data.id}`);
      setSelectedPromptId(data.id.toString());
      // Refresh the choice layer prompts list
      queryClient.invalidateQueries({ queryKey: ["/api/choice-layer-prompts"] });
      toast({
        title: "Prompt Saved",
        description: "Your choice layer prompt has been saved successfully."
      });
    },
    onError: (error) => {
      console.error("Failed to create choice layer prompt:", error);
      toast({
        title: "Error Saving Prompt",
        description: "There was a problem saving your choice layer prompt.",
        variant: "destructive"
      });
    }
  });

  interface ConversationResponse {
    id: number;
  }

  // Fetch activities for selection - REMOVED
  //const { data: activities } = useQuery<Activity[]>({
  //  queryKey: ["/api/activities/visible"],
  //  queryFn: () => apiRequest<Activity[]>("GET", "/api/activities/visible")
  //});

  // State for selected activity (default to Activity Selection if available) - REMOVED
  //const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  // Set default activity on initial load - REMOVED
  //useEffect(() => {
  //  if (activities && activities.length > 0) {
  //    // Look for Activity Selection (usually ID 3)
  //    const activitySelection = activities.find((a: Activity) => a.name === "Activity Selection");
  //    if (activitySelection) {
  //      setSelectedActivityId(activitySelection.id);
  //    } else {
  //      // Otherwise use the first available activity
  //      setSelectedActivityId(activities[0].id);
  //    }
  //  }
  //}, [activities]);

  const createConversation = useMutation<ConversationResponse>({
    mutationFn: async () => {
      setIsLoading(true);
      // Use the Activity Selection activity (3) if available, or fallback to the selected activity - REMOVED
      //const startingActivityId = selectedActivityId || 3; 

      // Pass the choice layer prompt ID to the conversation
      const response = await apiRequest<ConversationResponse>("POST", "/conversation", {
        //activityId: startingActivityId,  REMOVED
        shouldGenerateFirstResponse: true,
        userName,
        choiceLayerPromptId: parseInt(selectedPromptId), // Use the selected choice layer prompt
        systemPrompt    // Keep this for backward compatibility
      });

      // Assign selected evaluators to the conversation
      if (selectedEvaluators.length > 0) {
        console.log(`Assigning ${selectedEvaluators.length} evaluators to conversation ${response.id}`);
        try {
          await apiRequest<{success: boolean}>("POST", "/api/evaluators/assign", {
            conversationId: response.id,
            evaluatorIds: selectedEvaluators
          });
          console.log(`Successfully assigned evaluators to conversation ${response.id}`);
        } catch (error) {
          console.error("Failed to assign evaluators:", error);
        }
      } else {
        console.log("No evaluators selected for this conversation");
      }

      return response;
    },
    onSuccess: (data) => {
      // Set the conversation ID in localStorage for future reference
      localStorage.setItem("currentConversationId", data.id.toString());

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
    // Select the most recent choice layer prompt when data is loaded
    if (choiceLayerPrompts && choiceLayerPrompts.length > 0) {
      const mostRecent = choiceLayerPrompts[0]; // Assuming they're ordered by recency
      setSelectedPromptId(mostRecent.id.toString());
      setSystemPrompt(mostRecent.systemPrompt);
    }
  }, [choiceLayerPrompts]);

  useEffect(() => {
    // Update the displayed prompt text when selection changes
    if (selectedPromptId && choiceLayerPrompts) {
      const selectedPrompt = choiceLayerPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.systemPrompt);
      }
    }
  }, [selectedPromptId, choiceLayerPrompts]);

  // Simple handler for prompt changes - just update the state without saving
  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    // Mark as editing if it's different from the selected prompt
    if (selectedPromptId && choiceLayerPrompts) {
      const selectedPrompt = choiceLayerPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt && value !== selectedPrompt.systemPrompt) {
        setIsEditing(true);
      }
    }
  };

  useEffect(() => {
    setIsValid(userName.trim().length > 0);
  }, [userName]);

  const handleStartChat = async () => {
    localStorage.setItem("userName", userName);

    // If the user edited the prompt, save it as a new choice layer prompt
    if (isEditing && systemPrompt.trim()) {
      try {
        setIsSavingPrompt(true);
        await createChoiceLayerPrompt.mutateAsync(systemPrompt);
        setIsSavingPrompt(false);
      } catch (error) {
        console.error("Failed to save new choice layer prompt:", error);
        // Continue with existing promptId if saving fails
      }
    }

    // Store the prompt text in localStorage for reference
    localStorage.setItem("choiceLayerPrompt", systemPrompt);

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

          {/* Activity Selection - REMOVED */}
          {/*<div className="mb-4">
            <label htmlFor="activity-select" className="block text-sm font-medium mb-2">
              Starting Activity
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose which activity to start with. You can always switch between activities during the conversation.
            </p>
            <Select 
              value={selectedActivityId?.toString() || ""} 
              onValueChange={(value) => setSelectedActivityId(parseInt(value))}
            >
              <SelectTrigger className="mb-2">
                <SelectValue placeholder="Choose a starting activity" />
              </SelectTrigger>
              <SelectContent>
                {activities?.map((activity) => (
                  <SelectItem 
                    key={activity.id} 
                    value={activity.id.toString()}
                  >
                    {activity.name} ({activity.contentType || activity.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>*/}

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
              <label htmlFor="prompt-select" className="text-sm font-medium">Select Choice Layer Prompt</label>
              <p className="text-xs text-muted-foreground">
                This global prompt helps the AI understand how to switch between activities
              </p>
            </div>
            <Select 
              value={selectedPromptId} 
              onValueChange={(value) => setSelectedPromptId(value)}
            >
              <SelectTrigger className="mb-4">
                <SelectValue placeholder="Choose a choice layer prompt" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {choiceLayerPrompts?.map((prompt) => (
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
                {!isEditing 
                  ? 'Edit this prompt to create a new choice layer prompt' 
                  : isSavingPrompt 
                    ? 'Saving new choice layer prompt...' 
                    : 'Edited prompt will be saved when you start a new chat'}
              </p>
              <Textarea
                id="prompt"
                value={systemPrompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Edit or create a new choice layer prompt"
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
              {isLoading 
                ? 'Creating Conversation...' 
                : isEditing 
                  ? 'Save Prompt & Start Chat' 
                  : 'Start New Chat'}
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