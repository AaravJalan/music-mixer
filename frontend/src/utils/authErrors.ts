const AUTH_ERROR_MESSAGES: Record<string, { message: string; retryWithConsent?: boolean }> = {
  invalid_state: {
    message: 'Login session expired (server may have restarted). Please try again.',
  },
  expired_code: {
    message: 'Authorization code expired. Click below to log in again.',
  },
  reconsent_required: {
    message: 'Spotify needs permission to access your account again.',
    retryWithConsent: true,
  },
  no_refresh_token: {
    message: 'Could not get a refresh token. Please grant permissions again.',
    retryWithConsent: true,
  },
  callback_failed: {
    message: 'Something went wrong during login. Please try again.',
    retryWithConsent: true,
  },
  network_error: {
    message: 'Could not reach Spotify — check your internet connection or VPN, then try again.',
    retryWithConsent: true,
  },
  missing_code: {
    message: 'Spotify did not return an authorization code.',
  },
  access_denied: {
    message: 'You declined Spotify access.',
  },
};

export function getAuthErrorInfo(code: string) {
  return AUTH_ERROR_MESSAGES[code] ?? {
    message: `Login failed (${code}). Please try again.`,
    retryWithConsent: true,
  };
}
