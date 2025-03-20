
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function Welcome() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Language Learning AI</CardTitle>
          <CardDescription>Start learning a new language today!</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Choose from our available activities or start a new conversation to begin practicing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
