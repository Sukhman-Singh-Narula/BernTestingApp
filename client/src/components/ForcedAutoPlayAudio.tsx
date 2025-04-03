// client/src/components/ForcedAutoplayAudio.tsx
import React, { useEffect, useRef, useState } from "react";

interface ForcedAutoplayAudioProps {
    audioUrl: string | null;
    onPlay?: () => void;
    onEnd?: () => void;
    onError?: (error: any) => void;
}

/**
 * A component that forces audio to autoplay using multiple strategies
 */
const ForcedAutoplayAudio: React.FC<ForcedAutoplayAudioProps> = ({
    audioUrl,
    onPlay,
    onEnd,
    onError
}) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playAttempted, setPlayAttempted] = useState(false);

    // Initial autoplay attempt when audio URL changes
    useEffect(() => {
        if (!audioUrl) return;

        // Reset playback state
        setPlayAttempted(false);

        console.log("ForcedAutoplayAudio: New audio URL received:", audioUrl);

        // Create the audio element
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Set up event handlers
        audio.onplay = () => {
            console.log("ForcedAutoplayAudio: Playback started");
            onPlay?.();
        };

        audio.onended = () => {
            console.log("ForcedAutoplayAudio: Playback ended");
            onEnd?.();
        };

        audio.onerror = (e) => {
            console.error("ForcedAutoplayAudio: Playback error", e);
            onError?.(e);
        };

        // First attempt at playback
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log("ForcedAutoplayAudio: Initial autoplay successful");
                    setPlayAttempted(true);
                })
                .catch(error => {
                    console.warn("ForcedAutoplayAudio: Initial autoplay failed", error);
                    // We'll try again in the next effect
                });
        }

        // Cleanup
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [audioUrl, onPlay, onEnd, onError]);

    // Second attempt at playback with user interaction simulation
    useEffect(() => {
        if (!audioUrl || !audioRef.current || playAttempted) return;

        // This effect is a fallback if the first attempt failed
        console.log("ForcedAutoplayAudio: Attempting secondary playback strategies");

        // Try with a slight delay
        const timeoutId = setTimeout(() => {
            if (!audioRef.current) return;

            // Try simulating user interaction
            // Sometimes a small timeout can help get around autoplay restrictions
            console.log("ForcedAutoplayAudio: Trying delayed playback");
            audioRef.current.volume = 1.0; // Ensure volume is up
            audioRef.current.muted = false; // Ensure not muted
            const secondAttempt = audioRef.current.play();

            if (secondAttempt !== undefined) {
                secondAttempt
                    .then(() => {
                        console.log("ForcedAutoplayAudio: Secondary autoplay successful");
                        setPlayAttempted(true);
                    })
                    .catch(error => {
                        console.error("ForcedAutoplayAudio: All autoplay attempts failed", error);
                        onError?.(error);
                    });
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [audioUrl, playAttempted, onError]);

    return null; // This is a non-visual component
};

export default ForcedAutoplayAudio;