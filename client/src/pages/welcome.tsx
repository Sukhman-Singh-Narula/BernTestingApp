import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Activity, SystemPrompt } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableEvaluators, setAvailableEvaluators] = useState([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState({});
  const [isLoadingEvaluators, setIsLoadingEvaluators] = useState(false);

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

  // Fetch available evaluators
  useEffect(() => {
    const fetchEvaluators = async () => {
      setIsLoadingEvaluators(true);
      try {
        const response = await fetch('/api/evaluators');
        if (!response.ok) {
          throw new Error('Failed to fetch evaluators');
        }
        const data = await response.json();
        setAvailableEvaluators(data);

        // Initialize selection state
        const initialSelections = {};
        data.forEach(evaluator => {
          initialSelections[evaluator.id] = evaluator.name === 'glider' && 
                                          evaluator.criteria === 'language-compliance';
        });
        setSelectedEvaluators(initialSelections);
      } catch (error) {
        console.error('Error fetching evaluators:', error);
        toast({
          title: "Error",
          description: "Failed to load evaluators. Using default evaluator.",
          variant: "destructive"
        });
        setAvailableEvaluators([{
          id: 'default',
          name: 'glider',
          criteria: 'language-compliance',
          description: 'Default language evaluator'
        }]);
        setSelectedEvaluators({ default: true });
      } finally {
        setIsLoadingEvaluators(false);
      }
    };

    fetchEvaluators();
  }, []);

  // Update system prompt when activity changes or default prompt is loaded
  useEffect(() => {
    if (recentSystemPrompts && recentSystemPrompts.length > 0) {
      setSystemPrompt(recentSystemPrompts[0].systemPrompt);
      setSelectedPromptId(recentSystemPrompts[0].id.toString());
      setIsEditingPrompt(false);
    }
  }, [recentSystemPrompts]);

  const handleSystemPromptSelect = (promptId: string) => {
    const selectedPrompt = recentSystemPrompts?.find(p => p.id.toString() === promptId);
    if (selectedPrompt) {
      setSystemPrompt(selectedPrompt.systemPrompt);
      setSelectedPromptId(promptId);
      setIsEditingPrompt(false); 
    }
  };

  const handleStartChat = async () => {
    setIsLoading(true);
    try {
      const selectedEvaluatorIds = Object.entries(selectedEvaluators)
        .filter(([_, isSelected]) => isSelected)
        .map(([id]) => id);

      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          evaluatorIds: selectedEvaluatorIds,
          userName: userName,
          activityId: selectedActivity,
          systemPrompt: systemPrompt
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      const data = await response.json();
      localStorage.setItem("userName", userName);
      localStorage.setItem("currentConversationId", data.id.toString());
      setTimeout(() => {
        navigate(`/chat/${data.id}`);
      }, 100);
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

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
    setIsOpen(true);
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
            </>
          )}

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Conversation</DialogTitle>
                <DialogDescription>
                  Select evaluators for your conversation
                </DialogDescription>
              </DialogHeader>

              {isLoadingEvaluators ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  <h3 className="text-sm font-medium">Select Evaluators</h3>
                  
                  {isLoadingEvaluators ? (
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <span className="text-sm">Loading evaluators...</span>
                    </div>
                  ) : (
                    availableEvaluators.map((evaluator) => (
                      <div key={evaluator.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`evaluator-${evaluator.id}`}
                          checked={selectedEvaluators[evaluator.id] || false}
                          onCheckedChange={(checked) => {
                            setSelectedEvaluators({
                              ...selectedEvaluators,
                              [evaluator.id]: !!checked
                            });
                          }}
                        />
                        <div>
                          <label htmlFor={`evaluator-${evaluator.id}`} className="text-sm font-medium">
                            {evaluator.name} ({evaluator.criteria})
                          </label>
                          {evaluator.description && (
                            <p className="text-xs text-muted-foreground">{evaluator.description}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={handleStartChat}
                  disabled={isLoading || isLoadingEvaluators}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    'Start Chat'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </form>
      </Card>
    </div>
  );
}