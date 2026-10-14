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

// API access for the docs site itself (live stats, food demo, NutriMind, Try It).
// siteKey is a consumer key created for this site in the Developer Console. It ships to the
// browser, so treat it as public: give it its own label ("Chakudya docs site"), never reuse it
// elsewhere, and revoke it if it is abused. It is only sent to baseUrl's origin.
// Leave it empty to call the API without a key (works while the API is not in key-required mode).
window.CHAKUDYA_API = {
  baseUrl: "https://chakudya-api.edisontaimu9.workers.dev",
  siteKey: "cnr_PASTE_KEY",
};
