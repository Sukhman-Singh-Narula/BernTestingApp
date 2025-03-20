
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Welcome() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Welcome to Language Learning AI</CardTitle>
          <CardDescription>Start learning a new language today!</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            Choose from our available activities or start a new conversation to begin practicing.
          </p>
          <div className="flex gap-4">
            <Button asChild>
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
