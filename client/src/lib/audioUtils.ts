/**
 * Converts a base64 string to a Blob object
 * @param base64 The base64 string to convert
 * @param mimeType The MIME type of the data (e.g., 'audio/mp3')
 * @returns A Blob representing the binary data
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Plays audio from the given URL
 * @param audioUrl URL to the audio file
 * @returns Promise that resolves when playback starts or rejects on error
 */
export function playAudio(audioUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    
    audio.onplay = () => resolve();
    audio.onerror = (error) => {
      console.error("Error playing audio:", error);
      reject(error);
    };
    
    audio.play().catch(reject);
  });
}