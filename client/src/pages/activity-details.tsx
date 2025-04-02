import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Activity, ActivitySystemPrompt, Step } from "@shared/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, BookOpen, Info, List, MessageSquareText, PlusCircle, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function ActivityDetails() {
  const { id } = useParams();
  const activityId = parseInt(id || "0");
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const { toast } = useToast();
  
  // Fetch activity details
  const { data: activity, isLoading: isLoadingActivity, error: activityError } = useQuery<Activity>({
    queryKey: [`/api/activities/${activityId}`],
    enabled: !!activityId,
    retry: 3,
  });

  // Fetch activity steps
  const { data: steps, isLoading: isLoadingSteps, error: stepsError } = useQuery<Step[]>({
    queryKey: [`/api/activity/${activityId}/steps`],
    enabled: !!activityId,
    retry: 3,
  });

  // Fetch activity system prompts
  const { data: systemPrompts, isLoading: isLoadingPrompts, error: promptsError } = useQuery<ActivitySystemPrompt[]>({
    queryKey: [`/api/system-prompts/activity/${activityId}`],
    enabled: !!activityId,
    retry: 3,
  });

  // Create system prompt mutation
  const createPromptMutation = useMutation({
    mutationFn: async (data: { activityId: number, systemPrompt: string, createdBy: string }) => {
      const response = await fetch('/api/system-prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create system prompt');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Reset form
      setNewPrompt("");
      setCreatorName("");
      setIsCreatingPrompt(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/system-prompts/activity/${activityId}`] });
      
      toast({
        title: "Success",
        description: "System prompt created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleCreatePrompt = () => {
    if (!newPrompt.trim()) {
      toast({
        title: "Error",
        description: "System prompt cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (!creatorName.trim()) {
      toast({
        title: "Error",
        description: "Creator name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    createPromptMutation.mutate({
      activityId,
      systemPrompt: newPrompt,
      createdBy: creatorName,
    });
  };

  const isLoading = isLoadingActivity || isLoadingSteps || isLoadingPrompts;
  const hasError = activityError || stepsError || promptsError;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Loading activity details...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (hasError || !activityId) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load activity details. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Not Found</AlertTitle>
          <AlertDescription>
            Activity not found. It may have been deleted or the ID is invalid.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{activity.name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-sm">
            {activity.contentType}
          </Badge>
          <Badge variant="outline" className="text-sm">
            Language: {activity.language}
          </Badge>
          {activity.hidden && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
              Hidden
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Created by {activity.createdBy} on {format(new Date(activity.createdAt), "PPP")}
        </p>
      </div>

      <Tabs defaultValue="steps" className="space-y-4">
        <TabsList>
          <TabsTrigger value="steps" className="flex items-center gap-1">
            <List className="h-4 w-4" />
            <span>Steps ({steps?.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="flex items-center gap-1">
            <MessageSquareText className="h-4 w-4" />
            <span>System Prompts ({systemPrompts?.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-1">
            <Info className="h-4 w-4" />
            <span>Details</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="steps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Steps</CardTitle>
              <CardDescription>
                Step-by-step progression for this activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {steps && steps.length > 0 ? (
                <div className="space-y-4">
                  {steps.sort((a, b) => a.stepNumber - b.stepNumber).map((step) => (
                    <Card key={step.id} className="border border-muted">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Badge>{`Step ${step.stepNumber}`}</Badge>
                            <h3 className="font-semibold">{step.objective}</h3>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <h4 className="text-sm font-medium mb-1">Description</h4>
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-medium mb-1">Script</h4>
                          <p className="text-sm text-muted-foreground">{step.suggestedScript}</p>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          <div>
                            <h4 className="text-sm font-medium mb-1">Spanish Words</h4>
                            <p className="text-sm text-muted-foreground">{step.spanishWords || "None"}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium mb-1">Expected Responses</h4>
                            <p className="text-sm text-muted-foreground">{step.expectedResponses}</p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1">Success Response</h4>
                          <p className="text-sm text-muted-foreground">{step.successResponse}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No steps found for this activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="prompts" className="space-y-4">
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => setIsCreatingPrompt(!isCreatingPrompt)}
              variant={isCreatingPrompt ? "secondary" : "default"}
            >
              {isCreatingPrompt ? (
                "Cancel"
              ) : (
                <>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add New Prompt
                </>
              )}
            </Button>
          </div>

          {isCreatingPrompt && (
            <Card className="mb-6 border-primary/20">
              <CardHeader>
                <CardTitle>Create New System Prompt</CardTitle>
                <CardDescription>
                  Add a new system prompt for this activity to guide AI behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="creator-name" className="text-sm font-medium block mb-2">
                    Your Name
                  </label>
                  <Input
                    id="creator-name"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="Enter your name"
                    className="max-w-md"
                  />
                </div>
                <div>
                  <label htmlFor="system-prompt" className="text-sm font-medium block mb-2">
                    System Prompt
                  </label>
                  <Textarea
                    id="system-prompt"
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Enter the system prompt text here..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    System prompts are instructions that guide the AI's behavior during conversations.
                    Be specific about how the AI should respond to the user.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  onClick={handleCreatePrompt}
                  disabled={createPromptMutation.isPending}
                >
                  {createPromptMutation.isPending ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Prompt
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Existing System Prompts</CardTitle>
              <CardDescription>
                Prompts used to guide the AI's behavior for this activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {systemPrompts && systemPrompts.length > 0 ? (
                <div className="space-y-4">
                  {systemPrompts.map((prompt) => (
                    <Card key={prompt.id} className="border border-muted">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">Prompt #{prompt.id}</h3>
                              <Badge variant="outline" className="text-xs">
                                Created by {prompt.createdBy}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(prompt.createdAt), "PPP 'at' pp")}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                          <pre className="text-sm whitespace-pre-wrap font-mono">
                            {prompt.systemPrompt}
                          </pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <MessageSquareText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No system prompts found for this activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Activity Details</CardTitle>
              <CardDescription>
                Complete information about this activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-1">ID</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.id}</p>
                  
                  <h3 className="text-sm font-medium mb-1">Name</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.name}</p>
                  
                  <h3 className="text-sm font-medium mb-1">Content Type</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.contentType}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium mb-1">Total Steps</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.totalSteps}</p>
                  
                  <h3 className="text-sm font-medium mb-1">Created By</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.createdBy}</p>
                  
                  <h3 className="text-sm font-medium mb-1">Language</h3>
                  <p className="text-sm text-muted-foreground mb-4">{activity.language}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-1">Created At</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {format(new Date(activity.createdAt), "PPP 'at' pp")}
                </p>
                
                <h3 className="text-sm font-medium mb-1">Visibility</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {activity.hidden ? "Hidden" : "Visible"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}