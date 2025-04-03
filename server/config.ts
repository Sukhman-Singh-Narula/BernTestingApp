// server/config.ts
// Load environment variables

// API Keys
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const PATRONUS_API_KEY = process.env.PATRONUS_API_KEY || '';
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

// Database
export const DATABASE_URL = process.env.DATABASE_URL || '';

// Server settings
export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
export const NODE_ENV = process.env.NODE_ENV || 'development';

// ElevenLabs Voice IDs
export const ELEVENLABS_VOICES = {
  'Spanish': {
    female: 'pNInz6obpgDQGcFmaJgB', // Nicole (Spanish)
    male: '5Q0t7uMcjvnagumLfvZi'     // Pedro (Spanish)
  },
  'English': {
    female: 'EXAVITQu4vr4xnSDxMaL', // Bella
    male: 'onwK4e9ZLuTAKqWW03F9'     // Josh
  },
  'French': {
    female: 'jsCqWAovK2LkecY7zXl4', // French female
    male: 'WeH5LBu7MsaeByG4d7nS'     // French male
  },
  'German': {
    female: 'zcAOhNBS3c14rBihAFp1', // German female 
    male: 'H3akZFS9oKR26wPMIcuy'     // German male
  }
};