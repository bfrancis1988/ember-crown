// src/lib/googleSignin.ts
// One-time configuration for native Google Sign-In. Call configureGoogleSignin()
// once at startup, before any GoogleSignin.signIn() call.
//
// webClientId is the OAuth 2.0 "Web application" client (client_type 3 in
// google-services.json) — it is the audience Firebase validates the returned
// ID token against. The iOS client is read automatically from
// GoogleService-Info.plist (wired via iosUrlScheme in app.json). OAuth client
// IDs are not secrets.

import { GoogleSignin } from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID =
  '903632353042-cpnikna91a954raor53q2s7b31fsk056.apps.googleusercontent.com';

export function configureGoogleSignin(): void {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
}

export { GoogleSignin };
