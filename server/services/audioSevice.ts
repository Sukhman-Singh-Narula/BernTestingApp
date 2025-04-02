// server/services/audioService.ts
import WebSocket from 'ws';
import { storage } from '../storage';
import { MessageRole } from '@shared/schema';
import { messageEvents } from './messageService';
import { speechToText, textToSpeech } from '../lib/speechServices';
import { ELEVENLABS_VOICES } from '../config';

// Store active WebSocket connections by conversation ID
const activeConnections: Map<number, Set<WebSocket>> = new Map();

// Store active transcription sessions
const transcriptionSessions: Map<WebSocket, {
  conversationId: number;
  isRecording: boolean;
  audioChunks: Buffer[];
  language: string;
}> = new Map();

class AudioService {
  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws: WebSocket, conversationId: number) {
    console.log(`New WebSocket connection for conversation ${conversationId}`);
    
    // Store the connection
    if (!activeConnections.has(conversationId)) {
      activeConnections.set(conversationId, new Set());
    }
    activeConnections.get(conversationId)?.add(ws);
    
    // Get the activity language for this conversation
    this.getConversationLanguage(conversationId).then(language => {
      console.log(`Conversation ${conversationId} language: ${language}`);
      
      // Initialize transcription session
      transcriptionSessions.set(ws, {
        conversationId,
        isRecording: false,
        audioChunks: [],
        language
      });
    }).catch(error => {
      console.error(`Error getting conversation language: ${error}`);
      // Default to Spanish if language can't be determined
      transcriptionSessions.set(ws, {
        conversationId,
        isRecording: false,
        audioChunks: [],
        language: 'Spanish'
      });
    });
    
    // Handle messages from the client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'start-recording':
            this.handleStartRecording(ws);
            break;
            
          case 'stop-recording':
            await this.handleStopRecording(ws);
            break;
            
          case 'audio-data':
            this.handleAudioData(ws, data);
            break;
            
          default:
            console.log(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        this.sendError(ws, 'Failed to process message');
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      // Remove from active connections
      activeConnections.get(conversationId)?.delete(ws);
      if (activeConnections.get(conversationId)?.size === 0) {
        activeConnections.delete(conversationId);
      }
      
      // Clean up transcription session
      transcriptionSessions.delete(ws);
      console.log(`WebSocket connection closed for conversation ${conversationId}`);
    });
    
    // Send connected confirmation
    this.sendMessage(ws, 'connected', { conversationId });
    
    // Listen for message events to generate speech
    const messageHandler = async (data: any) => {
      if (data.conversationId === conversationId && 
          data.type === 'ai-response' && 
          data.message && 
          data.message.role === 'assistant') {
        
        try {
          console.log(`Generating speech for message ID ${data.message.id}`);
          
          // Get the session to determine language
          const sessions = Array.from(transcriptionSessions.values())
            .filter(session => session.conversationId === conversationId);
          
          const language = sessions.length > 0 ? sessions[0].language : 'Spanish';
          
          // Get appropriate voice ID based on language (using female voice by default)
          const voiceId = ELEVENLABS_VOICES[language]?.female || 
            ELEVENLABS_VOICES['Spanish'].female;
          
          // Generate speech for assistant message
          const audioBuffer = await textToSpeech(data.message.content, voiceId);
          
          // Convert buffer to base64
          const base64Audio = audioBuffer.toString('base64');
          
          // Send audio to client
          this.sendMessage(ws, 'audio-response', {
            messageId: data.message.id,
            audioData: base64Audio
          });
          
          console.log(`Speech generated and sent for message ID ${data.message.id}`);
        } catch (error) {
          console.error('Error generating speech:', error);
          this.sendError(ws, 'Failed to generate speech');
        }
      }
    };
    
    messageEvents.on('message', messageHandler);
    
    // Store the message handler for cleanup on connection close
    ws.on('close', () => {
      messageEvents.removeListener('message', messageHandler);
    });
  }
  
  /**
   * Get the language for a conversation based on its activity
   */
  private async getConversationLanguage(conversationId: number): Promise<string> {
    try {
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }
      
      const activity = await storage.getActivity(conversation.activityId);
      if (!activity) {
        throw new Error(`Activity ${conversation.activityId} not found`);
      }
      
      return activity.language || 'Spanish';
    } catch (error) {
      console.error(`Error getting conversation language: ${error}`);
      return 'Spanish'; // Default to Spanish
    }
  }
  
  /**
   * Handle start recording message
   */
  private handleStartRecording(ws: WebSocket) {
    const session = transcriptionSessions.get(ws);
    if (!session) {
      this.sendError(ws, 'No active session found');
      return;
    }
    
    session.isRecording = true;
    session.audioChunks = [];
    
    console.log(`Started recording for conversation ${session.conversationId}`);
  }
  
  /**
   * Handle stop recording message
   */
  private async handleStopRecording(ws: WebSocket) {
    const session = transcriptionSessions.get(ws);
    if (!session || !session.isRecording) {
      this.sendError(ws, 'No active recording session found');
      return;
    }
    
    session.isRecording = false;
    
    // If we have audio chunks, process them for final transcription
    if (session.audioChunks.length > 0) {
      try {
        console.log(`Processing ${session.audioChunks.length} audio chunks for final transcription`);
        
        // Combine audio chunks
        const audioBuffer = Buffer.concat(session.audioChunks);
        
        // Perform speech-to-text using Whisper via Groq
        const transcription = await speechToText(audioBuffer);
        
        // Send final transcription to client
        this.sendMessage(ws, 'transcription', {
          text: transcription,
          final: true
        });
        
        console.log(`Generated final transcription for conversation ${session.conversationId}: "${transcription}"`);
        
        // Clear audio chunks
        session.audioChunks = [];
      } catch (error) {
        console.error('Error processing audio for transcription:', error);
        this.sendError(ws, 'Failed to process audio');
      }
    } else {
      console.log('No audio chunks to process');
      this.sendMessage(ws, 'transcription', {
        text: '',
        final: true
      });
    }
  }
  
  /**
   * Handle audio data from client
   */
  private handleAudioData(ws: WebSocket, data: any) {
    const session = transcriptionSessions.get(ws);
    if (!session || !session.isRecording) {
      return;
    }
    
    try {
      // Extract audio data from base64
      const audioData = Buffer.from(data.audioData, 'base64');
      
      // Add to audio chunks
      session.audioChunks.push(audioData);
      
      console.log(`Received audio chunk: ${audioData.length} bytes, total chunks: ${session.audioChunks.length}`);
      
      // For Whisper, we don't do interim transcriptions as it's not designed for streaming
      // But we could implement a chunking strategy for longer recordings if needed
    } catch (error) {
      console.error('Error processing audio data:', error);
    }
  }
  
  /**
   * Send a message to the client
   */
  private sendMessage(ws: WebSocket, type: string, payload: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type,
        ...payload
      }));
    }
  }
  
  /**
   * Send an error message to the client
   */
  private sendError(ws: WebSocket, message: string) {
    this.sendMessage(ws, 'error', { error: message });
  }
  
  /**
   * Broadcast a message to all clients connected to a conversation
   */
  broadcastToConversation(conversationId: number, type: string, payload: any) {
    const clients = activeConnections.get(conversationId);
    if (!clients) return;
    
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type,
          ...payload
        }));
      }
    }
  }
}

export const audioService = new AudioService();