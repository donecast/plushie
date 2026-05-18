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
    const { data, error } = await sb
      .from('profiles')
      .select('id, username')
      .eq('id', session.user.id)
      .maybeSingle();
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
      window.currentUser = { id: session.user.id, email: session.user.email, username: profile.username };
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

  // Login form: send magic link
  document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await auth.sendMagicLink(email);
      document.getElementById('auth-sent-email').textContent = email;
      show('sent');
    } catch (err) {
      alert('Couldn’t send link: ' + (err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = 'Send magic link';
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
