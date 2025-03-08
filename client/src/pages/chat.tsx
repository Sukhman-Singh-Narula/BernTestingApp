import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Conversation, Message } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const [input, setInput] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available activities
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/activities");
      return res.json();
    }
  });

  // Create new conversation when activity is selected
  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation", selectedActivity],
    queryFn: async () => {
      if (!selectedActivity) return null;
      const res = await apiRequest("POST", "/api/conversation", { activityId: selectedActivity });
      return res.json();
    },
    enabled: !!selectedActivity
  });

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

      {selectedActivity ? (
        <Card className="flex-1 flex flex-col p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {conversation?.messages.map((messageStr, i) => {
                const message = JSON.parse(messageStr) as Message;
                return (
                  <div
                    key={i}
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
                );
              })}
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