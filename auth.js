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
      .select('id, username, is_admin, photo_uploads_enabled')
      .eq('id', session.user.id)
      .maybeSingle();
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
      if (!session) { show('login'); return; }
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

      window.currentUser = {
        id: session.user.id,
        email: session.user.email,
        username: profile.username,
        isAdmin: !!profile.is_admin,
        // Pictures off by default: a user is "cleared for images" only
        // when photo_uploads_enabled is explicitly true. Admins get
        // access via the override in data.featureEnabled().
        photoUploadsEnabled: profile.photo_uploads_enabled === true,
      };
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

  await evaluate();
}

function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  if (!badge) return;
  if (window.currentUser?.username) {
    badge.classList.remove('hidden');
    badge.querySelector('.user-name').textContent = '@' + window.currentUser.username;
  } else {
    badge.classList.add('hidden');
  }
}

async function handleSignOut() {
  if (!confirm('Sign out?')) return;
  await auth.signOut();
  location.reload();
}

window.runAuthGate = runAuthGate;
window.handleSignOut = handleSignOut;
