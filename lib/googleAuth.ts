// Minimal "Sign in with Google" — just two fetch calls, no SDK. We don't
// verify the ID token's signature ourselves; Google's own tokeninfo endpoint
// does that (and checks expiry), handing back the verified claims directly.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID env var is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET env var is not set");
  return secret;
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleIdentity {
  email: string;
  name?: string;
}

export async function resolveGoogleIdentity(code: string, redirectUri: string): Promise<GoogleIdentity> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error("Google token exchange failed");
  const tokenData = await tokenRes.json();
  const idToken = tokenData.id_token;
  if (typeof idToken !== "string" || !idToken) throw new Error("Google did not return an id_token");

  const infoRes = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  if (!infoRes.ok) throw new Error("Google id_token verification failed");
  const claims = await infoRes.json();
  if (claims.aud !== clientId()) throw new Error("Google id_token audience mismatch");
  if (!claims.email || claims.email_verified !== "true") throw new Error("Google account email not verified");

  return { email: claims.email, name: typeof claims.name === "string" ? claims.name : undefined };
}
