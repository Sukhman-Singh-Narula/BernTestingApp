export async function apiRequest(method: string, path: string, body?: any) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include'
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, options);

  // Log errors for debugging
  if (!response.ok) {
    console.error(`API request failed: ${method} ${path} ${response.status} (${response.statusText})`);
    try {
      const errorData = await response.json();
      console.error('Error details:', errorData);
    } catch (e) {
      // If the response isn't JSON, just log the status
      console.error('No additional error details available');
    }
  }

  return response;
}