import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Conversation, Message } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Chat() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create new conversation on mount
  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/conversation");
      return res.json();
    }
  });

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!conversation) return;
      console.log("Sending message:", message); // Added console log
      const res = await apiRequest(
        "POST",
        `/api/conversation/${conversation.id}/message`,
        { message }
      );
      return res.json();
    },
    onSuccess: (data) => {
      setInput("");
      // Update the conversation data in the cache
      queryClient.setQueryData(["/api/conversation"], data.conversation);
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
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-2xl h-screen p-4 flex flex-col">
      <Card className="flex-1 flex flex-col p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {conversation.messages.map((message: Message, i: number) => (
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
  );
}