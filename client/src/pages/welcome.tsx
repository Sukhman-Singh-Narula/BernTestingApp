import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Activity, SystemPrompt, Evaluator } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Pencil, ChevronsUpDown, Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEvaluators, setSelectedEvaluators] = useState<number[]>([]);
  const [evaluatorSelectOpen, setEvaluatorSelectOpen] = useState(false);

  // Fetch available activities
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  // Fetch recent system prompts for selected activity
  const { data: recentSystemPrompts } = useQuery<SystemPrompt[]>({
    queryKey: ["/api/activities", selectedActivity, "system-prompts"],
    queryFn: async () => {
      if (!selectedActivity) return null;
      const response = await fetch(`/api/activities/${selectedActivity}/system-prompts`);
      if (!response.ok) throw new Error('Failed to fetch system prompts');
      return response.json();
    },
    enabled: !!selectedActivity
  });

  // Update the evaluators query to include error and loading states
  const { data: availableEvaluators, isLoading: evaluatorsLoading, error: evaluatorsError } = useQuery<Evaluator[]>({
    queryKey: ["/api/evaluators"],
    queryFn: async () => {
      console.log("Fetching evaluators from API...");
      const response = await fetch("/api/evaluators");
      if (!response.ok) {
        throw new Error("Failed to fetch evaluators");
      }
      const data = await response.json();
      console.log("Received evaluators:", data);
      return data;
    }
  });

  // Add debug logging for evaluators data
  useEffect(() => {
    console.log("Current evaluators:", availableEvaluators);
    console.log("Loading state:", evaluatorsLoading);
    console.log("Error state:", evaluatorsError);
  }, [availableEvaluators, evaluatorsLoading, evaluatorsError]);

  // Update system prompt when activity changes or default prompt is loaded
  useEffect(() => {
    if (recentSystemPrompts && recentSystemPrompts.length > 0) {
      setSystemPrompt(recentSystemPrompts[0].systemPrompt);
      setSelectedPromptId(recentSystemPrompts[0].id.toString());
      setIsEditingPrompt(false);
    }
  }, [recentSystemPrompts]);

  // Create conversation mutation
  const createConversation = useMutation({
    mutationFn: async () => {
      console.log("Creating conversation with activity:", selectedActivity);
      const response = await apiRequest("POST", "/api/conversation", {
        activityId: selectedActivity,
        shouldGenerateFirstResponse: true,
        userName,
        evaluatorIds: selectedEvaluators,
        ...(isEditingPrompt && { systemPrompt })
      });
      if (!response.ok) {
        throw new Error(`Failed to create conversation: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Conversation created successfully:", data);
      localStorage.setItem("userName", userName);
      localStorage.setItem("currentConversationId", data.id.toString());
      // Add a slight delay to ensure data is properly saved before navigation
      setTimeout(() => {
        setLocation(`/chat/${data.id}`);
      }, 100);
    },
    onError: (error) => {
      console.error("Error creating conversation:", error);
      toast({
        title: "Error",
        description: "Failed to create conversation. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }

    if (!selectedActivity) {
      toast({
        title: "Error",
        description: "Please select an activity",
        variant: "destructive"
      });
      return;
    }

    createConversation.mutate();
  };

  const handleSystemPromptSelect = (promptId: string) => {
    const selectedPrompt = recentSystemPrompts?.find(p => p.id.toString() === promptId);
    if (selectedPrompt) {
      setSystemPrompt(selectedPrompt.systemPrompt);
      setSelectedPromptId(promptId);
      setIsEditingPrompt(false); 
    }
  };

  return (
    <div className="container mx-auto h-screen flex items-center justify-center">
      <Card className="w-full max-w-2xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">Welcome to Language Learning Chat</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="activity">Select an Activity</Label>
            <Select
              value={selectedActivity?.toString()}
              onValueChange={(value) => setSelectedActivity(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an activity" />
              </SelectTrigger>
              <SelectContent>
                {activities?.map((activity) => (
                  <SelectItem key={activity.id} value={activity.id.toString()}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full"
            />
          </div>

          {selectedActivity && (
            <>
              <div>
                <Label htmlFor="recentPrompts">Select a recent system prompt</Label>
                <Select value={selectedPromptId || ''} onValueChange={handleSystemPromptSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a recent prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {recentSystemPrompts?.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id.toString()}>
                        <div className="flex flex-col">
                          <span className="font-medium">By {prompt.createdBy}</span>
                          <span className="text-sm text-muted-foreground">
                            {prompt.systemPrompt.substring(0, 40)}...
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(prompt.createdAt), "dd/MM HH:mm:ss")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {isEditingPrompt ? "Cancel Edit" : "Edit"}
                  </Button>
                </div>
                <Textarea
                  id="systemPrompt"
                  placeholder="System prompt for the conversation"
                  value={systemPrompt}
                  onChange={(e) => isEditingPrompt && setSystemPrompt(e.target.value)}
                  className={`min-h-[200px] font-mono text-sm ${!isEditingPrompt ? 'bg-muted cursor-not-allowed' : ''}`}
                  readOnly={!isEditingPrompt}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {isEditingPrompt
                    ? "You are creating a new system prompt that will be saved for future use."
                    : "Click 'Edit' to modify the system prompt and create a new version."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Select Evaluators</Label>
                <Popover open={evaluatorSelectOpen} onOpenChange={setEvaluatorSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={evaluatorSelectOpen}
                      className="w-full justify-between"
                    >
                      {selectedEvaluators.length > 0
                        ? `${selectedEvaluators.length} evaluator${selectedEvaluators.length === 1 ? '' : 's'} selected`
                        : "Select evaluators..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search evaluators..." />
                      <CommandEmpty>
                        {evaluatorsLoading ? "Loading..." : 
                         evaluatorsError ? "Error loading evaluators" : 
                         "No evaluators found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {availableEvaluators?.map((evaluator) => (
                          <CommandItem
                            key={evaluator.id}
                            value={evaluator.name}
                            onSelect={() => {
                              const newSelection = selectedEvaluators.includes(evaluator.id)
                                ? selectedEvaluators.filter(id => id !== evaluator.id)
                                : [...selectedEvaluators, evaluator.id];
                              setSelectedEvaluators(newSelection);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedEvaluators.includes(evaluator.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{evaluator.name}</span>
                              <span className="text-xs text-muted-foreground">{evaluator.criteria}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-sm text-muted-foreground">
                  {evaluatorsLoading ? "Loading evaluators..." :
                   evaluatorsError ? "Failed to load evaluators" :
                   selectedEvaluators.length === 0 ? "Default evaluator will be used if none selected." :
                   "Choose which evaluators to use for assessing language performance."}
                </p>
              </div>
            </>
          )}

          <Button type="submit" className="w-full" disabled={createConversation.isPending}>
            Start Learning
          </Button>
        </form>
      </Card>
    </div>
  );
}