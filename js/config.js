// Developer portal login (Supabase Auth). The publishable (anon) key is meant to be
// public - it ships to the browser in every Supabase app. Never put the service_role key here.
//
// supabaseUrl must be the SAME Supabase project the API's SUPABASE_URL secret points to,
// because the API verifies login tokens against it.
window.CHAKUDYA_AUTH = {
  supabaseUrl: "https://vivjinvanlttossdgiwc.supabase.co",
  supabaseAnonKey: "PASTE_PUBLISHABLE_KEY_HERE",
  googleEnabled: false, // set true after enabling the Google provider in Supabase
};
