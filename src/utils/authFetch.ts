export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('omr_token');
  } catch {
    return null;
  }
};

export const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.includes('/api/auth/login')) {
      window.dispatchEvent(new CustomEvent('omr:unauthorized'));
    }
  }

  return response;
};
