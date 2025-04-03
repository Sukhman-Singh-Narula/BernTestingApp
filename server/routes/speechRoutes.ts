// server/routes/speechRoutes.ts
import { Router } from 'express';
import { storage } from '../storage';
import { textToSpeech } from '../lib/speechServices';
import { ELEVENLABS_VOICES } from '../config';

const router = Router();

// POST /api/speech/generate - Generate speech for any text
router.post("/generate", async (req, res) => {
  try {
    const { text, language = 'Spanish', voiceType = 'female' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Get appropriate voice ID based on language and gender
    const voiceId = ELEVENLABS_VOICES[language]?.[voiceType] || 
                   ELEVENLABS_VOICES['Spanish'].female;
    
    // Generate speech using ElevenLabs API
    const audioBuffer = await textToSpeech(text, voiceId);
    
    // Return the audio as MP3
    res.setHeader('Content-Type', 'audio/mp3');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// GET /api/speech/message/:id - Generate speech for a specific message
router.get("/message/:id", async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    
    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    
    // Get the message from storage
    const messages = await storage.getAllMessages();
    const message = messages.find(m => m.id === messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Get the conversation to determine the language
    const conversation = await storage.getConversation(message.conversationId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Get the activity to determine the language
    const activity = await storage.getActivity(conversation.activityId);
    
    // Determine language, defaulting to Spanish
    const language = activity?.language || 'Spanish';
    
    // Select voice based on message role
    const voiceType = message.role === 'user' ? 'male' : 'female';
    
    // Get appropriate voice ID
    const voiceId = ELEVENLABS_VOICES[language]?.[voiceType] || 
                   (voiceType === 'male' ? ELEVENLABS_VOICES['Spanish'].male : ELEVENLABS_VOICES['Spanish'].female);
    
    // Generate speech using ElevenLabs API
    const audioBuffer = await textToSpeech(message.content, voiceId);
    
    // Return the audio as MP3
    res.setHeader('Content-Type', 'audio/mp3');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error generating speech for message:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export default router;