import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Calendar, StepForward } from "lucide-react";

type Conversation = {
  id: number;
  activityId: number;
  currentStep: number;
  activityName: string;
  lastMessage: { content: string } | null;
  createdAt: string;
};

export default function Conversations() {
  // Get userName from localStorage
  const userName = localStorage.getItem("userName");

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations", userName],
    queryFn: async () => {
      if (!userName) return [];
      const res = await fetch(`/api/conversations/${userName}`);
      return res.json();
    },
    enabled: !!userName
  });

  if (!userName) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Please log in first</h1>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Loading conversations...</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Your Conversations</h1>
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="space-y-4">
          {conversations?.map((conversation) => (
            <Link key={conversation.id} href={`/chat/${conversation.id}`}>
              <Card className="p-4 hover:bg-accent cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-lg font-semibold">{conversation.activityName}</h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(conversation.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <StepForward className="h-4 w-4" />
                  Step {conversation.currentStep}
                </div>
                {conversation.lastMessage && (
                  <div className="flex items-start gap-2 text-sm">
                    <MessageCircle className="h-4 w-4 mt-1" />
                    <p className="line-clamp-2">{conversation.lastMessage.content}</p>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
