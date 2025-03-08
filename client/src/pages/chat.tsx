import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Conversation, Message, Step, MessageMetrics } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available activities
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  // Fetch steps for selected activity
  const { data: steps } = useQuery<Step[]>({
    queryKey: ["/api/steps", selectedActivity],
    queryFn: async () => {
      if (!selectedActivity) return [];
      const res = await fetch(`/api/activity/${selectedActivity}/steps`);
      return res.json();
    },
    enabled: !!selectedActivity
  });

  // Create new conversation when activity is selected
  const { data: conversation } = useQuery<{
    id: number;
    activityId: number;
    currentStep: number;
    messages: (Message & { metrics?: MessageMetrics })[];
  }>({
    queryKey: ["/api/conversation", selectedActivity],
    queryFn: async () => {
      if (!selectedActivity) return null;
      const res = await apiRequest("POST", "/api/conversation", { activityId: selectedActivity });
      return res.json();
    },
    enabled: !!selectedActivity
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
      queryClient.setQueryData(["/api/conversation", selectedActivity], data.conversation);
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

  const handleActivitySelect = (activityId: string) => {
    setSelectedActivity(Number(activityId));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  if (!activities) {
    return <div>Loading activities...</div>;
  }

  const currentStep = getCurrentStep();

  return (
    <div className="container mx-auto max-w-2xl h-screen p-4 flex flex-col gap-4">
      <Card className="p-4">
        <Select onValueChange={handleActivitySelect} value={selectedActivity?.toString()}>
          <SelectTrigger>
            <SelectValue placeholder="Select an activity" />
          </SelectTrigger>
          <SelectContent>
            {activities.map((activity) => (
              <SelectItem key={activity.id} value={activity.id.toString()}>
                {activity.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {selectedActivity && (
        <>
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
                  <h4 className="font-medium mb-2">Current Step ({conversation?.currentStep})</h4>
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
                          <TableRow key={step.id} className={step.stepNumber === conversation?.currentStep ? "bg-muted" : ""}>
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
                      {conversation?.messages?.filter(m => m.metrics).map((message, index) => (
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
        </>
      )}

      {selectedActivity ? (
        <Card className="flex-1 flex flex-col p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {conversation?.messages?.map((message, i) => (
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
      ) : (
        <Card className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Select an activity to start chatting</p>
        </Card>
      )}
    </div>
  );
}