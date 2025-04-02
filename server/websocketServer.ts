// server/websocketServer.ts
import { Server as HTTPServer } from 'http';
import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { audioService } from './services/audioSevice';

export function setupWebSocketServer(httpServer: HTTPServer) {
  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  
  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url) {
      socket.destroy();
      return;
    }
    
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    // Match audio WebSocket endpoints
    const audioStreamMatch = pathname.match(/\/api\/conversation\/(\d+)\/audio-socket/);
    
    if (audioStreamMatch) {
      // Extract conversation ID from URL
      const conversationId = parseInt(audioStreamMatch[1], 10);
      
      if (isNaN(conversationId) || conversationId <= 0) {
        console.error(`Invalid conversation ID in WebSocket path: ${conversationId}`);
        socket.destroy();
        return;
      }
      
      // Handle audio stream connection
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log(`Audio WebSocket connection established for conversation ${conversationId}`);
        audioService.handleConnection(ws, conversationId);
      });
    } else {
      console.log(`Rejected WebSocket connection to unknown path: ${pathname}`);
      socket.destroy();
    }
  });
  
  console.log('WebSocket server initialized');
  
  return wss;
}