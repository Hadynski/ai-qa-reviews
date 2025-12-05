type TokenCache = {
  token: string | null;
  expiresAt: number;
};

let tokenCache: TokenCache = {
  token: null,
  expiresAt: 0,
};

export async function getDaktelaToken(): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, '');
  const daktelaLogin = process.env.DAKTELA_LOGIN;
  const daktelaPassword = process.env.DAKTELA_PASSWORD;

  if (!daktelaUrl || !daktelaLogin || !daktelaPassword) {
    throw new Error('Missing Daktela credentials in environment variables');
  }

  const payload = {
    username: daktelaLogin,
    password: daktelaPassword,
    only_token: 1,
  };

  const response = await fetch(`${daktelaUrl}/api/v6/login.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Daktela API error response:', data);
    throw new Error(`Daktela login failed: ${response.statusText}`);
  }

  if (data.error && data.error.length > 0) {
    console.error('Daktela login error:', data.error);
    throw new Error(`Daktela login error: ${JSON.stringify(data.error)}`);
  }

  if (!data.result) {
    console.error('No token in response:', data);
    throw new Error('No token received from Daktela');
  }

  const token: string = data.result;
  tokenCache.token = token;
  tokenCache.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return token;
}

export function clearTokenCache(): void {
  tokenCache = {
    token: null,
    expiresAt: 0,
  };
}

export function getTokenFromCache(): string | null {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  return null;
}
