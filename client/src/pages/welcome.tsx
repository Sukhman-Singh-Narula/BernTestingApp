
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

export default function Welcome() {
  const [userName, setUserName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
  }, []);

  useEffect(() => {
    setIsValid(userName.trim().length > 0);
  }, [userName]);

  const handleStartChat = () => {
    localStorage.setItem("userName", userName);
    localStorage.setItem("systemPrompt", systemPrompt);
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
            <label htmlFor="prompt" className="block text-sm font-medium mb-2">Custom System Prompt (Optional)</label>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter a custom system prompt"
              className="mb-4"
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
