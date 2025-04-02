// client/src/components/AudioRecorder.tsx
import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Volume2, VolumeX } from "lucide-react";

interface AudioRecorderProps {
    onAudioData: (audioBlob: Blob) => void;
    isProcessing: boolean;
    isRecording: boolean;
    setIsRecording: (isRecording: boolean) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
    onAudioData,
    isProcessing,
    isRecording,
    setIsRecording
}) => {
    const [audioPermission, setAudioPermission] = useState<boolean>(false);
    const [audioLevel, setAudioLevel] = useState<number>(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Request microphone permission on component mount
    useEffect(() => {
        const requestMicrophonePermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setAudioPermission(true);
                audioStreamRef.current = stream;

                // Set up audio analyzer
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
                setAudioPermission(false);
            }
        };

        requestMicrophonePermission();

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

    // Start audio visualization when recording
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

    const startRecording = () => {
        if (!audioPermission || !audioStreamRef.current) {
            console.error("No microphone permission");
            return;
        }

        audioChunksRef.current = [];

        // Create MediaRecorder with stream
        const mediaRecorder = new MediaRecorder(audioStreamRef.current);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            onAudioData(audioBlob);
        };

        mediaRecorder.start();
        setIsRecording(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

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
        <div className="flex flex-col gap-2">
            {renderAudioLevelIndicator()}
            <div className="flex gap-2 justify-center">
                {audioPermission ? (
                    <>
                        <Button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isProcessing}
                            variant={isRecording ? "destructive" : "default"}
                            size="icon"
                            className="rounded-full h-12 w-12"
                        >
                            {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        <div className="flex items-center text-sm text-muted-foreground">
                            {isRecording ? "Recording... Click to stop" : "Click to start recording"}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2 text-destructive">
                        <VolumeX className="h-5 w-5" />
                        <span>Microphone access denied</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AudioRecorder;