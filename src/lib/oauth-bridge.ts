// Google sign-in outside Lovable hosting goes through public/oauth-bridge.html on the
// published Lovable app, because Lovable's OAuth broker only redirects to Lovable domains.
export const LOVABLE_APP_ORIGIN = "https://mealsmates.lovable.app";
export const OAUTH_STATE_KEY = "mealmate:oauth-state";
