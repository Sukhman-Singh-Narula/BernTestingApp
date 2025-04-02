// client/src/pages/chat.tsx
import { useState, useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Send,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Plus,
  Mic,
  Square,
  Volume2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Import types from schema
import type {
  Message,
  Step,
  MessageMetrics,
  SystemPrompt,
  MessageRole
} from "@shared/schema";

interface ConversationResponse {
  id: number;
  activityId: number;
  currentStep: number;
  userName: string;
  systemPromptId: number | null;
  messages: (Message & { metrics?: MessageMetrics, audioUrl?: string })[];
  systemPrompt?: SystemPrompt;
}

export default function Chat() {
  // State for text and UI control
  const [input, setInput] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for audio functionality
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Record<number, string>>({});
  const [usingVoiceInput, setUsingVoiceInput] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();

  // Get and validate conversation ID from URL params or localStorage
  const rawConversationId = params.id || localStorage.getItem("currentConversationId");
  const conversationId = rawConversationId && !isNaN(Number(rawConversationId)) ? Number(rawConversationId) : null;

  // Check user credentials and conversation ID
  useEffect(() => {
    const userName = localStorage.getItem("userName");
    if (!userName) {
      setLocation("/");
      return;
    }

    // Validate conversation ID
    if (!conversationId || isNaN(conversationId) || conversationId <= 0) {
      console.warn(`Invalid conversation ID detected: ${rawConversationId}, redirecting to home`);
      localStorage.removeItem("currentConversationId");
      setLocation("/");
      return;
    }

    // Only set localStorage for valid conversation IDs
    localStorage.setItem("currentConversationId", conversationId.toString());

    console.log(`Active conversation ID: ${conversationId}`);
  }, [setLocation, conversationId, rawConversationId, params.id]);

  // Check microphone permissions
  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        setHasMicPermission(true);

        // Setup audio analysis for visualization
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        console.log("Microphone permission granted");
      } catch (error) {
        console.error("Error accessing microphone:", error);
        setHasMicPermission(false);
      }
    };

    checkMicrophonePermission();

    // Cleanup on unmount
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Setup WebSocket connection for audio streaming
  useEffect(() => {
    if (!conversationId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/api/conversation/${conversationId}/audio-socket`;

    console.log(`Setting up WebSocket connection to: ${wsUrl}`);

    const socket = new WebSocket(wsUrl);
    websocketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connection established');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data.type);

        if (data.type === 'transcription') {
          // Handle speech-to-text result
          setInput(data.text);
          if (data.final) {
            // If this is the final transcription, automatically send the message
            handleSendTranscription(data.text);
          }
        } else if (data.type === 'audio-response') {
          // Handle text-to-speech response
          const { messageId, audioData } = data;

          // Store the audio blob URL for playback
          const audioBlob = base64ToBlob(audioData, 'audio/mp3');
          const audioUrl = URL.createObjectURL(audioBlob);

          setAudioBlobs(prev => ({
            ...prev,
            [messageId]: audioUrl
          }));

          // Automatically play the latest response
          playAudio(audioUrl);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    socket.onclose = (event) => {
      console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: "Lost connection to the speech service",
        variant: "destructive"
      });
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [conversationId, toast]);

  // Fetch conversation data
  const { data: conversation, isError, isLoading } = useQuery<ConversationResponse>({
    queryKey: ["/api/conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      console.log("Fetching conversation:", conversationId);
      const res = await fetch(`/api/conversation/${conversationId}`);
      if (!res.ok) {
        throw new Error(`Conversation not found: ${res.statusText}`);
      }
      const data = await res.json();
      return data;
    },
    enabled: !!conversationId
  });

  // Fetch activity steps
  const { data: steps } = useQuery<Step[]>({
    queryKey: ["/api/steps", conversation?.activityId],
    queryFn: async () => {
      if (!conversation?.activityId) return [];
      const res = await fetch(`/api/activity/${conversation.activityId}/steps`);
      if (!res.ok) {
        throw new Error('Failed to fetch steps');
      }
      return res.json();
    },
    enabled: !!conversation?.activityId
  });

  // Get current step
  const getCurrentStep = () => {
    if (!steps || !conversation) return null;
    return steps.find(step => step.stepNumber === conversation.currentStep);
  };

  // Handle audio visualization when recording
  useEffect(() => {
    if (isRecording && analyserRef.current) {
      const analyseAudio = () => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume level (0-100)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        setAudioLevel(Math.min(100, average));

        animationFrameRef.current = requestAnimationFrame(analyseAudio);
      };

      analyseAudio();
    } else if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      setAudioLevel(0);
    }
  }, [isRecording]);

  // Handle sending text message
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId || isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
        throw new Error(`Cannot send message - invalid conversation ID: ${conversationId}`);
      }

      setIsProcessing(true);

      return await apiRequest(
        "POST",
        `/api/conversation/${conversationId}/message`,
        { message, requestAudio: true }
      );
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ["/api/conversation", conversationId] });
      const previousConversation = queryClient.getQueryData<ConversationResponse>(["/api/conversation", conversationId]);

      if (previousConversation) {
        const optimisticMessage = {
          id: Date.now(),
          conversationId: Number(conversationId),
          stepId: previousConversation.currentStep,
          role: "user" as MessageRole,
          content: newMessage,
          createdAt: new Date().toISOString(),
          metadata: null,
        };

        queryClient.setQueryData<ConversationResponse>(
          ["/api/conversation", conversationId],
          old => ({
            ...old!,
            messages: [...(old?.messages || []), optimisticMessage],
          })
        );
      }

      return { previousConversation };
    },
    onError: (err, newMessage, context) => {
      setIsProcessing(false);
      if (context?.previousConversation) {
        queryClient.setQueryData(
          ["/api/conversation", conversationId],
          context.previousConversation
        );
      }
      toast({
        title: "Error",
        description: `Failed to send message: ${err.message}`,
        variant: "destructive"
      });
      setError(err.message);
    },
    onSuccess: (data) => {
      setInput("");
      setError(null);
    }
  });

  // Setup SSE for real-time updates
  useEffect(() => {
    if (!conversationId) return;

    // Create EventSource for SSE connection
    const eventSource = new EventSource(`/api/conversation/${conversationId}/stream`);
    eventSourceRef.current = eventSource;

    // Connection established
    eventSource.addEventListener('connected', (event) => {
      console.log('SSE connection established');
    });

    // User message received
    eventSource.addEventListener('user-message', (event) => {
      const data = JSON.parse(event.data);
      console.log('User message event:', data);
    });

    // AI thinking indication
    eventSource.addEventListener('thinking', (event) => {
      setTypingIndicator(true);
      console.log('AI thinking...');
    });

    // AI response received
    eventSource.addEventListener('ai-response', (event) => {
      setTypingIndicator(false);
      setIsProcessing(false);

      const data = JSON.parse(event.data);
      console.log('AI response event:', data);
      console.log('Step advanced:', data.stepAdvanced);
      console.log('Activity changed:', data.activityChanged);
      console.log('Updated conversation:', data.conversation);

      // Update the conversation with the new message
      queryClient.setQueryData<ConversationResponse>(
        ["/api/conversation", conversationId],
        (old) => {
          if (!old) return old;

          // Create a copy of the current messages
          const updatedMessages = [...old.messages];

          // Check if the AI message already exists (avoid duplicates)
          const messageExists = updatedMessages.some(m =>
            m.id === data.message.id && m.role === "assistant"
          );

          if (!messageExists) {
            updatedMessages.push(data.message);
          }

          // Update conversation object if step was advanced
          const updatedConversation = data.stepAdvanced
            ? { ...old, currentStep: data.conversation.currentStep }
            : old;
          // If activity was changed, we need to update both activity ID and current step
          if (data.activityChanged) {
            // If the activity changed, refetch the steps for the new activity
            queryClient.invalidateQueries({ queryKey: ["/api/steps", data.conversation.activityId] });

            toast({
              title: "Activity Changed",
              description: `You've switched to a new activity: ${data.activityChanged}`,
              variant: "default"
            });

            return {
              ...old,
              activityId: data.conversation.activityId,
              currentStep: data.conversation.currentStep,
              previousActivityId: data.conversation.previousActivityId,
              messages: updatedMessages
            };
          } 
          // Otherwise if just the step was advanced, update only the current step
          else if (data.stepAdvanced) {
            return {
              ...old,
              currentStep: data.conversation.currentStep,
              messages: updatedMessages
            };
          }
          // Otherwise just update the messages
          else {
            return {
              ...old,
              messages: updatedMessages
            };
          }
        }
      );
    });

    // Error handling
    eventSource.addEventListener('error', (event: any) => {
      console.error('SSE error:', event);
      setTypingIndicator(false);
      setIsProcessing(false);

      let errorMessage = "An error occurred during message processing";

      // Only try to parse data if it exists
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          errorMessage = data.error || errorMessage;
        } catch (e) {
          console.error('Error parsing SSE error data:', e);
        }
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    });

    // Clean up on unmount
    return () => {
      console.log('Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [conversationId, queryClient, toast]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  // Handle form submission for text input
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!conversationId || isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
      setError("Invalid conversation ID. Please start a new conversation.");
      toast({
        title: "Error",
        description: "Invalid conversation ID. Please start a new conversation.",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendMessage.mutateAsync(input);
    } catch (error) {
      console.error("Error sending message:", error);
      setError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle sending transcribed text
  const handleSendTranscription = async (text: string) => {
    if (!text.trim()) return;

    setInput(text);

    try {
      await sendMessage.mutateAsync(text);
    } catch (error) {
      console.error("Error sending transcribed message:", error);
      setError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Toggle between voice and text input
  const toggleVoiceInput = () => {
    setUsingVoiceInput(!usingVoiceInput);
  };

  // Start audio recording
  const startRecording = () => {
    if (!hasMicPermission || !audioStreamRef.current) {
      toast({
        title: "Microphone Error",
        description: "No microphone permission",
        variant: "destructive"
      });
      return;
    }

    audioChunksRef.current = [];

    try {
      const mediaRecorder = new MediaRecorder(audioStreamRef.current);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        sendAudioToServer(audioBlob);
      };

      mediaRecorder.start(100); // Collect chunks every 100ms for real-time processing
      setIsRecording(true);

      // Send start recording message to server
      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({
          type: 'start-recording',
          conversationId
        }));
      }
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording",
        variant: "destructive"
      });
    }
  };

  // Stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);

        // Send stop recording message to server
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(JSON.stringify({
            type: 'stop-recording',
            conversationId
          }));
        }
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    }
  };

  // Send recorded audio to server
  const sendAudioToServer = (audioBlob: Blob) => {
    if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "WebSocket connection not available",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    // Convert blob to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result?.toString().split(',')[1];

      if (base64data) {
        // Send audio data to server via WebSocket
        websocketRef.current?.send(JSON.stringify({
          type: 'audio-data',
          conversationId,
          audioData: base64data
        }));
      }
    };

    reader.readAsDataURL(audioBlob);
  };

  // Convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
  };

  // Audio playback function
  const playAudio = (audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error("Error playing audio:", error);
    });
  };

  if (isLoading) {
    return <div>Loading conversation...</div>;
  }

  if (isError || !conversation) {
    localStorage.removeItem("currentConversationId");
    setLocation("/");
    return <div>Redirecting to welcome page...</div>;
  }

  const currentStep = getCurrentStep();

  // Render audio level indicator for recording
  const renderAudioLevelIndicator = () => {
    if (!isRecording) return null;

    return (
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-100"
          style={{ width: `${audioLevel}%` }}
        />
      </div>
    );
  };

  return (
    <div className="container mx-auto h-screen p-4 flex flex-col gap-4">
      {error && <div className="text-red-500">{error}</div>}
      <div className="flex justify-between items-center">
        <Link href="/chat">
          <Button variant="outline">Back to Conversations</Button>
        </Link>
        <Link href="/">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex gap-4">
        <div className="flex-1 flex flex-col gap-4">
          {/* Activity Details Collapsible */}
          <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Activity Details</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4">
              {currentStep && (
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-2">Current Step ({conversation.currentStep})</h4>
                  <p className="text-sm text-muted-foreground mb-2">Objective: {currentStep.objective}</p>
                  <p className="text-sm text-muted-foreground">Script: {currentStep.suggestedScript}</p>
                </div>
              )}

              {steps && steps.length > 0 && (
                <ScrollArea className="h-64 rounded-md border">
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
                        {steps.map((step) => (
                          <TableRow key={step.id} className={step.stepNumber === conversation.currentStep ? "bg-muted" : ""}>
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
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Analytics Collapsible */}
          <Collapsible open={isAnalyticsOpen} onOpenChange={setIsAnalyticsOpen} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Message Analytics</h3>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isAnalyticsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4">
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Message</TableHead>
                        <TableHead>Cost (USD)</TableHead>
                        <TableHead>Latency (ms)</TableHead>
                        <TableHead>Prompt Tokens</TableHead>
                        <TableHead>Completion Tokens</TableHead>
                        <TableHead>Total Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversation.messages?.filter(m => m.metrics).map((message, index) => (
                        <TableRow key={index}>
                          <TableCell className="max-w-[200px] truncate">{message.content}</TableCell>
                          <TableCell>${message.metrics!.costUsd}</TableCell>
                          <TableCell>{message.metrics!.latencyMs}ms</TableCell>
                          <TableCell>{message.metrics!.promptTokens}</TableCell>
                          <TableCell>{message.metrics!.completionTokens}</TableCell>
                          <TableCell>{message.metrics!.totalTokens}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* Main Chat Area */}
          <Card className="flex-1 flex flex-col p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              <div className="space-y-4">
                {conversation.messages?.map((message, i) => (
                  <div key={i} className="space-y-2">
                    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 ${message.role === "user"
                          ? "bg-primary text-primary-foreground ml-4"
                          : "bg-muted"
                        }`}>
                        {message.content}
                      </div>
                    </div>

                    {/* Audio playback for assistant messages */}
                    {message.role === "assistant" && (
                      <div className="flex justify-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-3"
                          onClick={() => {
                            // Play audio if available for this message
                            const audioUrl = audioBlobs[message.id];
                            if (audioUrl) {
                              playAudio(audioUrl);
                            } else {
                              toast({
                                title: "Audio Not Available",
                                description: "No audio available for this message",
                                variant: "default"
                              });
                            }
                          }}
                        >
                          <Volume2 className="h-4 w-4 mr-1" />
                          Play Audio
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {typingIndicator && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="mt-4 space-y-2">
              {renderAudioLevelIndicator()}

              <div className="flex items-end gap-2">
                {usingVoiceInput ? (
                  <div className="flex-1 flex items-center justify-center p-2 border rounded-md bg-muted/20">
                    {isRecording ? (
                      <div className="text-center">
                        <p className="text-sm mb-2">Recording... Click to stop</p>
                        <Button
                          onClick={stopRecording}
                          variant="destructive"
                          className="rounded-full h-12 w-12"
                          disabled={isProcessing}
                        >
                          <Square className="h-5 w-5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm mb-2">Click to start speaking</p>
                        <Button
                          onClick={startRecording}
                          variant="default"
                          className="rounded-full h-12 w-12"
                          disabled={isProcessing || !hasMicPermission}
                        >
                          <Mic className="h-5 w-5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type your message..."
                      disabled={sendMessage.isPending || isProcessing}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={sendMessage.isPending || isProcessing || !input.trim()} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                )}

                {/* Toggle between voice and text input */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleVoiceInput}
                  disabled={isProcessing}
                  title={usingVoiceInput ? "Switch to text input" : "Switch to voice input"}
                >
                  {usingVoiceInput ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {hasMicPermission === false && (
                <div className="text-sm text-destructive">
                  Microphone access is required for voice input. Please enable it in your browser settings.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* System Prompt Sidebar */}
        <div className="w-96 flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-full px-1"
            onClick={() => setIsSystemPromptOpen(!isSystemPromptOpen)}
          >
            {isSystemPromptOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          {isSystemPromptOpen && (
            <Card className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Activity System Prompt</h3>
              </div>
              <ScrollArea className="flex-1">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {conversation.systemPrompt?.systemPrompt || 'No activity system prompt available'}
                  </pre>
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}