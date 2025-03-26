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

  const { data: systemPrompts } = useQuery({
    queryKey: ["systemPrompts"],
    queryFn: () => apiRequest<Array<{ id: number; systemPrompt: string; name?: string }>>("/api/activities/1/system-prompts", "GET")
  });

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    const storedPromptId = localStorage.getItem("lastSystemPromptId");
    if (storedName) setUserName(storedName);
    if (storedPromptId) setSelectedPromptId(storedPromptId);
  }, []);

  useEffect(() => {
    if (selectedPromptId && systemPrompts) {
      const selectedPrompt = systemPrompts.find(p => p.id.toString() === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.systemPrompt);
      }
    }
  }, [selectedPromptId, systemPrompts]);

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
            <label htmlFor="prompt-select" className="block text-sm font-medium mb-2">Select System Prompt</label>
            <Select value={selectedPromptId} onValueChange={(value) => setSelectedPromptId(value)}>
              <SelectTrigger className="mb-4">
                <SelectValue placeholder="Choose a system prompt" />
              </SelectTrigger>
              <SelectContent>
                {systemPrompts?.map((prompt) => (
                  <SelectItem key={prompt.id} value={prompt.id.toString()}>
                    {prompt.name || `Prompt ${prompt.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Current system prompt (editable)"
              className="mt-4 mb-4"
            />
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