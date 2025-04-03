import { useState, useEffect, useRef } from 'react';

export function useAudio() {
  const [audioBlobs, setAudioBlobs] = useState<Record<number, string>>({});
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const audioRefsMap = useRef<Map<number, HTMLAudioElement>>(new Map());

  // Play audio for a specific message
  const playMessageAudio = async (messageId: number, audioUrl: string) => {
    // Stop any currently playing audio
    stopAllAudio();
    
    try {
      // Create a new audio element if we don't have one for this message
      if (!audioRefsMap.current.has(messageId)) {
        const audio = new Audio(audioUrl);
        audioRefsMap.current.set(messageId, audio);
        
        // Set up events
        audio.onended = () => {
          setIsPlaying(prev => ({ ...prev, [messageId]: false }));
        };
        
        audio.onerror = (error) => {
          console.error(`Error playing audio for message ${messageId}:`, error);
          setIsPlaying(prev => ({ ...prev, [messageId]: false }));
        };
      }
      
      // Get the audio element and play it
      const audioElement = audioRefsMap.current.get(messageId);
      if (audioElement) {
        setIsPlaying(prev => ({ ...prev, [messageId]: true }));
        await audioElement.play();
      }
    } catch (error) {
      console.error(`Failed to play audio for message ${messageId}:`, error);
      setIsPlaying(prev => ({ ...prev, [messageId]: false }));
    }
  };
  
  // Stop playing a specific message's audio
  const stopMessageAudio = (messageId: number) => {
    const audioElement = audioRefsMap.current.get(messageId);
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setIsPlaying(prev => ({ ...prev, [messageId]: false }));
    }
  };
  
  // Stop all playing audio
  const stopAllAudio = () => {
    audioRefsMap.current.forEach((audio, messageId) => {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(prev => ({ ...prev, [messageId]: false }));
    });
  };
  
  // Clean up audio elements on component unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
      // Clear the map
      audioRefsMap.current.clear();
    };
  }, []);
  
  return {
    audioBlobs,
    setAudioBlobs,
    isPlaying,
    playMessageAudio,
    stopMessageAudio,
    stopAllAudio
  };
}