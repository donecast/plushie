// Auth + profile glue around supabase-js.
// Loaded after the supabase-js UMD bundle, which exposes a global `supabase`
// object with createClient. We immediately build a client and stash it on
// window so the rest of the app can grab it.

const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
window.sb = sb;

const auth = {
  client: sb,

  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async sendMagicLink(email) {
    const redirect = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect },
    });
    if (error) throw error;
  },

  // Verify the 6-digit code from the same sign-in email. This is the escape
  // hatch for installed (Home Screen) PWAs and in-app browsers: tapping the
  // magic link opens a SEPARATE browser context, so the session never lands
  // back in the app and the user is stuck in a re-request loop. Typing the
  // code signs in directly in THIS context. Needs the Supabase "Magic Link"
  // email template to include the code token ({{ .Token }}).
  async verifyEmailCode(email, token) {
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  },

  async signOut() {
    await sb.auth.signOut();
  },

  async getProfile() {
    const session = await auth.getSession();
    if (!session) return null;
    // First try the full column set. If a newer column hasn't been
    // migrated yet, fall back progressively so a fresh install can
    // still sign in before all migrations have been applied.
    let { data, error } = await sb
      .from('profiles')
      .select('id, username, is_admin, is_moderator, photo_uploads_enabled, custom_clothing_enabled, app_blocked, ghosted')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error && /column.*is_moderator/i.test(error.message || '')) {
      console.warn('[auth] profiles.is_moderator missing; run migration 0066');
      ({ data, error } = await sb
        .from('profiles')
        .select('id, username, is_admin, photo_uploads_enabled, custom_clothing_enabled, app_blocked, ghosted')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (error && /column.*(app_blocked|ghosted)/i.test(error.message || '')) {
      console.warn('[auth] profiles.app_blocked/ghosted missing; run migration 0046');
      ({ data, error } = await sb
        .from('profiles')
        .select('id, username, is_admin, photo_uploads_enabled, custom_clothing_enabled')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (error && /column.*custom_clothing_enabled/i.test(error.message || '')) {
      console.warn('[auth] profiles.custom_clothing_enabled missing; run migration 0026');
      ({ data, error } = await sb
        .from('profiles')
        .select('id, username, is_admin, photo_uploads_enabled')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (error && /column.*photo_uploads_enabled/i.test(error.message || '')) {
      console.warn('[auth] profiles.photo_uploads_enabled missing; run migration 0019');
      ({ data, error } = await sb
        .from('profiles')
        .select('id, username, is_admin')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (error && /column.*is_admin/i.test(error.message || '')) {
      console.warn('[auth] profiles.is_admin missing; run migration 0005');
      ({ data, error } = await sb
        .from('profiles')
        .select('id, username')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (error) throw error;
    return data;
  },

  async createProfile(username) {
    const session = await auth.getSession();
    if (!session) throw new Error('not_authenticated');
    const { error } = await sb
      .from('profiles')
      .insert({ id: session.user.id, username });
    if (error) throw error;
  },

  // Returns the latest consent_log row for the current user, or null if
  // they've never accepted any version. Used by the gate to decide whether
  // to silently write a row (first sign-in) or surface a re-accept screen
  // (existing user, version bumped).
  async getLatestConsent() {
    const session = await auth.getSession();
    if (!session) return null;
    const { data, error } = await sb
      .from('consent_log')
      .select('terms_version, accepted_at')
      .eq('user_id', session.user.id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async recordConsent(version) {
    const session = await auth.getSession();
    if (!session) throw new Error('not_authenticated');
    const { error } = await sb.from('consent_log').insert({
      user_id: session.user.id,
      terms_version: version,
      user_agent: navigator.userAgent.slice(0, 500),
    });
    if (error) throw error;
  },

  onAuthChange(cb) {
    return sb.auth.onAuthStateChange((event, session) => cb(event, session));
  },
};

window.auth = auth;

// ─── Dev sign-in bypass ──────────────────────────────────────────
// A local-only convenience so the sole developer can skip the email
// magic-link round-trip and land straight in the app as themselves.
// Because the app runs on Supabase RLS, a mock user can't read real
// data — so this performs a *real* password sign-in. It is hard-gated
// to dev hosts AND requires credentials that only exist on the dev
// machine (config.dev.js / localStorage), so it cannot activate on
// plushcrypt.com or inside the Capacitor build (config.dev.js is
// git-ignored and never bundled). See config.dev.example.js.
function isDevHost() {
  // Escape hatch to exercise the real gate locally: ?prodauth in the URL
  // or window.FORCE_PROD_AUTH = true.
  if (window.FORCE_PROD_AUTH || /[?&]prodauth\b/.test(location.search)) return false;
  // Never in the native shell, even though it serves from localhost.
  if (location.protocol === 'capacitor:' || window.Capacitor) return false;
  if (location.protocol === 'file:') return true;
  const h = location.hostname;
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(h)) return true;
  if (/\.local$/i.test(h)) return true;                       // mDNS hostnames
  // Private LAN ranges (testing from a phone on the same network).
  if (/^192\.168\./.test(h) || /^10\./.test(h)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// Pull dev credentials from config.dev.js (window.DEV_LOGIN) or, as a
// fallback, a remembered localStorage entry. Returns null when neither
// is set — in which case the dev bypass simply does nothing.
function devCredentials() {
  const fromFile = window.DEV_LOGIN;
  if (fromFile && fromFile.email && fromFile.password) return fromFile;
  try {
    const raw = localStorage.getItem('dev_login');
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.email && o.password) return o;
    }
  } catch { /* ignore malformed entry */ }
  return null;
}

// On a dev host, inject config.dev.js once so window.DEV_LOGIN is set
// before the gate evaluates. Resolves even when the file is absent (the
// common case in production, where this function never runs anyway).
let _devConfigLoaded = false;
async function maybeLoadDevConfig() {
  if (_devConfigLoaded || !isDevHost() || window.DEV_LOGIN) return;
  _devConfigLoaded = true;
  await new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = './config.dev.js';
    s.onload = resolve;
    s.onerror = () => resolve();   // no dev config present — that's fine
    document.head.appendChild(s);
  });
}

let _devLoginAttempted = false;
async function tryDevAutoLogin() {
  if (_devLoginAttempted || !isDevHost()) return false;
  const creds = devCredentials();
  if (!creds) return false;
  _devLoginAttempted = true;        // only ever try once per page load
  const { error } = await sb.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) {
    console.warn('[dev] auto sign-in failed:', error.message,
      '\n[dev] Check email/password in config.dev.js (see config.dev.example.js).');
    return false;
  }
  console.info('[dev] signed in as', creds.email);
  return true;   // onAuthStateChange(SIGNED_IN) re-runs the gate evaluate()
}

window.isDevHost = isDevHost;

// ─── Gate UI ─────────────────────────────────────────────────────
// Shows the auth overlay until we have both a session and a profile,
// then starts the app. Called from app.js boot.
async function runAuthGate(onReady) {
  const overlay = document.getElementById('auth-overlay');
  const steps = {
    loading:  overlay.querySelector('[data-step="loading"]'),
    login:    overlay.querySelector('[data-step="login"]'),
    sent:     overlay.querySelector('[data-step="sent"]'),
    username: overlay.querySelector('[data-step="username"]'),
    name:     overlay.querySelector('[data-step="name"]'),
    consent:  overlay.querySelector('[data-step="consent"]'),
  };

  function show(step) {
    overlay.classList.remove('hidden');
    document.body.classList.add('locked');
    Object.entries(steps).forEach(([k, el]) => el.classList.toggle('hidden', k !== step));
  }
  function hide() {
    overlay.classList.add('hidden');
    document.body.classList.remove('locked');
  }

  async function evaluate() {
    show('loading');
    try {
      const session = await auth.getSession();
      if (!session) {
        // Dev-only: try the password bypass before falling back to the
        // email gate. On success the SIGNED_IN event re-runs evaluate().
        if (isDevHost() && devCredentials() && await tryDevAutoLogin()) return;
        show('login'); return;
      }
      const profile = await auth.getProfile();
      if (!profile) { show('username'); return; }

      // Consent gate. New users get a row written silently (they ticked the
      // sign-in checkbox to get here); existing users whose last accepted
      // version is older than TERMS_VERSION must re-accept before the app
      // unlocks.
      const latest = await auth.getLatestConsent();
      const currentVersion = window.TERMS_VERSION;
      if (!latest) {
        await auth.recordConsent(currentVersion);
      } else if (latest.terms_version !== currentVersion) {
        show('consent'); return;
      }

      // Demo mode (a per-device recording aid, see data.isDemoMode) makes
      // an insider account present as an ordinary collector: admin powers
      // and gated grants are suppressed in the UI so screen recordings only
      // show publicly-available features. This is client-side presentation
      // only — the server still enforces the real RLS — and it touches no
      // stored state, so flipping it off restores everything on next boot.
      const realIsAdmin = !!profile.is_admin;
      const realIsModerator = !!profile.is_moderator;
      const uname = (profile.username || '').toLowerCase();
      const realInsider = realIsAdmin ||
        (window.data?.ALWAYS_GRANTED_USERNAMES || []).includes(uname);
      const demo = window.data?.isDemoMode?.() === true;

      window.currentUser = {
        id: session.user.id,
        email: session.user.email,
        username: profile.username,
        isAdmin: demo ? false : realIsAdmin,
        // Moderator role (db/0066). Can delete any post/comment and work the
        // reports queue, but is NOT a full admin. canModerate is the single
        // client gate for those powers (admins moderate too). Demo-suppressed
        // like isAdmin so the demo view stays a plain member.
        isModerator: demo ? false : realIsModerator,
        canModerate: demo ? false : (realIsAdmin || realIsModerator),
        // Pictures off by default: a user is "cleared for images" only
        // when photo_uploads_enabled is explicitly true. Admins get
        // access via the override in data.featureEnabled().
        photoUploadsEnabled: demo ? false : (profile.photo_uploads_enabled === true),
        // Off by default; admins + a small allowlist override in
        // data.featureEnabled(). Gates the "add your own clothing" closet.
        customClothingEnabled: demo ? false : (profile.custom_clothing_enabled === true),
        // Real insider status, kept regardless of demo mode so the demo
        // toggle in Settings stays visible (and can be switched back off).
        demoEligible: realInsider,
        // Admin moderation (db/0046). app_blocked → full boot takeover;
        // ghosted → can use the app but is isolated from everyone else.
        // Not demo-suppressed: admins are never blockable, so demo presenting
        // doesn't apply, and a ghost should stay a ghost in any mode.
        appBlocked: profile.app_blocked === true,
        ghosted: profile.ghosted === true,
      };

      // Real-name gate (see db/0045). A first name is required for everyone
      // — trade safety and moderation. New and existing users without one
      // must provide it before the app unlocks. A last initial is enough
      // here; a full last name is only required to list items for trade.
      const names = await data.getMyNameFields();
      if (!names || !String(names.first_name || '').trim()) { show('name'); return; }

      updateUserBadge();
      hide();
      onReady();
    } catch (err) {
      console.error('auth gate', err);
      show('login');
      const msg = document.getElementById('auth-error');
      if (msg) { msg.textContent = err.message || 'Something went wrong.'; msg.classList.remove('hidden'); }
    }
  }

  // Login form: send magic link. The submit button stays disabled until both
  // the email field is non-empty and the Terms/Privacy checkbox is ticked.
  let sentEmail = '';   // remembered for the code-verify step on the 'sent' screen
  const submitBtn = document.getElementById('auth-submit');
  const emailInput = document.getElementById('auth-email');
  const agreeBox = document.getElementById('auth-agree');
  const refreshSubmit = () => {
    submitBtn.disabled = !(emailInput.value.trim() && agreeBox.checked);
  };
  emailInput.addEventListener('input', refreshSubmit);
  agreeBox.addEventListener('change', refreshSubmit);

  document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !agreeBox.checked) return;
    submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
    try {
      await auth.sendMagicLink(email);
      sentEmail = email;
      document.getElementById('auth-sent-email').textContent = email;
      show('sent');
    } catch (err) {
      alert('Couldn’t send link: ' + (err.message || err));
    } finally {
      submitBtn.textContent = 'Send magic link';
      refreshSubmit();
    }
  });

  document.getElementById('auth-back').addEventListener('click', () => show('login'));

  // Code-verify form (the 'sent' screen): the PWA / in-app-browser escape
  // hatch. Verifies the 6-digit code straight into THIS context, so an
  // installed Home Screen app signs in without the link bouncing elsewhere.
  // On success the SIGNED_IN event re-runs evaluate() and unlocks the app.
  const codeForm = document.getElementById('auth-code-form');
  if (codeForm) {
    const codeInput = document.getElementById('auth-code');
    const codeErr = document.getElementById('auth-code-error');
    codeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = (codeInput.value || '').trim();
      codeErr.classList.add('hidden');
      if (!/^\d{6}$/.test(token)) {
        codeErr.textContent = 'Enter the 6-digit code from the email.';
        codeErr.classList.remove('hidden');
        return;
      }
      const btn = codeForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        await auth.verifyEmailCode(sentEmail, token);
        // SIGNED_IN fires → evaluate() releases the gate.
      } catch (err) {
        codeErr.textContent = /expired|invalid|token|otp/i.test(err.message || '')
          ? 'That code is wrong or expired. Check the latest email.'
          : (err.message || 'Couldn’t verify that code.');
        codeErr.classList.remove('hidden');
      } finally {
        btn.disabled = false; btn.textContent = 'Verify code';
      }
    });
  }

  // Username form
  document.getElementById('auth-username-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const errEl = document.getElementById('auth-username-error');
    errEl.classList.add('hidden');
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      errEl.textContent = 'Use 3–20 letters, numbers, _ or -.';
      errEl.classList.remove('hidden');
      return;
    }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await auth.createProfile(username);
      await evaluate();
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        errEl.textContent = 'That username is taken.';
      } else if (msg.includes('username_format')) {
        errEl.textContent = 'Invalid characters.';
      } else {
        errEl.textContent = msg || 'Couldn’t save username.';
      }
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Continue';
    }
  });

  // Name form: first name required, last name optional here (an initial is
  // fine). On success re-evaluate to release the gate.
  document.getElementById('auth-name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const first = document.getElementById('auth-first-name').value.trim();
    const last  = document.getElementById('auth-last-name').value.trim();
    const errEl = document.getElementById('auth-name-error');
    errEl.classList.add('hidden');
    if (!first) {
      errEl.textContent = 'Please enter your first name.';
      errEl.classList.remove('hidden');
      return;
    }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await data.setMyName({ firstName: first, lastName: last });
      await evaluate();
    } catch (err) {
      errEl.textContent = err.message || 'Couldn’t save your name.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Continue';
    }
  });

  // Re-consent step (existing users when TERMS_VERSION bumps). Writes a new
  // consent_log row, then re-evaluates the gate to release the app.
  document.getElementById('auth-consent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('auth-consent-agree');
    if (!box.checked) return;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await auth.recordConsent(window.TERMS_VERSION);
      await evaluate();
    } catch (err) {
      alert('Couldn’t save your acceptance: ' + (err.message || err));
      btn.disabled = false; btn.textContent = 'Accept and continue';
    }
  });
  document.getElementById('auth-consent-agree').addEventListener('change', (e) => {
    document.getElementById('auth-consent-submit').disabled = !e.target.checked;
  });

  auth.onAuthChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      evaluate();
    }
  });

  // On a dev host, pull in config.dev.js (if present) before the first
  // evaluate so the password bypass can fire. No-op everywhere else.
  await maybeLoadDevConfig();
  await evaluate();
}

function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  if (!badge) return;
  const coven = document.getElementById('coven-btn');
  if (window.currentUser?.username) {
    badge.classList.remove('hidden');
    badge.querySelector('.user-name').textContent = '@' + window.currentUser.username;
    if (coven) coven.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    if (coven) coven.classList.add('hidden');
  }
}

async function handleSignOut() {
  if (!confirm('Sign out?')) return;
  await auth.signOut();
  location.reload();
}

window.runAuthGate = runAuthGate;
window.handleSignOut = handleSignOut;
