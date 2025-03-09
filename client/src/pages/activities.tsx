import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Step } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDistance } from "date-fns";

interface ActivityWithCount extends Activity {
  conversationCount: number;
}

export default function Activities() {
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  // Fetch activities with conversation counts
  const { data: activities } = useQuery<ActivityWithCount[]>({
    queryKey: ["/api/activities/with-counts"],
  });

  // Fetch steps for selected activity
  const { data: steps } = useQuery<Step[]>({
    queryKey: ["/api/activity", selectedActivityId, "steps"],
    queryFn: async () => {
      if (!selectedActivityId) return null;
      const response = await fetch(`/api/activity/${selectedActivityId}/steps`);
      if (!response.ok) throw new Error('Failed to fetch steps');
      return response.json();
    },
    enabled: !!selectedActivityId
  });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Language Learning Activities</h1>
      <div className="space-y-4">
        {activities?.map((activity) => (
          <Card key={activity.id} className="p-4">
            <Collapsible
              open={selectedActivityId === activity.id}
              onOpenChange={(isOpen) => setSelectedActivityId(isOpen ? activity.id : null)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{activity.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Type: {activity.contentType} • Total Steps: {activity.totalSteps} • 
                    Conversations: {activity.conversationCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created by {activity.createdBy} • {formatDistance(new Date(activity.createdAt), new Date(), { addSuffix: true })}
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {selectedActivityId === activity.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="mt-4">
                <ScrollArea className="h-[400px] rounded-md border">
                  <div className="min-w-[800px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Step</TableHead>
                          <TableHead className="min-w-[200px]">Description</TableHead>
                          <TableHead className="min-w-[200px]">Objective</TableHead>
                          <TableHead className="min-w-[250px]">Suggested Script</TableHead>
                          <TableHead className="min-w-[200px]">Expected Responses</TableHead>
                          <TableHead className="min-w-[150px]">Spanish Words</TableHead>
                          <TableHead className="min-w-[200px]">Success Response</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {steps?.map((step) => (
                          <TableRow key={step.id}>
                            <TableCell>{step.stepNumber}</TableCell>
                            <TableCell>{step.description}</TableCell>
                            <TableCell>{step.objective}</TableCell>
                            <TableCell>{step.suggestedScript}</TableCell>
                            <TableCell>{step.expectedResponses}</TableCell>
                            <TableCell>{step.spanishWords}</TableCell>
                            <TableCell>{step.successResponse}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}