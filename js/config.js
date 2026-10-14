// Developer portal login (Supabase Auth). The publishable (anon) key is meant to be
// public - it ships to the browser in every Supabase app. Never put the service_role key here.
//
// supabaseUrl must be the SAME Supabase project the API's SUPABASE_URL secret points to,
// because the API verifies login tokens against it.
window.CHAKUDYA_AUTH = {
  supabaseUrl: "https://vivjinvanlttossdgiwc.supabase.co",
  supabaseAnonKey: "sb_publishable_LosrwYza1bjlBK5d_NwZBA_wBGOTf-v",
  googleEnabled: true, // Google provider is enabled in Supabase
};

// API access for the docs site itself (live stats, food demo, NutriMind, Try It without a key).
// gatewayUrl is the chakudya-gateway Worker. Site traffic goes to <gatewayUrl>/p/<api path>; the
// Worker attaches the site's consumer key server-side, so NO key ships to the browser.
// Try It with a visitor's own key still calls baseUrl directly.
// siteKey is the older browser-side fallback, only used when gatewayUrl is empty. Leave it empty.
window.CHAKUDYA_API = {
  baseUrl: "https://chakudya-api.edisontaimu9.workers.dev",
  gatewayUrl: "https://chakudya-gateway.edisontaimu9.workers.dev",
  siteKey: "",
};
