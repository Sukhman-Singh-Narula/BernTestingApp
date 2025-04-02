// client/src/components/AudioPlayer.tsx
import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface AudioPlayerProps {
    audioUrl: string | null;
    autoPlay?: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
    audioUrl,
    autoPlay = false
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(80);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
        }
    }, [volume]);

    useEffect(() => {
        if (audioUrl && autoPlay && audioRef.current) {
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(err => console.error("Error auto-playing audio:", err));
        }
    }, [audioUrl, autoPlay]);

    const togglePlayback = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play()
                .catch(err => console.error("Error playing audio:", err));
        }

        setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
        if (!audioRef.current) return;

        setCurrentTime(audioRef.current.currentTime);

        if (audioRef.current.ended) {
            setIsPlaying(false);
        }
    };

    const handleLoadedMetadata = () => {
        if (!audioRef.current) return;
        setDuration(audioRef.current.duration);
    };

    const handleSeek = (value: number[]) => {
        if (!audioRef.current) return;

        const newTime = value[0];
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    if (!audioUrl) return null;

    return (
        <div className="w-full flex flex-col gap-2 p-2 border rounded-md">
            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                hidden
            />

            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePlayback}
                    disabled={!audioUrl}
                >
                    {isPlaying ?
                        <Pause className="h-5 w-5" /> :
                        <Play className="h-5 w-5" />
                    }
                </Button>

                <div className="flex-1">
                    <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        disabled={!audioUrl}
                    />
                </div>

                <div className="text-xs text-muted-foreground min-w-[60px] text-right">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Slider
                    className="w-24"
                    value={[volume]}
                    max={100}
                    step={1}
                    onValueChange={(value) => setVolume(value[0])}
                />
            </div>
        </div>
    );
};

export default AudioPlayer;