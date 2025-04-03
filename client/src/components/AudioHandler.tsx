// client/src/components/AudioHandler.tsx
import React, { useEffect, useRef } from "react";

interface AudioHandlerProps {
    audioUrl?: string;
    autoPlay?: boolean;
}

const AudioHandler: React.FC<AudioHandlerProps> = ({ audioUrl, autoPlay = true }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (audioUrl && autoPlay && audioRef.current) {
            audioRef.current.play().catch(err => {
                console.error("Error auto-playing audio:", err);
            });
        }
    }, [audioUrl, autoPlay]);

    if (!audioUrl) return null;

    return (
        <audio
            ref={audioRef}
            src={audioUrl}
            className="hidden"
        />
    );
};

export default AudioHandler;