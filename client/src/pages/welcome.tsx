import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Activity, SystemPrompt } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isSystemPromptModified, setIsSystemPromptModified] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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

  // Update system prompt when activity changes or default prompt is loaded
  useEffect(() => {
    if (recentSystemPrompts && recentSystemPrompts.length > 0) {
      setSystemPrompt(recentSystemPrompts[0].systemPrompt);
      setIsSystemPromptModified(false); // Reset modification flag when loading default
    }
  }, [recentSystemPrompts]);

  // Create conversation mutation
  const createConversation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/conversation", {
        activityId: selectedActivity,
        shouldGenerateFirstResponse: true,
        userName,
        ...(isSystemPromptModified && { systemPrompt }) // Only include systemPrompt if modified
      });
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("userName", userName);
      localStorage.setItem("currentConversationId", data.id.toString());
      setLocation("/chat");
    },
    onError: () => {
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
      setIsSystemPromptModified(true); // Mark as modified when selecting from dropdown
    }
  };

  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(e.target.value);
    setIsSystemPromptModified(true); // Mark as modified when editing text
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
                <Select onValueChange={handleSystemPromptSelect}>
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
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="System prompt for the conversation"
                  value={systemPrompt}
                  onChange={handleSystemPromptChange}
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  You can customize the system prompt that will be used for your conversation.
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