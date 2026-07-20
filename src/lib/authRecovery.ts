import 'react-native-url-polyfill/auto';

import { supabase } from './supabase';

type RecoveryResult = {
  success: boolean;
  error?: string;
};

function extractRecoveryParameters(url: string) {
  const parsedUrl = new URL(url);
  const parameters = new URLSearchParams(parsedUrl.search);

  const hash = parsedUrl.hash.startsWith('#')
    ? parsedUrl.hash.slice(1)
    : parsedUrl.hash;

  const hashParameters = new URLSearchParams(hash);

  for (const [key, value] of hashParameters.entries()) {
    if (!parameters.has(key)) {
      parameters.set(key, value);
    }
  }

  return parameters;
}

export async function establishRecoverySession(
  recoveryUrl?: string | null
): Promise<RecoveryResult> {
  try {
    if (recoveryUrl) {
      const parameters = extractRecoveryParameters(recoveryUrl);

      const errorDescription =
        parameters.get('error_description') ||
        parameters.get('error');

      if (errorDescription) {
        return {
          success: false,
          error: decodeURIComponent(errorDescription.replace(/\+/g, ' ')),
        };
      }

      const code = parameters.get('code');

      if (code) {
        const result = await supabase.auth.exchangeCodeForSession(code);

        if (result.error) {
          return {
            success: false,
            error: result.error.message,
          };
        }

        return {
          success: Boolean(result.data.session),
          error: result.data.session
            ? undefined
            : 'Supabase non ha restituito una sessione valida.',
        };
      }

      const accessToken = parameters.get('access_token');
      const refreshToken = parameters.get('refresh_token');

      if (accessToken && refreshToken) {
        const result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (result.error) {
          return {
            success: false,
            error: result.error.message,
          };
        }

        return {
          success: Boolean(result.data.session),
          error: result.data.session
            ? undefined
            : 'Supabase non ha restituito una sessione valida.',
        };
      }
    }

    const sessionResult = await supabase.auth.getSession();

    if (sessionResult.error) {
      return {
        success: false,
        error: sessionResult.error.message,
      };
    }

    if (sessionResult.data.session) {
      return { success: true };
    }

    return {
      success: false,
      error:
        'Il link di recupero non contiene una sessione valida. Richiedi una nuova email.',
    };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.message ||
        'Errore durante la verifica del link di recupero.',
    };
  }
}
