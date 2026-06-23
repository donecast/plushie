// Dev-only sign-in bypass — LOCAL MACHINE ONLY. DO NOT COMMIT REAL CREDS.
//
// Copy this file to `config.dev.js` (which is git-ignored) and fill in a
// dev account's email + password. When the app runs on a dev host
// (localhost / 127.0.0.1 / *.local / a LAN IP / file://), auth.js loads
// this file and signs you in automatically with a real Supabase session —
// no magic-link email needed. See isDevHost() / tryDevAutoLogin() in auth.js.
//
// Safety:
//   • config.dev.js is git-ignored, so it never ships to plushcrypt.com
//     and is never bundled into the Capacitor app → the bypass is inert
//     anywhere but your dev machine.
//   • It performs a normal password sign-in, so the account must have a
//     password set (Supabase dashboard → Authentication → Users → the
//     user → "Reset/Set password", or have an admin run an auth update).
//   • To test the real email gate locally, append ?prodauth to the URL or
//     set window.FORCE_PROD_AUTH = true.
//
// Alternatively to this file you can set it from the dev console once:
//   localStorage.setItem('dev_login', JSON.stringify({ email: '…', password: '…' }))

window.DEV_LOGIN = {
  email: 'you@example.com',
  password: 'your-dev-password',
};
