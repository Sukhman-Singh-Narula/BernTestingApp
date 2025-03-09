import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageCircle, Calendar, StepForward, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

type Conversation = {
  id: number;
  activityId: number;
  currentStep: number;
  activityName: string;
  lastMessage: { content: string } | null;
  createdAt: string;
};

type PaginatedResponse = {
  conversations: Conversation[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export default function Conversations() {
  const [page, setPage] = useState(1);
  const userName = localStorage.getItem("userName");

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/conversations", userName, page],
    queryFn: async () => {
      if (!userName) return { conversations: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      const res = await fetch(`/api/conversations/${userName}?page=${page}&limit=10`);
      if (!res.ok) {
        throw new Error('Failed to fetch conversations');
      }
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

  const { conversations = [], pagination } = data || {};

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Your Conversations</h1>
      <ScrollArea className="h-[calc(100vh-12rem)]">
        <div className="space-y-4">
          {Array.isArray(conversations) && conversations.map((conversation) => (
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

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}