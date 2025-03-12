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

  // Validate path before sending request
  if (!path || path.includes('undefined') || path.includes('null')) {
    console.error(`Invalid API path detected: ${path}`);
    throw new Error(`Invalid API path: ${path}`);
  }

  console.log(`Sending ${method} request to: ${API_URL}${path}`);
  
  try {
    const response = await fetch(`${API_URL}${path}`, options);

    // Enhanced error logging
    if (!response.ok) {
      console.error(`API request failed: ${method} ${path} ${response.status} (${response.statusText})`);
      try {
        const errorData = await response.clone().json();
        console.error('Error details:', errorData);
      } catch (e) {
        // If the response isn't JSON, try to get the text
        const errorText = await response.clone().text();
        console.error('Error response text:', errorText);
      }
    }

    return response;
  } catch (error) {
    console.error(`Network error during API request: ${method} ${path}`, error);
    throw error;
  }
}