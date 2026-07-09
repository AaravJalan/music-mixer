import { Button } from '../ui/Button';
import { getAuthErrorInfo } from '../../utils/authErrors';
import { api } from '../../api/client';

interface AuthErrorBannerProps {
  errorCode: string;
  redirect?: string;
}

export function AuthErrorBanner({ errorCode, redirect = '/' }: AuthErrorBannerProps) {
  const info = getAuthErrorInfo(errorCode);

  return (
    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm max-w-md mx-auto text-left">
      <p className="text-red-300">{info.message}</p>
      {info.retryWithConsent && (
        <Button
          variant="spotify"
          size="sm"
          className="mt-3 w-full"
          onClick={() => api.login(redirect, { forceConsent: true })}
        >
          Try again with full permissions
        </Button>
      )}
    </div>
  );
}
