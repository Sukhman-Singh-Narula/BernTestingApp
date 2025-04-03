// client/src/services/audioService.ts
export class AudioService {
    private socket: WebSocket | null = null;
    private isConnected: boolean = false;
    private messageHandlers: Record<string, ((data: any) => void)[]> = {};

    constructor(private conversationId: number) { }

    connect() {
        if (this.isConnected) return;

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${window.location.host}/api/conversation/${this.conversationId}/audio-stream`;

        console.log(`Connecting to WebSocket at ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WebSocket connection established');
            this.isConnected = true;
            this.emit('connected', { conversationId: this.conversationId });
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const { type, payload } = data;

                console.log(`Received WebSocket message of type: ${type}`);

                if (this.messageHandlers[type]) {
                    this.messageHandlers[type].forEach(handler => handler(payload));
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('WebSocket connection closed');
            this.isConnected = false;
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.isConnected = false;
        };
    }

    disconnect() {
        if (!this.socket) return;

        this.socket.close();
        this.socket = null;
        this.isConnected = false;
    }

    sendAudio(audioBlob: Blob) {
        if (!this.isConnected || !this.socket) {
            console.error('Cannot send audio: WebSocket not connected');
            return;
        }

        console.log('Sending audio data via WebSocket');

        // Send audio data in chunks to avoid large payloads
        const chunkSize = 16 * 1024; // 16KB chunks
        const reader = new FileReader();

        reader.onload = (e) => {
            if (!e.target || !e.target.result || !this.socket) return;

            const audioData = e.target.result;

            // Send audio data message
            this.socket.send(JSON.stringify({
                type: 'audio-data',
                payload: {
                    conversationId: this.conversationId,
                    audioData
                }
            }));
        };

        reader.readAsDataURL(audioBlob);
    }

    on(eventType: string, handler: (data: any) => void) {
        if (!this.messageHandlers[eventType]) {
            this.messageHandlers[eventType] = [];
        }

        this.messageHandlers[eventType].push(handler);

        return () => {
            this.messageHandlers[eventType] =
                this.messageHandlers[eventType].filter(h => h !== handler);
        };
    }

    emit(eventType: string, data: any) {
        if (!this.isConnected || !this.socket) {
            console.error(`Cannot emit ${eventType}: WebSocket not connected`);
            return;
        }

        this.socket.send(JSON.stringify({
            type: eventType,
            payload: data
        }));
    }
}

export default function createAudioService(conversationId: number) {
    return new AudioService(conversationId);
}