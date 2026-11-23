import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export async function getGooglePlaySubscription({ packageName, purchaseToken }) {
  const credentialsJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    const error = new Error('Google Play service account is not configured.');
    error.code = 'GOOGLE_PLAY_CONFIGURATION_MISSING';
    throw error;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    const error = new Error('Google Play service account configuration is invalid.');
    error.code = 'GOOGLE_PLAY_CONFIGURATION_INVALID';
    throw error;
  }
  if (!credentials.client_email || !credentials.private_key) {
    const error = new Error('Google Play service account configuration is incomplete.');
    error.code = 'GOOGLE_PLAY_CONFIGURATION_INVALID';
    throw error;
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
  const client = await auth.getClient();
  const url = [
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications',
    encodeURIComponent(packageName),
    'purchases/subscriptionsv2/tokens',
    encodeURIComponent(purchaseToken),
  ].join('/');
  const response = await client.request({ url, method: 'GET' });
  return response.data;
}

export async function verifyGooglePlayRtdnToken(idToken) {
  const audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE;
  const serviceAccountEmail = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL;
  if (!audience || !serviceAccountEmail) {
    const error = new Error('Google Play notification authentication is not configured.');
    error.code = 'GOOGLE_PLAY_RTDN_CONFIGURATION_MISSING';
    throw error;
  }
  const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  return Boolean(
    payload
    && payload.aud === audience
    && payload.email === serviceAccountEmail
    && payload.email_verified === true,
  );
}
