import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/**
 * Returns a Google ID token, or throws with a human-readable message.
 * Requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and a dev build with the
 * google-signin plugin) — until then, use the dev sign-in path.
 * The web client ID stamps the token's audience; the iOS client ID is
 * what the native Google sheet authenticates the app itself with.
 */
export async function signInWithGoogle(): Promise<string> {
  if (!WEB_CLIENT_ID) {
    throw new Error(
      'Google sign-in is not configured yet (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID missing). Use dev sign-in.',
    );
  }
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google sign-in was cancelled or returned no token.');
  }
  return response.data.idToken;
}
