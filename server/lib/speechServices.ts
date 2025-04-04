// server/lib/speechServices.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import FormData from 'form-data';
import { GROQ_API_KEY, ELEVENLABS_API_KEY } from '../config';
import { ElevenLabsClient, stream } from 'elevenlabs';
/**
 * Convert speech to text using Groq API with Whisper model
 * @param audioBuffer The audio buffer to process
 * @param isInterim Whether this is an interim result (not used for Whisper, but kept for API consistency)
 * @returns The transcribed text
 */
export async function speechToText(audioBuffer: Buffer, isInterim: boolean = false): Promise<string> {
  try {
    console.log(`Processing speech-to-text with Groq/Whisper, size: ${audioBuffer.length} bytes`);

    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set in environment variables');
    }

    // Save audio buffer to a temporary file
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath), {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es'); // Spanish by default, can be made dynamic

    // Make API request to Groq for transcription
    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
    });

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    // Extract and return transcription
    if (response.data && response.data.text) {
      return response.data.text;
    } else {
      throw new Error('Unexpected response format from Groq API');
    }
  } catch (error) {
    console.error('Error in speech-to-text:', error);

    // Provide a more specific error message if available
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    console.error(`Speech-to-text error details: ${errorMessage}`);

    return isInterim ? "" : "Sorry, I couldn't understand the audio.";
  }
}

/**
 * Convert text to speech using ElevenLabs API
 * @param text The text to convert to speech
 * @param voiceId The ElevenLabs voice ID to use (defaults to a Spanish female voice)
 * @returns Buffer containing the audio data
 */
export async function textToSpeech(text: string, voiceId: string = 'pNInz6obpgDQGcFmaJgB'): Promise<Buffer> {
  try {
    console.log(`Converting text to speech using ElevenLabs: "${text.substring(0, 50)}..."`);

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
    }
    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
    const response = await client.textToSpeech.convertAsStream('JBFqnCBsd6RMkjVDRZzb', {
      text: text,
      model_id: 'eleven_multilingual_v2',
    });
    // Handle the streaming response
    const chunks: Buffer[] = [];
    const stream = response.data as Readable;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    await finished(stream);

    // Combine chunks into a single buffer
    const audioBuffer = Buffer.concat(chunks);
    console.log(`Generated audio with ElevenLabs: ${audioBuffer.length} bytes`);

    return audioBuffer;
  } catch (error) {
    console.error('Error in text-to-speech:', error);

    // More detailed error message
    const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
    console.error(`Text-to-speech error details: ${errorMessage}`);

    throw new Error(`Text-to-speech failed: ${errorMessage}`);
  }
}

// Fallback functions for testing without API keys
export async function fallbackSpeechToText(audioBuffer: Buffer): Promise<string> {
  console.log(`[FALLBACK] Processing speech-to-text, size: ${audioBuffer.length} bytes`);
  return "This is a fallback transcription. Speech-to-text service not configured.";
}

export async function fallbackTextToSpeech(text: string): Promise<Buffer> {
  console.log(`[FALLBACK] Converting text to speech: "${text.substring(0, 50)}..."`);
  // Return an empty buffer as a placeholder
  return Buffer.from([]);
}

// Export the appropriate functions based on configuration
export default {
  speechToText: GROQ_API_KEY ? speechToText : fallbackSpeechToText,
  textToSpeech: ELEVENLABS_API_KEY ? textToSpeech : fallbackTextToSpeech
};