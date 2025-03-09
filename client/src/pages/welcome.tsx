import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Activity, SystemPrompt } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Fetch available activities
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  // Fetch system prompt for selected activity
  const { data: defaultSystemPrompt } = useQuery<SystemPrompt>({
    queryKey: ["/api/activity", selectedActivity, "system-prompt"],
    enabled: !!selectedActivity
  });

  // Update system prompt when activity changes
  useState(() => {
    if (defaultSystemPrompt?.systemPrompt) {
      setSystemPrompt(defaultSystemPrompt.systemPrompt);
    }
  }, [defaultSystemPrompt]);

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

    // Store the name and system prompt in localStorage for persistence
    localStorage.setItem("userName", userName);
    localStorage.setItem("systemPrompt", systemPrompt);
    setLocation("/chat");
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
            <div>
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                placeholder="System prompt for the conversation"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground mt-2">
                You can customize the system prompt that will be used for your conversation.
              </p>
            </div>
          )}

          <Button type="submit" className="w-full">
            Start Learning
          </Button>
        </form>
      </Card>
    </div>
  );
}