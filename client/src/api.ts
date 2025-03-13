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

    // First check if the response can be parsed as JSON
    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.error(`Failed to parse JSON response from ${path}`, e);
      throw new Error(`Invalid response format: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // Then check if the response was successful
    if (!response.ok) {
      const errorMessage = data.message || data.error || `Request failed with status ${response.status}`;
      console.error(`API request failed with status ${response.status}: ${errorMessage}`, data);
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    // Enhanced error logging
    console.error(`API request failed: ${method} ${path}`, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}