import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
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
    onSuccess: (data) => {
      setSelectedPromptId(data.id.toString());
    }
  });

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
    if (systemPrompts?.length > 0) {
      const mostRecent = systemPrompts[0];
      setSelectedPromptId(mostRecent.id.toString());
      setSystemPrompt(mostRecent.systemPrompt);
    }
  }, [systemPrompts]);

  useEffect(() => {
    if (selectedPromptId && systemPrompts) {
      const selectedPrompt = systemPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.systemPrompt);
      }
    }
  }, [selectedPromptId, systemPrompts]);

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    if (value.trim()) {
      createSystemPrompt.mutate(value);
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
            <div className="mb-2">
              <label htmlFor="prompt-select" className="text-sm font-medium">Select System Prompt</label>
            </div>
            <Select 
              value={selectedPromptId} 
              onValueChange={(value) => setSelectedPromptId(value)}
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
              <p className="text-sm text-muted-foreground mb-2">
                {!isEditing ? 'Edit this prompt to create a new system prompt' : 'A new system prompt will be saved'}
              </p>
              <Textarea
                id="prompt"
                value={systemPrompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="Edit or create a new system prompt"
                className={`mt-4 mb-4 min-h-[300px] text-sm ${!isEditing ? 'bg-muted text-muted-foreground cursor-pointer' : ''}`}
                onClick={() => !isEditing && setIsEditing(true)}
                readOnly={!isEditing}
              />
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