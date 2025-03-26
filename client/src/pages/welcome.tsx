import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [isValid, setIsValid] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { data: systemPrompts } = useQuery({
    queryKey: ["/api/activities/1/system-prompts"],
    queryFn: () => apiRequest<Array<{ 
      id: number; 
      systemPrompt: string; 
      createdBy: string;
      createdAt: string;
    }>>("GET", "/api/activities/1/system-prompts")
  });

  const createSystemPrompt = useMutation({
    mutationFn: (prompt: string) => 
      apiRequest("POST", "/api/activities/1/system-prompts", { systemPrompt: prompt }),
    onSuccess: () => {
      setIsEditing(false);
    }
  });

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    const storedPromptId = localStorage.getItem("lastSystemPromptId");
    if (storedName) setUserName(storedName);
    if (systemPrompts?.length > 0) {
      const mostRecent = systemPrompts[0];
      setSelectedPromptId(mostRecent.id.toString());
      setSystemPrompt(mostRecent.systemPrompt);
    }
  }, [systemPrompts]);

  useEffect(() => {
    if (!isEditing && selectedPromptId && systemPrompts) {
      const selectedPrompt = systemPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.systemPrompt);
      }
    }
  }, [selectedPromptId, systemPrompts, isEditing]);

  const handleSavePrompt = () => {
    if (isEditing && systemPrompt.trim()) {
      createSystemPrompt.mutate(systemPrompt);
    }
  };

  useEffect(() => {
    setIsValid(userName.trim().length > 0);
  }, [userName]);

  const handleStartChat = () => {
    localStorage.setItem("userName", userName);
    localStorage.setItem("lastSystemPromptId", selectedPromptId); // Store selected prompt ID
    localStorage.setItem("systemPrompt", systemPrompt); //Store system prompt
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
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="prompt-select" className="text-sm font-medium">Select System Prompt</label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? "Cancel" : "Edit"}
              </Button>
            </div>
            <Select 
              value={selectedPromptId} 
              onValueChange={(value) => setSelectedPromptId(value)}
              disabled={isEditing}
            >
              <SelectTrigger className="mb-4">
                <SelectValue placeholder="Choose a system prompt" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {systemPrompts?.map((prompt) => (
                  <SelectItem 
                    key={prompt.id} 
                    value={prompt.id.toString()}
                    className="flex flex-col space-y-1 py-2"
                  >
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>By {prompt.createdBy}</span>
                      <span>{new Date(prompt.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="line-clamp-2 text-sm">
                      {prompt.systemPrompt.substring(0, 100)}
                      {prompt.systemPrompt.length > 100 ? '...' : ''}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Textarea
                id="prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Current system prompt"
                className="mt-4 mb-4"
                disabled={!isEditing}
              />
              {isEditing && (
                <Button 
                  className="absolute bottom-6 right-2" 
                  size="sm"
                  onClick={handleSavePrompt}
                  disabled={!systemPrompt.trim()}
                >
                  Save New Prompt
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <Button disabled={!isValid} onClick={handleStartChat} asChild>
              <Link href="/chat">Start New Chat</Link>
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