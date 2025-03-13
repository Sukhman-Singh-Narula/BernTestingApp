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

  // Enhanced path validation
  if (!path) {
    console.error('Empty API path detected');
    throw new Error('Empty API path');
  }

  // Check for invalid path components
  if (path.includes('undefined') || path.includes('null')) {
    console.error(`Invalid API path detected: ${path}`);
    throw new Error(`Invalid API path: ${path}`);
  }

  // Specifically check for conversation message endpoints with potential ID issues
  if (path.includes('/api/conversation/') && path.includes('/message')) {
    const idMatch = path.match(/\/conversation\/([^\/]+)\/message/);
    if (idMatch && idMatch[1]) {
      const conversationId = idMatch[1];
      if (isNaN(Number(conversationId)) || Number(conversationId) <= 0) {
        console.error(`Invalid conversation ID in path: ${conversationId}`);
        throw new Error(`Invalid conversation ID: ${conversationId}`);
      }
    }
  }

  console.log(`Sending ${method} request to: ${API_URL}${path}`);

  try {
    console.log(`Executing ${method} request to ${API_URL}${path}`, { 
      options: { 
        method, 
        headers: options.headers,
        body: options.body ? '[BODY]' : undefined
      }
    });

    const response = await fetch(`${API_URL}${path}`, options);

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      console.error(`API request failed with status ${response.status} for path ${path}`);

      if (isJson) {
        const errorData = await response.json();
        console.error('API error details:', errorData);
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      } else {
        const textError = await response.text();
        console.error('API error response:', textError);
        throw new Error(`API error: ${response.status}`);
      }
    }

    return response;
  } catch (error) {
    console.error(`Network error during API request: ${method} ${path}`, error);
    throw error;
  }
}