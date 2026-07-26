// ════════════════════════════════════════════════════════════════════
// app-social.js — part 9 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Service worker reg, boot, the social tab, reporting, and app bootstrap.
// ════════════════════════════════════════════════════════════════════

// ─── Service worker ──────────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const go = () => navigator.serviceWorker.register('./sw.js').then((reg) => {
    // A resumed installed PWA never re-navigates, so it can sit on a stale
    // bundle across deploys indefinitely — new features silently invisible
    // until the user happens to fully relaunch. Check for a new SW whenever
    // the app returns to the foreground; the browser no-ops when sw.js is
    // unchanged, so this costs nothing between deploys.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg?.update?.().catch(() => {});
    });
  }).catch((e) => console.warn('SW failed', e));
  // registerSW() runs from boot(), which lands AFTER the window 'load' event
  // on all but the slowest visits — and a 'load' listener added after the
  // event has fired never runs. That silently skipped SW registration for
  // whole sessions (and left navigator.serviceWorker.ready hanging forever,
  // which is how push subscriptions never got stored — the 0-rows mystery).
  // Register immediately when load already happened; only defer when we
  // genuinely beat it.
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });

  // The new SW takes control immediately (skipWaiting + clients.claim in
  // sw.js), so a controller change on an already-controlled page means a
  // deploy landed while this session was open. Offer a one-tap refresh
  // instead of letting the old bundle keep running. The first claim on a
  // previously-uncontrolled page (initial install) is not an update — skip it.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener?.('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    showUpdateBanner();
  });
}

// Fixed "✨ updated — refresh" banner. Deliberately NOT an auto-reload: the
// user may be mid-post/comment/trade-note and a forced reload would eat it.
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const el = document.createElement('div');
  el.id = 'update-banner';
  el.className = 'update-banner';
  const label = document.createElement('span');
  label.textContent = '✨ Update ready';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Refresh';
  btn.addEventListener('click', () => location.reload());
  el.append(label, btn);
  document.body.appendChild(el);
}

// ─── Boot ────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
// Social tab — friends (Coven), Castle Crew, posts, likes, comments,
// Top 8, profiles. Early-Facebook-meets-MySpace, account required.
// ════════════════════════════════════════════════════════════════════

// Drop posts authored by anyone you're blocked-with, and scrub blocked
// authors out of the comment threads (incl. nested replies). Posts are
// already gated server-side by can_see_post, but a blocked user can still
// comment on a third party's public post — this hides those too.
function pruneBlockedComments(comments) {
  if (!comments) return comments;
  return comments
    .filter((c) => !data.isBlocked(c.authorId))
    .map((c) => ({ ...c, replies: pruneBlockedComments(c.replies) }));
}
function stripBlocked(feed) {
  return (feed || [])
    .filter((p) => !data.isBlocked(p.authorId))
    .map((p) => ({ ...p, comments: pruneBlockedComments(p.comments) }));
}

async function loadSocialData() {
  try {
    const [feed, friends, requests, , myBlocks, gifts] = await Promise.all([
      data.listFeed(),
      data.listFriends(),
      data.listIncomingRequests(),
      data.loadBlockedIds().catch(() => null),   // who I'm blocked-with (union)
      data.listMyBlocks().catch(() => []),         // who I blocked (for the manager)
      data.listMyGifts().catch(() => []),          // pending gifts, both directions (db/0096)
    ]);
    state.socFeed = stripBlocked(feed);
    state.socFriends = friends;
    state.myBlocks = myBlocks || [];
    state.socRequests = requests;
    state.socPendingCount = requests.length;
    state.gifts = gifts || [];
    maybeFireFriendNotifications().catch((e) => console.warn(e));
    // DM threads ride along (best-effort — a miss shouldn't sink the feed)
    // so the 💬 badge is right from first paint.
    loadDmThreads().catch((e) => console.warn('dm threads', e));
  } catch (e) {
    console.error('loadSocialData', e);
    toast('Could not load the crypt social feed.');
  } finally {
    // Attempted — a genuinely quiet feed should show its real empty-state.
    state.ready.add('social');
  }
}

// Lightweight badge refresh (no feed fetch) — used at boot so the red
// pip shows pending friend requests even before the user opens Social.
async function refreshSocialBadge() {
  try {
    // Load the full request list (not just a count) so the badge stays
    // fresh AND the notifier has usernames to announce.
    const requests = await data.listIncomingRequests();
    state.socRequests = requests;
    state.socPendingCount = requests.length;
    updateSocialBadge();
    maybeFireFriendNotifications().catch((e) => console.warn(e));
  } catch (e) { console.warn('social badge', e); }
  try {
    // 💬 unread pip rides the same poll. Announce genuinely-new arrivals
    // locally (push covers the closed-app case; this covers app-open).
    const prevUnread = state.dmUnread || 0;
    state.dmUnread = await data.dmUnreadCount();
    updateDmBadge();
    if (state.dmUnread > prevUnread) {
      maybeFireDmNotification(state.dmUnread).catch((e) => console.warn(e));
    }
  } catch (e) { console.warn('dm badge', e); }
  try {
    // Pending gifts ride the same poll so an incoming gift's Accept/Decline
    // tray (top of My Crypt) appears while the app is open, not just on a cold
    // open. Only repaint when something actually changed, to avoid fighting scroll.
    const prevSig = (state.gifts || []).map((g) => `${g.id}:${g.status}`).join(',');
    await refreshGifts();
    const nextSig = (state.gifts || []).map((g) => `${g.id}:${g.status}`).join(',');
    if (nextSig !== prevSig) render();
  } catch (e) { console.warn('gift poll', e); }
  // Drain the server-side notification queue (db/0085): locally fire
  // anything real push didn't deliver — posts, replies, mentions, feedback,
  // approvals. The uniform fallback; see maybeFireQueuedNotifications.
  maybeFireQueuedNotifications().catch((e) => console.warn(e));
  // …and keep the 🔔 inbox badge current on the same cadence.
  refreshNotifBell().catch((e) => console.warn('notif bell', e));
}

// Poll for new friend requests every few minutes while the app is open
// so the badge + notification land without needing to open the tab.
function scheduleSocialCheck() {
  if (window._socialTimer) clearInterval(window._socialTimer);
  window._socialTimer = setInterval(() => { refreshSocialBadge(); }, 5 * 60 * 1000);
}

function updateSocialBadge() {
  const n = state.socPendingCount || 0;
  for (const id of ['coven-badge', 'soc-friends-badge', 'bn-coven-badge']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }
}

function setSocSubTab(name) {
  state.socSubTab = name;
  renderSocial();
}

// ─── Small presentational helpers ───────────────────────────────────
function socTimeAgo(ts) {
  const d = typeof ts === 'number' ? ts : +new Date(ts);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24); if (day < 7) return `${day}d ago`;
  return new Date(d).toLocaleDateString();
}

function socAvatar(url, name, cls = '') {
  const initial = escapeHtml((name || '?').slice(0, 1).toUpperCase());
  if (url) return `<span class="soc-avatar ${cls}"><img src="${escapeHtml(url)}" loading="lazy" alt="" /></span>`;
  return `<span class="soc-avatar soc-avatar-fallback ${cls}">${initial}</span>`;
}

function visBadge(vis) {
  const m = VIS_META[vis] || VIS_META.friends;
  return `<span class="soc-vis-badge" title="${escapeHtml(m.hint)}">${m.glyph} ${escapeHtml(m.label)}</span>`;
}

// Render a profile's linked social accounts as tappable chips. Handles are
// stored bare; we derive the full URL per platform here (item 1).
function renderSocialLinks(links) {
  if (!links || typeof links !== 'object') return '';
  const chips = SOCIAL_PLATFORMS
    .filter((p) => links[p.key])
    .map((p) => {
      const handle = links[p.key];
      return `<a class="soc-link-chip" href="${escapeHtml(p.url(encodeURIComponent(handle)))}"
                 target="_blank" rel="noopener noreferrer nofollow" title="${escapeHtml(p.label)}: ${escapeHtml(handle)}">
                <span class="soc-link-glyph">${p.glyph}</span><span class="soc-link-handle">${escapeHtml(p.label)}</span>
              </a>`;
    });
  return chips.length ? `<div class="soc-links">${chips.join('')}</div>` : '';
}

// ─── Invite / share the app (item: growth) ──────────────────────────
// Uses the native share sheet when available (mobile browsers today; a
// Capacitor Share plugin later slots in behind the same call), falling back
// to copying an invite to the clipboard. Points at the public site, NOT
// location.origin — inside a native webview that is capacitor://localhost,
// which is useless to hand to a friend.
const PLUSHCRYPT_SHARE_URL = 'https://plushcrypt.com';
async function shareApp() {
  const url = PLUSHCRYPT_SHARE_URL;
  const text = 'Come track your Plushie Dreadfuls collection with me on The Plush Crypt 🦇';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'The Plush Crypt', text, url });
      return;
    } catch (e) {
      // Sheet dismissed — done. Any other failure falls through to copy.
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Invite copied — paste it anywhere to spread the word! 🦇');
  } catch (e) {
    toast(`Share unavailable — visit ${url}`);
  }
}

// ─── Top-level social render dispatch ───────────────────────────────
// A profile overlay (state.socProfile) takes over the feed subview; the
// sub-tabs otherwise map 1:1 to the three subviews. All visibility is
// decided here so callers just set state and re-render.
function renderSocial() {
  const onProfile = !!state.socProfile;
  const showFeed = onProfile || state.socSubTab === 'feed';
  document.getElementById('soc-feed').classList.toggle('hidden', !showFeed);
  document.getElementById('soc-friends').classList.toggle('hidden', onProfile || state.socSubTab !== 'friends');
  document.getElementById('soc-me').classList.toggle('hidden', onProfile || state.socSubTab !== 'me');
  document.getElementById('soc-messages')?.classList.toggle('hidden', onProfile || state.socSubTab !== 'messages');
  document.querySelectorAll('#social-view .subtab').forEach((s) =>
    s.classList.toggle('active', !onProfile && s.dataset.socSubtab === state.socSubTab));

  if (onProfile) {
    renderProfileInto(document.getElementById('soc-feed'), { ...state.socProfile, withBack: true });
    return;
  }
  if (state.socSubTab === 'feed') renderFeed();
  else if (state.socSubTab === 'friends') renderFriends();
  else if (state.socSubTab === 'me') renderMyProfileTab();
  else if (state.socSubTab === 'messages') renderMessages();
}

// ─── Private messages (db/0083) ─────────────────────────────────────
// Facebook-Messenger shape: the 💬 header icon opens a thread list (one row
// per conversation partner, latest line + unread pip); tapping a thread —
// or "💬 Message" on a friend row / profile — opens the conversation with a
// bubble timeline and a composer. Friends-only; the DB enforces that (plus
// blocks and the ghost illusion), the client just surfaces the affordances.

function renderMessages() {
  const el = document.getElementById('soc-messages');
  if (!el) return;
  el.innerHTML = state.dmPartner ? dmConversationHtml() : dmThreadListHtml();
  if (state.dmPartner) {
    // Land scrolled to the newest message, and keep the composer handy.
    const list = document.getElementById('dm-msg-list');
    if (list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  ensureDmPoll();
}

function dmThreadListHtml() {
  const threads = state.dmThreads;
  const rows = threads.map((t) => `
    <button class="dm-thread-row ${t.unread ? 'dm-unread' : ''}" data-soc-action="open-dm"
            data-uid="${t.partnerId}" data-name="${escapeHtml(t.username)}">
      ${socAvatar(t.avatarUrl, t.username)}
      <span class="dm-thread-main">
        <span class="dm-thread-name">@${escapeHtml(t.username)}</span>
        <span class="dm-thread-preview">${t.lastFromMe ? 'You: ' : ''}${escapeHtml(t.lastBody)}</span>
      </span>
      <span class="dm-thread-meta">
        <span class="dm-thread-time">${escapeHtml(socTimeAgo(t.lastAt))}</span>
        ${t.unread ? `<span class="tab-badge dm-thread-badge">${t.unread}</span>` : ''}
      </span>
    </button>`).join('');
  return `
    <section class="soc-section">
      <h2 class="soc-section-head">💬 Messages</h2>
      ${threads.length ? `<div class="dm-thread-list">${rows}</div>`
        : `<p class="empty-note">No messages yet. Find a friend in your
             <button class="linklike" data-soc-action="go-friends">Coven</button>
             and hit 💬 Message to start a conversation.</p>`}
    </section>`;
}

function dmConversationHtml() {
  const p = state.dmPartner;
  const msgs = state.dmMessages;
  let lastDay = '';
  const bubbles = msgs.map((m) => {
    // A quiet day separator whenever the calendar date changes.
    const day = new Date(m.createdAt).toDateString();
    const sep = day !== lastDay ? `<div class="dm-day-sep">${escapeHtml(formatDate(m.createdAt))}</div>` : '';
    lastDay = day;
    return `${sep}
      <div class="dm-bubble-row ${m.mine ? 'dm-mine' : 'dm-theirs'}">
        <div class="dm-bubble">${linkifyMentions(m.body)}</div>
        <span class="dm-bubble-time">${escapeHtml(socTimeAgo(m.createdAt))}</span>
      </div>`;
  }).join('');
  return `
    <section class="soc-section dm-conversation">
      <header class="dm-convo-head">
        <button class="linklike soc-back" data-soc-action="dm-back">← Messages</button>
        <button class="soc-userlink" data-soc-action="view-profile" data-uid="${p.id}">
          ${socAvatar(p.avatarUrl, p.username)} <span>@${escapeHtml(p.username)}</span>
        </button>
      </header>
      <div id="dm-msg-list" class="dm-msg-list">
        ${msgs.length ? bubbles : '<p class="empty-note">No messages yet — say hi 🦇</p>'}
      </div>
      <form class="soc-comment-form dm-compose" data-soc-action="submit-dm">
        <input type="text" id="dm-input" class="soc-comment-input" maxlength="2000"
               placeholder="Message @${escapeHtml(p.username)}…" autocomplete="off" />
        <button class="btn-primary" type="submit">Send</button>
      </form>
    </section>`;
}

async function loadDmThreads() {
  state.dmThreads = await data.listDmThreads();
  state.dmUnread = state.dmThreads.reduce((n, t) => n + t.unread, 0);
  updateDmBadge();
}

// Open a conversation (from a thread row, a friend row, or a profile).
async function openDm(uid, username) {
  state.tab = 'home';
  state.socProfile = null;
  state.socSubTab = 'messages';
  // Avatar from whatever list we already have; the thread list refresh fills it in.
  const known = state.dmThreads.find((t) => t.partnerId === uid)
    || state.socFriends.find((f) => f.userId === uid);
  state.dmPartner = { id: uid, username, avatarUrl: known?.avatarUrl ?? known?.avatarURL ?? null };
  try {
    state.dmMessages = await data.listDmMessages(uid);
    await data.markDmRead(uid);
    await loadDmThreads();          // clears this thread's unread from the badge
  } catch (e) {
    console.error('openDm', e);
    toast('Could not load the conversation.');
  }
  render();
}

function closeDm() {
  state.dmPartner = null;
  state.dmMessages = [];
  renderMessages();
}

async function submitDmForm(form) {
  const input = form.querySelector('#dm-input');
  const body = (input?.value || '').trim();
  const p = state.dmPartner;
  if (!body || !p) return;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const row = await data.sendDm(p.id, body);
    state.dmMessages.push({ id: row.id, mine: true, body, createdAt: row.created_at, readAt: null });
    input.value = '';
    renderMessages();
    document.getElementById('dm-input')?.focus();
    loadDmThreads().catch(() => {});
  } catch (e) {
    console.error('sendDm', e);
    // The DB refuses non-friends and blocked pairs (RLS) — say so plainly.
    toast(/row-level security|violates/i.test(e?.message || '')
      ? 'You can only message friends in your Coven.'
      : 'Could not send — try again.');
  } finally {
    btn.disabled = false;
  }
}

// While a conversation is open, poll for the other side's replies. The timer
// self-heals: it clears itself the moment the user is anywhere else, so tab
// hops can't leak intervals.
// Refresh whatever messages surface is on screen (open conversation or the
// thread list). Called by the 8s in-view poll AND by the realtime stream so
// an incoming message lands on screen the moment it exists.
async function refreshDmView() {
  const viewing = state.tab === 'home' && state.socSubTab === 'messages' && !state.socProfile;
  if (!viewing) return;
  try {
    if (state.dmPartner) {
      const fresh = await data.listDmMessages(state.dmPartner.id);
      if (fresh.length !== state.dmMessages.length) {
        const hadNew = fresh.length > state.dmMessages.length && fresh.some((m) => !m.mine);
        state.dmMessages = fresh;
        if (hadNew) await data.markDmRead(state.dmPartner.id);
        renderMessages();
      }
    } else {
      await loadDmThreads();
      renderMessages();
    }
  } catch (e) { console.warn('dm refresh', e); }
}

function ensureDmPoll() {
  const viewing = state.tab === 'home' && state.socSubTab === 'messages' && !state.socProfile;
  if (!viewing) { clearInterval(window._dmTimer); window._dmTimer = null; return; }
  if (window._dmTimer) return;
  window._dmTimer = setInterval(async () => {
    const stillViewing = state.tab === 'home' && state.socSubTab === 'messages' && !state.socProfile;
    if (!stillViewing) { clearInterval(window._dmTimer); window._dmTimer = null; return; }
    await refreshDmView();
  }, 8000);
}

// ─── Realtime notification stream (db/0087) ──────────────────────────
// Every notifiable event queues a `notifications` row (db/0085); the table
// is published on the Supabase Realtime websocket, so we hear about our own
// rows the instant they're written (RLS scopes the stream to auth.uid()).
// Each event triggers the same refresh the 5-minute poll does — the poll
// stays as the safety net for dropped sockets. A DM event also refreshes
// the open conversation, so chat feels like chat.
function subscribeNotificationStream() {
  const uid = window.currentUser?.id;
  if (!uid || typeof window.sb?.channel !== 'function') return;
  try { window._notifStream?.unsubscribe?.(); } catch (_) { /* stale channel */ }
  try {
    window._notifStream = window.sb
      .channel('notif-stream-' + uid)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          // Debounce bursts (a popular post) into one refresh sweep. The DM
          // flag accumulates across the burst so a mixed burst still
          // refreshes the open conversation.
          if ((payload?.new?.tag || '').startsWith('dm-')) window._notifStreamHasDm = true;
          clearTimeout(window._notifStreamDebounce);
          window._notifStreamDebounce = setTimeout(() => {
            const hadDm = window._notifStreamHasDm;
            window._notifStreamHasDm = false;
            refreshSocialBadge();
            if (hadDm) refreshDmView();
          }, 400);
        })
      .subscribe();
  } catch (e) {
    console.warn('notification stream unavailable — polling covers it', e);
  }
}

function updateDmBadge() {
  const n = state.dmUnread || 0;
  // Header 💬 (desktop) + bottom-nav Messages tab (mobile).
  for (const id of ['dm-badge', 'bn-dm-badge']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }
}

// ─── Feed ───────────────────────────────────────────────────────────
function renderFeed() {
  const el = document.getElementById('soc-feed');
  const composer = `
    <div class="soc-composer">
      <div class="soc-composer-row">
        ${socAvatar(null, window.currentUser.username)}
        <button class="soc-composer-open" data-soc-action="open-compose">
          Share a story about your plushes…
        </button>
      </div>
    </div>`;

  const feed = state.socFeed.filter((p) => !isHiddenPost(p.id));
  const posts = !state.ready.has('social')
    ? loadingPlaceholder('Summoning the crypt…')
    : feed.length
    ? feed.map(renderPostCard).join('')
    : `<p class="empty-note">The crypt is quiet. Make the first post, or
        <button class="linklike" data-soc-action="go-friends">find some friends</button> to follow.</p>`;

  el.innerHTML = composer + `<div class="soc-feed-list">${posts}</div>`;
}

// Facebook-style reaction set for comments — emoji + the name we show on the
// Like link once chosen (item 5). Reactions are mutually exclusive per user
// (picking a new one replaces the old), exactly like Facebook.
const SOC_REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '🖤', label: 'Love' },
  { emoji: '🤗', label: 'Care' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
];
const SOC_REACTION_DEFAULT = '👍';
const SOC_REACTION_LABEL = Object.fromEntries(SOC_REACTIONS.map((r) => [r.emoji, r.label]));

// Relics (db/0088) — participation achievements, never completionism. Keys and
// copy mirror _relic_meta() in the migration; an unknown key (older client vs.
// a newer relic) falls back to the post's plain body text, so nothing breaks.
const RELIC_META = {
  'first-soul':         { emoji: '🕯️', title: 'First Soul',         blurb: 'welcomed their first plush into the crypt', how: 'Add your first plush to your collection.' },
  'first-proclamation': { emoji: '📜', title: 'First Proclamation', blurb: 'made their first post to the crypt',        how: 'Make your first post on the Fellowship feed.' },
  'coven-kin':          { emoji: '🦇', title: 'Coven Kin',          blurb: 'formed their first Coven bond',             how: 'Become friends with another collector — your first accepted friend request.' },
  'first-pact':         { emoji: '🤝', title: 'First Pact',         blurb: 'completed their first trade',               how: 'Complete your first trade with another collector.' },
  'seasoned-trader':    { emoji: '🕸️', title: 'Seasoned Trader',    blurb: 'completed five trades',                     how: 'Complete five trades.' },
  'honest-quill':       { emoji: '🪶', title: 'Honest Quill',       blurb: 'left honest feedback after a trade',        how: 'Leave feedback for your trade partner after a completed trade.' },
  'crypt-chronicler':   { emoji: '📷', title: 'Crypt Chronicler',   blurb: 'had a photo enshrined in the catalog',      how: 'Have one of your plush photos approved into the public catalog.' },
  'year-one':           { emoji: '🕰️', title: 'Year One',           blurb: 'has haunted the crypt for a full year',     how: 'Stick around — awarded when your account turns one year old.' },
};

// Tapping a relic (shelf chip or feed banner) opens it as a big card with a
// plain-English explanation — the hover tooltip alone was invisible on touch.
function openRelicCard(key, earnedAt) {
  const m = RELIC_META[key];
  if (!m) return;
  const when = earnedAt
    ? new Date(earnedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <div class="soc-relic-card">
      <span class="soc-relic-card-emblem">${m.emoji}</span>
      <h2>${escapeHtml(m.title)}</h2>
      <p class="soc-relic-card-how"><strong>How it’s earned:</strong> ${escapeHtml(m.how)}</p>
      ${when ? `<p class="soc-relic-card-when">Unearthed ${escapeHtml(when)}</p>` : ''}
      <p class="soc-relic-card-about">Relics are little keepsakes the Crypt leaves you for taking part. No checklists, no pressure — they find <em>you</em>. 🖤</p>
    </div>`);
}

// The relic shelf shown on profiles (and the My Crypt footer). Earned relics
// only — no grey placeholders, no progress bars: the crypt doesn't do FOMO.
function renderRelicShelf(relics, isMe) {
  const earned = (relics || []).filter((r) => RELIC_META[r.key]);
  if (!earned.length) {
    return isMe
      ? `<p class="empty-note">Relics find you as you take part in crypt life — trading, posting, making friends. No checklists, no pressure. 🖤</p>`
      : '';
  }
  return `<div class="soc-relic-shelf">${earned.map((r) => {
    const m = RELIC_META[r.key];
    const when = new Date(r.earnedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return `<button type="button" class="soc-relic" data-soc-action="view-relic" data-relic-key="${escapeHtml(r.key)}" data-earned-at="${escapeHtml(r.earnedAt || '')}"
      title="${escapeHtml(m.title)} — ${escapeHtml(m.blurb)} (${escapeHtml(when)})">
      <span class="soc-relic-emblem">${m.emoji}</span>
      <span class="soc-relic-name">${escapeHtml(m.title)}</span>
    </button>`;
  }).join('')}</div>`;
}

// Escape text, then linkify @username mentions into tappable chips (item 5).
function linkifyMentions(text) {
  return escapeHtml(text || '').replace(/@([a-zA-Z0-9_-]{3,20})/g,
    (m, name) => `<button class="soc-mention" data-soc-action="view-mention" data-username="${escapeHtml(name)}">@${escapeHtml(name)}</button>`);
}

// Flatten a comment's whole reply subtree into one thread-ordered list, so deep
// reply chains render at a single indent level instead of nesting forever (which
// crushed the bubble into an unreadable sliver on phones).
function flattenReplies(c) {
  const out = [];
  const walk = (list) => {
    for (const r of (list || [])) { out.push(r); walk(r.replies); }
  };
  walk(c.replies);
  return out;
}

// One comment (and its replies). Facebook-style: avatar + a rounded "bubble"
// holding the name and text, with a reaction-summary pill tucked into the
// bubble's corner and a Like · Reply · time action row underneath.
// Nesting is capped at two tiers — a top-level comment plus ONE replies tier.
// A reply to a reply still threads in the data, but visually it joins that same
// tier as its siblings (depth 0 hoists the whole flattened subtree; depth ≥ 1
// renders no children of its own).
// ── comment sub-builders ───────────────────────────────────────────────
// renderComment composes these: the bubble (editing form or text + reactions
// + actions) and the ⋯ kebab menu. Both are pure functions of the comment.

function commentKebabHtml(c) {
  return socKebab(`comment-${c.id}`, [
    c.mine ? socMenuItem('edit-comment', '✎ Edit', `data-comment-id="${c.id}"`) : '',
    c.canDelete ? socMenuItem('delete-comment', `🗑 Delete${(!c.mine && window.currentUser?.canModerate) ? ' (mod)' : ''}`, `data-comment-id="${c.id}"`, true) : '',
    !c.mine ? socMenuItem('hide-comment', '🙈 Hide', `data-comment-id="${c.id}"`) : '',
    !c.mine ? socMenuItem('report-comment', '🚩 Report', `data-comment-id="${c.id}" data-owner="${c.authorId}" data-name="${escapeHtml(c.authorName)}"`) : '',
    (!c.mine && !data.isUnblockable({ username: c.authorName }))
      ? socMenuItem('block-user', `🚫 Block @${escapeHtml(c.authorName)}`, `data-uid="${c.authorId}" data-name="${escapeHtml(c.authorName)}"`, true) : '',
  ]);
}

// 📷 attach control for comment/reply forms (0090). The picked blob lives on
// the form element itself (form._photoBlob, set by the delegated change
// handler) so it survives typing but is naturally dropped on a re-render —
// same lifetime as the unsent text next to it. Hidden when uploads are off.
function commentPhotoPickerHtml() {
  if (!data.featureEnabled('feature.user_photo_uploads')) return '';
  return `<label class="soc-comment-photo-btn" title="Attach a photo">
    <span class="soc-comment-photo-ico">📷</span>
    <input type="file" class="soc-comment-photo-input" accept="image/*" hidden />
  </label>`;
}

function commentBubbleHtml(c, postId) {
  // Editing swaps the bubble for an inline form; otherwise show bubble + actions.
  const editing = state.socEditComment === c.id;
  if (editing) {
    return `<form class="soc-comment-form soc-comment-edit-form" data-soc-action="submit-comment-edit" data-comment-id="${c.id}">
         <input type="text" class="soc-comment-input" maxlength="500" value="${escapeHtml(c.body)}" />
         <button class="btn-primary" type="submit">Save</button>
         <button class="linklike" type="button" data-soc-action="cancel-edit-comment">Cancel</button>
       </form>`;
  }

  // My current reaction (mutually exclusive), the total across everyone, and
  // the distinct emoji to stack on the summary pill (most-used first).
  const myReact = (c.reactions || []).find((r) => r.mine)?.emoji || null;
  const totalReacts = (c.reactions || []).reduce((n, r) => n + r.count, 0);
  const stackEmoji = [...(c.reactions || [])].sort((a, b) => b.count - a.count).slice(0, 3).map((r) => r.emoji);

  const palette = SOC_REACTIONS.map((r) =>
    `<button class="soc-react-opt ${myReact === r.emoji ? 'chosen' : ''}" data-soc-action="react-comment" data-comment-id="${c.id}" data-emoji="${r.emoji}" title="${r.label}" aria-label="${r.label}">${r.emoji}</button>`).join('');

  const summaryPill = totalReacts ? `
    <button class="soc-react-summary" data-soc-action="toggle-react-comment" data-comment-id="${c.id}"
            title="${myReact ? 'Tap to remove your reaction' : 'Tap to react'}">
      <span class="soc-react-summary-emoji">${stackEmoji.join('')}</span>
      <span class="soc-react-summary-count">${totalReacts}</span>
    </button>` : '';

  // The Like trigger shows a thumbs-up when you haven't reacted, or your chosen
  // reaction emoji once you have (no word — the emoji is the label).
  const likeEmoji = myReact || '👍';
  const likeTitle = myReact ? (SOC_REACTION_LABEL[myReact] || 'Reaction') : 'Like';

  return `
      <div class="soc-comment-bubble-wrap">
        <div class="soc-comment-bubble">
          <button class="soc-userlink soc-comment-author" data-soc-action="view-profile" data-uid="${c.authorId}"><b>@${escapeHtml(c.authorName)}</b></button>
          ${c.body ? `<div class="soc-comment-text">${linkifyMentions(c.body)}</div>` : ''}
          ${c.photoUrl ? `<button class="soc-comment-photo" type="button" data-soc-action="zoom-comment-photo" data-src="${escapeHtml(c.photoUrl)}" data-name="@${escapeHtml(c.authorName)}"><img src="${escapeHtml(c.photoUrl)}" loading="lazy" alt="" /></button>` : ''}
        </div>
        ${summaryPill}
      </div>
      <div class="soc-comment-actions">
        <span class="soc-react-wrap">
          <button class="linklike soc-act-like ${myReact ? 'reacted' : ''}" data-soc-action="toggle-react-palette" data-comment-id="${c.id}" title="${likeTitle}" aria-label="${likeTitle}">${likeEmoji}</button>
          <span class="soc-react-palette" data-react-palette="${c.id}">${palette}</span>
        </span>
        <button class="linklike soc-act-reply" data-soc-action="reply-comment" data-comment-id="${c.id}" data-post-id="${postId}">Reply</button>
        <span class="soc-act-time" title="${escapeHtml(new Date(c.createdAt).toLocaleString())}">${escapeHtml(socTimeAgo(c.createdAt))}</span>
        ${commentKebabHtml(c)}
      </div>`;
}

function renderComment(c, postId, depth = 0) {
  const replying = state.socReplyTo === c.id;
  const replies = depth === 0
    ? flattenReplies(c).map((r) => renderComment(r, postId, 1)).join('')
    : '';

  return `
    <div class="soc-comment ${depth ? 'soc-comment-reply' : ''}">
      <button class="soc-userlink soc-comment-avatar" data-soc-action="view-profile" data-uid="${c.authorId}" tabindex="-1" aria-label="@${escapeHtml(c.authorName)}">${socAvatar(c.authorAvatar, c.authorName)}</button>
      <div class="soc-comment-col">
        ${commentBubbleHtml(c, postId)}
        ${replying ? `
          <form class="soc-comment-form soc-reply-form" data-soc-action="submit-comment" data-post-id="${postId}" data-parent-id="${c.id}">
            ${commentPhotoPickerHtml()}
            <input type="text" class="soc-comment-input" maxlength="500" placeholder="Reply to @${escapeHtml(c.authorName)}…" />
            <button class="btn-primary" type="submit">Reply</button>
          </form>` : ''}
        ${replies ? `<div class="soc-comment-replies">${replies}</div>` : ''}
      </div>
    </div>`;
}

// Comment counts for a post's footer. Prunes viewer-hidden comments (client
// only) and keeps the totals honest by discounting whatever was removed.
// Collapsed shows the last 2 top-level threads (each surfacing its whole
// flattened subtree); expanded shows all. Returns the numbers the card needs.
function postCommentSummary(p) {
  const expanded = state.socExpandedComments.has(p.id);
  const subtreeSize = (c) => 1 + (c.replies || []).reduce((n, r) => n + subtreeSize(r), 0);
  const treeSize = (list) => (list || []).reduce((n, c) => n + subtreeSize(c), 0);
  const comments = pruneHiddenComments(p.comments);
  const hiddenRemoved = treeSize(p.comments) - treeSize(comments);
  const commentCount = (p.commentCount ?? p.comments.length) - hiddenRemoved;
  const shownComments = expanded ? comments : comments.slice(-2);
  const moreCount = commentCount - shownComments.reduce((n, c) => n + subtreeSize(c), 0);
  return { commentCount, shownComments, moreCount };
}

function postKebabHtml(p) {
  return socKebab(`post-${p.id}`, [
    p.mine ? socMenuItem('edit-post', '✏️ Edit', `data-post-id="${p.id}"`) : '',
    (p.mine || window.currentUser?.canModerate)
      ? socMenuItem('delete-post', `🗑 Delete${(!p.mine && window.currentUser?.canModerate) ? ' (mod)' : ''}`, `data-post-id="${p.id}"`, true) : '',
    !p.mine ? socMenuItem('hide-post', '🙈 Hide from my feed', `data-post-id="${p.id}"`) : '',
    !p.mine ? socMenuItem('report-post', '🚩 Report', `data-post-id="${p.id}" data-owner="${p.authorId}" data-name="${escapeHtml(p.authorName)}"`) : '',
    (!p.mine && !data.isUnblockable({ username: p.authorName }))
      ? socMenuItem('block-user', `🚫 Block @${escapeHtml(p.authorName)}`, `data-uid="${p.authorId}" data-name="${escapeHtml(p.authorName)}"`, true) : '',
  ]);
}

// A relic-unlock post (db/0088) renders as an ornate banner instead of its
// plain body; unknown keys fall back to the body text (the server snapshots
// a readable sentence exactly for that case).
function renderRelicBanner(p) {
  const m = p.relicKey && RELIC_META[p.relicKey];
  if (!m) return '';
  return `<button type="button" class="soc-relic-banner" data-soc-action="view-relic" data-relic-key="${escapeHtml(p.relicKey)}" title="What’s this relic?">
    <span class="soc-relic-emblem">${m.emoji}</span>
    <div class="soc-relic-text">
      <strong>Relic unearthed: ${escapeHtml(m.title)}</strong>
      <span>${escapeHtml(m.blurb)} 🖤</span>
    </div>
  </button>`;
}

function renderPostCard(p) {
  const img = p.photoUrl || catalogImageFor(p.catalogId);
  const expanded = state.socExpandedComments.has(p.id);
  const { commentCount, shownComments, moreCount } = postCommentSummary(p);

  // Posts share the comment reaction palette (item: parity with replies). My
  // current reaction (mutually exclusive), the total, and the picker options.
  const myReact = (p.reactions || []).find((r) => r.mine)?.emoji || null;
  const totalReacts = (p.reactions || []).reduce((n, r) => n + r.count, 0);
  const palette = SOC_REACTIONS.map((r) =>
    `<button class="soc-react-opt ${myReact === r.emoji ? 'chosen' : ''}" data-soc-action="react-post" data-post-id="${p.id}" data-emoji="${r.emoji}" title="${r.label}" aria-label="${r.label}">${r.emoji}</button>`).join('');
  const likeTitle = myReact ? (SOC_REACTION_LABEL[myReact] || 'Reaction') : 'Like';

  return `
  <article class="soc-post" data-post-id="${p.id}">
    <header class="soc-post-head">
      <button class="soc-userlink" data-soc-action="view-profile" data-uid="${p.authorId}">
        ${socAvatar(p.authorAvatar, p.authorName)}
        <span class="soc-post-author">@${escapeHtml(p.authorName)}</span>
      </button>
      <span class="soc-post-meta">${visBadge(p.visibility)} · ${escapeHtml(socTimeAgo(p.createdAt))}${p.edited ? ' · edited' : ''}</span>
      ${postKebabHtml(p)}
    </header>
    ${p.plushName ? `<p class="soc-post-plush">🧸 ${escapeHtml(p.plushName)}</p>` : ''}
    ${renderRelicBanner(p) || (p.body ? `<p class="soc-post-body">${linkifyMentions(p.body)}</p>` : '')}
    ${renderPoll(p)}
    ${img ? `<div class="soc-post-photo"><img src="${escapeHtml(img)}" loading="lazy" alt="" /></div>` : ''}
    <div class="soc-post-actions">
      <span class="soc-react-wrap">
        <button class="soc-like ${myReact ? 'liked' : ''}" data-soc-action="toggle-react-palette" data-palette-id="${p.id}" title="${likeTitle}" aria-label="${likeTitle}">
          ${myReact || '🤍'} <span>${totalReacts || ''}</span>
        </button>
        <span class="soc-react-palette" data-react-palette="${p.id}">${palette}</span>
      </span>
      <button class="soc-comment-btn" data-soc-action="toggle-comments" data-post-id="${p.id}">
        💬 <span>${commentCount || ''}</span>
      </button>
    </div>
    <div class="soc-comments">
      ${moreCount > 0 ? `<button class="linklike soc-more-comments" data-soc-action="toggle-comments" data-post-id="${p.id}">View ${moreCount} more comment${moreCount === 1 ? '' : 's'}</button>` : ''}
      ${shownComments.map((c) => renderComment(c, p.id)).join('')}
      ${expanded ? `
        <form class="soc-comment-form" data-soc-action="submit-comment" data-post-id="${p.id}">
          ${commentPhotoPickerHtml()}
          <input type="text" class="soc-comment-input" maxlength="500" placeholder="Add a comment… (@mention someone)" />
          <button class="btn-primary" type="submit">Post</button>
        </form>` : ''}
    </div>
  </article>`;
}

// Render a post's attached poll (0079), or '' if there is none. Facebook-style:
// the post body is the question; each option is a clickable result bar. Results
// (counts + %) reveal once I've voted or the poll has closed. Percentages are of
// voters, so a multi-select option can reach 100%. Polls are non-anonymous
// (Facebook standard): once results show, each option expands to reveal who
// voted for it.
function renderPoll(p) {
  const poll = p.poll;
  if (!poll) return '';
  const closed = poll.closed;
  const iVoted = poll.options.some((o) => o.mine);
  const showResults = iVoted || closed;
  const rows = poll.options.map((o) => {
    const mark = poll.multi ? (o.mine ? '☑' : '☐') : (o.mine ? '◉' : '○');
    const bar = showResults ? `<span class="soc-poll-bar" style="width:${o.pct}%"></span>` : '';
    const tally = showResults ? `<span class="soc-poll-tally">${o.pct}% · ${o.count}</span>` : '';
    const voters = (showResults && o.voters && o.voters.length) ? `
      <details class="soc-poll-voters">
        <summary>👥 ${o.voters.length === 1 ? '1 voter' : `${o.voters.length} voters`}</summary>
        <ul class="soc-poll-voter-list">
          ${o.voters.map((v) => `<li>${v.avatarUrl
            ? `<img class="soc-poll-voter-av" src="${escapeHtml(v.avatarUrl)}" alt="" loading="lazy" />`
            : '<span class="soc-poll-voter-av soc-poll-voter-av-blank">🖤</span>'}<span>${escapeHtml(v.name)}</span></li>`).join('')}
        </ul>
      </details>` : '';
    return `<div class="soc-poll-opt-wrap">
      <button class="soc-poll-opt-btn${o.mine ? ' chosen' : ''}" data-soc-action="vote-poll"
        data-post-id="${p.id}" data-option-id="${o.id}" data-multi="${poll.multi ? 1 : 0}" data-on="${o.mine ? 0 : 1}"${closed ? ' disabled' : ''}>
        ${bar}
        <span class="soc-poll-opt-face"><span class="soc-poll-mark">${mark}</span><span class="soc-poll-label">${escapeHtml(o.label)}</span></span>
        ${tally}
      </button>
      ${voters}
    </div>`;
  }).join('');
  const addOption = (poll.allowAdd && !closed) ? `
    <form class="soc-poll-addform" data-soc-action="add-poll-option" data-post-id="${p.id}">
      <input type="text" class="soc-poll-addinput" maxlength="80" placeholder="Add an option…" />
      <button type="submit" class="linklike">Add</button>
    </form>` : '';
  const meta = [`${poll.totalVoters} vote${poll.totalVoters === 1 ? '' : 's'}`];
  if (poll.multi) meta.push('pick one or more');
  if (closed) meta.push('Final results');
  else if (poll.closesAt) meta.push(`Ends ${new Date(poll.closesAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  return `<div class="soc-poll">
    <div class="soc-poll-list">${rows}</div>
    ${addOption}
    <div class="soc-poll-meta">${meta.join(' · ')}</div>
  </div>`;
}

// ─── Friends ────────────────────────────────────────────────────────
function renderFriends() {
  const el = document.getElementById('soc-friends');
  // Requests lead the tab (item: visibility) — a highlighted callout so a
  // pending request is the first thing you see, not buried under search + help.
  const requests = state.socRequests.length ? `
    <section class="soc-section soc-requests-callout">
      <h2 class="soc-section-head">🦇 Friend requests · ${state.socRequests.length}</h2>
      <p class="soc-tier-desc">Collectors asking to join your Coven. Accept to follow each other.</p>
      ${state.socRequests.map((r) => `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${r.userId}">
            ${socAvatar(r.avatarUrl, r.username)} <span>@${escapeHtml(r.username)}</span>
          </button>
          <span class="soc-friend-actions">
            <button class="btn-primary" data-soc-action="accept-friend" data-uid="${r.userId}">Accept</button>
            <button class="btn-ghost" data-soc-action="decline-friend" data-uid="${r.userId}">Decline</button>
          </span>
        </div>`).join('')}
    </section>` : '';

  const results = state.socSearch.length ? `
    <div class="soc-search-results">
      ${state.socSearch.map((u) => `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${u.userId}">
            ${socAvatar(u.avatarUrl, u.username)} <span>@${escapeHtml(u.username)}</span>
          </button>
          <button class="btn-primary" data-soc-action="add-friend" data-uid="${u.userId}">Add friend</button>
        </div>`).join('')}
    </div>` : (state.socSearchQuery ? `<p class="empty-note">No collectors match "@${escapeHtml(state.socSearchQuery)}".</p>` : '');

  // One friend row (actions unchanged). The tier is conveyed by the section it
  // sits under, so no inline chip is needed here.
  const friendRow = (f) => `
        <div class="soc-friend-row">
          <div class="soc-friend-id">
            <button class="soc-userlink" data-soc-action="view-profile" data-uid="${f.userId}">
              ${socAvatar(f.avatarUrl, f.username)}
              <span>@${escapeHtml(f.username)}</span>
            </button>
          </div>
          <span class="soc-friend-actions">
            <button class="btn-ghost" data-soc-action="open-dm" data-uid="${f.userId}" data-name="${escapeHtml(f.username)}">💬 Message</button>
            <button class="btn-ghost" data-soc-action="toggle-coffin" data-uid="${f.userId}" data-on="${f.isCoffinBuddy ? '0' : '1'}">
              ${f.isCoffinBuddy ? '🚫 Coffin Buddies' : 'Add to Coffin Buddies'}
            </button>
            <button class="btn-ghost" data-soc-action="toggle-inner" data-uid="${f.userId}" data-on="${f.isInner ? '0' : '1'}">
              ${f.isInner ? '🚫 Castle Crew' : 'Add to Castle Crew'}
            </button>
            <button class="btn-ghost" data-soc-action="remove-friend" data-uid="${f.userId}">🚫 Coven</button>
          </span>
        </div>`;

  // Group friends by their highest tier so each level reads as its own roster.
  // The tiers nest (Coffin Buddies ⊆ Castle Crew ⊆ Coven), so each person shows
  // once, under the closest tier they belong to.
  const tierSection = (list, head, desc) => list.length ? `
    <section class="soc-section">
      <h2 class="soc-section-head">${head} · ${list.length}</h2>
      <p class="soc-tier-desc">${desc}</p>
      ${list.map(friendRow).join('')}
    </section>` : '';

  const friends = state.socFriends.length ? `
    ${tierSection(state.socFriends.filter((f) => f.isCoffinBuddy),
      '⚰️ Your Coffin Buddies', 'The people you are REALLY close with — significant others, child/parent, maybe siblings.')}
    ${tierSection(state.socFriends.filter((f) => f.isInner && !f.isCoffinBuddy),
      '🏰 Your Castle Crew', 'People you are close with. Like “Close Friends” on Facebook.')}
    ${tierSection(state.socFriends.filter((f) => !f.isInner),
      '🦇 Your Coven', 'Friends you know casually. Like “Friends” on Facebook.')}
    ` : `<p class="empty-note">No friends in your Coven yet — search for a collector above.</p>`;

  const tierHelp = `
    <details class="soc-tier-help">
      <summary>What do the three friend levels mean? 🦇🏰⚰️</summary>
      <ul class="soc-tier-list">
        <li><span class="soc-tier-name">🦇 Your Coven</span> are people you know casually. Think of it like “Friends” on Facebook.</li>
        <li><span class="soc-tier-name">🏰 Your Castle Crew</span> are people you are close with. Think of it like “Close Friends” on Facebook.</li>
        <li><span class="soc-tier-name">⚰️ Your Coffin Buddies</span> are who you are REALLY close with. Think significant others, child/parent, maybe siblings. We won't tell you how many people you can cap this at, but more than likely, if you have more than 1 or 2 people in there (more if children) then they should probably be Castle Crew due to some upcoming functionality. This will become clearer over time.</li>
      </ul>
    </details>`;

  // Growth nudge: a light card to invite someone to the Crypt (item: sharing).
  const spreadCard = `
    <section class="soc-section soc-spread-card">
      <h2 class="soc-section-head">📣 Spread the word</h2>
      <p class="soc-tier-desc">Know a collector who'd love this? Send them to the Crypt.</p>
      <button class="btn-primary" data-soc-action="share-app">🦇 Invite a friend</button>
    </section>`;

  el.innerHTML = `
    ${requests}
    <div class="soc-search">
      <input type="search" id="soc-search-input" placeholder="Find collectors by @username…" value="${escapeHtml(state.socSearchQuery)}" />
    </div>
    ${tierHelp}
    ${results}
    ${friends}
    ${spreadCard}`;
}

// ─── My profile tab ─────────────────────────────────────────────────
function renderMyProfileTab() {
  // Reuse the profile renderer pointed at myself, but with edit affordances.
  const el = document.getElementById('soc-me');
  renderProfileInto(el, {
    profile: { id: window.currentUser.id, username: window.currentUser.username, displayName: state._myDisplayName, bio: state._myBio, avatarUrl: state._myAvatarUrl, socialLinks: state._mySocialLinks },
    posts: state._myPosts || [],
    top8: state._myTop8 || [],
    relics: state._myRelics || [],
    isMe: true,
  });
  el.insertAdjacentHTML('beforeend', renderBlockedManager());
}

// My Crypt masthead — the merged identity surface's header. Same content as
// the old Social → My Crypt tab (profile + Top 8 + edit affordances + blocked
// manager), rendered above the collection / wish list body on the Crypt tab.
// Reads the same state._my* cache that loadMyProfileCache() populates.
function renderCryptMasthead() {
  const el = document.getElementById('crypt-masthead');
  if (!el || !window.currentUser) return;
  // render() runs on every card tap (quantity steppers, etc.). Rebuilding this
  // header reflows the block above the grid, which fights keepScroll and snaps
  // the page to the top. Only rebuild when the identity content changed.
  const sig = JSON.stringify({
    u: window.currentUser.username,
    b: state._myBio || '',
    a: state._myAvatarUrl || '',
    s: state._mySocialLinks || null,
    // Pending gifts ride at the top of the crypt (see below), so a new one must
    // repaint the masthead — include them in the signature.
    g: (state.gifts || []).map((x) => `${x.id}:${x.status}`),
  });
  if (el._mastheadSig === sig && el.childNodes.length) return;
  el._mastheadSig = sig;
  // Collection-first: the masthead is a slim identity header only (avatar, bio,
  // links, edit affordances). Top 8 + your posts live in the crypt FOOTER below
  // the collection, so the collection itself is the lead of My Crypt.
  renderProfileInto(el, {
    profile: { id: window.currentUser.id, username: window.currentUser.username, bio: state._myBio, avatarUrl: state._myAvatarUrl, socialLinks: state._mySocialLinks },
    isMe: true,
    omitTop8: true,
    omitPosts: true,
    omitRelics: true,   // slim header; the relic shelf lives in the crypt footer
  });
  // Pending gifts belong ABOVE everything — an incoming gift is time-sensitive
  // and a recipient shouldn't have to scroll past their whole collection to
  // find the Accept button (which is what the footer placement did). Prepend it
  // so it's the first thing on My Crypt.
  const tray = renderGiftsTray();
  if (tray) el.insertAdjacentHTML('afterbegin', tray);
}

// My Crypt footer — the social/identity extras shown BELOW the collection grid:
// Top 8 Buns, your posts, and the blocked-collectors manager. Reuses the same
// delegated click/submit/error handlers as the masthead (wired in wireEvents).
// Guarded by a content signature so it only repaints on a real change.
// Re-fetch pending gifts (both directions) into state. Called at load and
// after any gift action so the tray + card badges stay honest.
async function refreshGifts() {
  try { state.gifts = await data.listMyGifts(); }
  catch (e) { console.warn('refreshGifts', e); state.gifts = []; }
}

function giftThumb(g) {
  const img = g.photo || (g.catalogId ? catalogImageFor(g.catalogId) : null);
  return `<span class="gift-thumb">${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />` : '🎁'}</span>`;
}

// The pending-gifts tray for My Crypt: incoming gifts to accept/decline, and
// your own outgoing gifts still waiting. Mirrors the friend-requests callout.
function renderGiftsTray() {
  const gifts = state.gifts || [];
  const incoming = gifts.filter((g) => g.direction === 'in' && g.status === 'pending');
  const outgoing = gifts.filter((g) => g.direction === 'out' && g.status === 'pending');
  if (!incoming.length && !outgoing.length) return '';
  const inRows = incoming.map((g) => `
    <div class="soc-friend-row gift-row">
      <span class="gift-row-main">${giftThumb(g)}
        <span><strong>@${escapeHtml(g.otherUsername)}</strong> wants to give you <strong>${escapeHtml(g.plushName || 'a plush')}</strong>${g.message ? `<span class="gift-row-msg">“${escapeHtml(g.message)}”</span>` : ''}</span>
      </span>
      <span class="soc-friend-actions">
        <button class="btn-primary" data-soc-action="gift-accept" data-gift-id="${g.id}">Accept</button>
        <button class="btn-ghost" data-soc-action="gift-decline" data-gift-id="${g.id}">Decline</button>
      </span>
    </div>`).join('');
  const outRows = outgoing.map((g) => `
    <div class="soc-friend-row gift-row">
      <span class="gift-row-main">${giftThumb(g)}
        <span>Gifting <strong>${escapeHtml(g.plushName || 'a plush')}</strong> → <strong>@${escapeHtml(g.otherUsername)}</strong> <span class="gift-row-msg">waiting for them to accept</span></span>
      </span>
      <span class="soc-friend-actions">
        <button class="btn-ghost" data-soc-action="gift-cancel" data-gift-id="${g.id}">Cancel</button>
      </span>
    </div>`).join('');
  return `
    <section class="soc-section soc-requests-callout">
      <h2 class="soc-section-head">🎁 Gifts${incoming.length ? ` · ${incoming.length}` : ''}</h2>
      ${inRows}${outRows}
    </section>`;
}

async function respondToGift(giftId, accept) {
  if (!giftId) return;
  try {
    await data.respondGift(giftId, accept);
    toast(accept ? 'Gift accepted — it’s in your crypt. 🎁' : 'Gift declined.');
    await refreshGifts();
    if (accept) await loadAll();   // the plush now lives in my collection
    render();
  } catch (err) { console.error('respondGift', err); toast('Could not do that.'); }
}

async function cancelPendingGift(giftId) {
  if (!giftId) return;
  try {
    await data.cancelGift(giftId);
    toast('Gift cancelled — it stayed in your crypt.');
    await refreshGifts();
    render();
  } catch (err) { console.error('cancelGift', err); toast('Could not cancel.'); }
}

function renderCryptFooter() {
  const el = document.getElementById('crypt-footer');
  if (!el || !window.currentUser) return;
  const posts = state._myPosts || [];
  const sig = JSON.stringify({
    t: (state._myTop8 || []).map((x) => (x && (x.id ?? x.itemId)) ?? x),
    p: posts,
    k: (state.myBlocks || []).map((x) => x.id),
    r: (state._myRelics || []).map((x) => x.key),
  });
  if (el._footerSig === sig && el.childNodes.length) return;
  el._footerSig = sig;
  // (Pending-gifts tray moved to the masthead — top of My Crypt — for visibility.)
  el.innerHTML = `
    <section class="soc-section">
      <h2 class="soc-section-head">Top 8 Buns 🐰</h2>
      ${renderTop8(state._myTop8 || [], true)}
    </section>
    <section class="soc-section">
      <h2 class="soc-section-head">Relics 🗝️</h2>
      ${renderRelicShelf(state._myRelics || [], true)}
    </section>
    <section class="soc-section">
      <h2 class="soc-section-head">Your posts</h2>
      ${posts.length ? (posts.filter((p) => !isHiddenPost(p.id)).map(renderPostCard).join('') || `<p class="empty-note">No posts to show.</p>`) : `<p class="empty-note">No posts yet.</p>`}
    </section>`;
  el.insertAdjacentHTML('beforeend', renderBlockedManager());
}

// "Blocked collectors" manager — the only place to unblock someone whose
// profile is otherwise hidden from you.
function renderBlockedManager() {
  const blocks = state.myBlocks || [];
  const rows = blocks.length
    ? blocks.map((b) => `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${b.id}"><b>@${escapeHtml(b.username)}</b></button>
          <button class="btn-ghost" data-soc-action="unblock-user" data-uid="${b.id}" data-name="${escapeHtml(b.username)}">Unblock</button>
        </div>`).join('')
    : '<p class="empty-note">You haven\'t blocked anyone.</p>';
  return `
    <section class="soc-section">
      <h2 class="soc-section-head">Blocked collectors 🚫</h2>
      ${rows}
    </section>`;
}

// ─── Viewing someone's profile (overlay) ────────────────────────────
async function openProfile(userId) {
  try {
    // A fresh open (from the feed or another profile) should land at the TOP
    // of the profile — without this, the profile swaps in under the reader's
    // current scroll position and all they see is a list of posts that looks
    // exactly like the feed, i.e. "the tap did nothing". A refresh of the
    // already-open profile (after a react/comment/friend action) keeps its
    // place. The feed's own position is remembered for the ← back trip.
    const refreshing = state.socProfile?.profile?.id === userId;
    if (!state.socProfile) state._socFeedScroll = window.scrollY;
    const [profile, posts, top8, friendship, relics, vault] = await Promise.all([
      data.getSocialProfile(userId),
      data.listUserPosts(userId),
      data.getTopPlushes(userId),
      data.friendshipWith(userId),
      data.listRelics(userId),
      data.getUserVault(userId),
    ]);
    if (!profile) { toast('Profile not found.'); return; }
    const isMe = userId === window.currentUser.id;
    // If you're blocked-with this person but you aren't the blocker, their
    // content isn't yours to see. (If YOU blocked them, we still show the
    // profile so you can Unblock.)
    if (!isMe && data.isBlocked(userId) && !data.isMyBlock(userId)) {
      state.socProfile = { profile, posts: [], top8: [], relics: [], friendship: 'none', isMe, unavailable: true };
      renderSocial();
      if (!refreshing) window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    state.socProfile = {
      profile, friendship, isMe,
      posts: stripBlocked(posts),
      top8,
      relics,
      vault,
    };
    renderSocial();
    if (!refreshing) window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) { console.error('openProfile', e); toast('Could not open profile.'); }
}

// ← Back to feed: drop the profile overlay and put the reader back exactly
// where they were scrolled in the feed before they tapped in.
function closeProfileToFeed() {
  state.socProfile = null;
  renderSocial();
  window.scrollTo({ top: state._socFeedScroll || 0, behavior: 'instant' });
}

function renderProfileInto(el, { profile, posts = [], top8 = [], relics = [], vault = [], friendship, isMe, withBack, unavailable, omitPosts, omitTop8, omitRelics, omitVault }) {
  if (unavailable) {
    el.innerHTML = `
      ${withBack ? `<button class="linklike soc-back" data-soc-action="close-profile">← Back to feed</button>` : ''}
      <div class="soc-unavailable">
        <p class="empty-note">This collector isn't available to you.</p>
      </div>`;
    return;
  }
  const top8Html = renderTop8(top8, isMe);
  let relBtns = '';
  if (isMe) {
    relBtns = `<button class="btn-ghost" data-soc-action="edit-profile">Edit profile</button>
               <button class="btn-ghost" data-soc-action="edit-top8">Edit Top 8 Buns</button>`;
  } else {
    if (friendship === 'friends') {
      // Tier flags come from the loaded friends list; default to plain Coven.
      const fr = (state.socFriends || []).find((x) => x.userId === profile.id) || {};
      const tierTag = fr.isCoffinBuddy
        ? '<span class="soc-rel-tag">⚰️ Coffin Buddies</span>'
        : (fr.isInner ? '<span class="soc-rel-tag">🏰 Castle Crew</span>' : '<span class="soc-rel-tag">🦇 In your Coven</span>');
      relBtns = `${tierTag}
               <button class="btn-primary" data-soc-action="open-dm" data-uid="${profile.id}" data-name="${escapeHtml(profile.username || '')}">💬 Message</button>
               <button class="btn-ghost" data-soc-action="toggle-coffin" data-uid="${profile.id}" data-on="${fr.isCoffinBuddy ? '0' : '1'}">${fr.isCoffinBuddy ? '🚫 Coffin Buddies' : 'Add to Coffin Buddies'}</button>
               <button class="btn-ghost" data-soc-action="toggle-inner" data-uid="${profile.id}" data-on="${fr.isInner ? '0' : '1'}">${fr.isInner ? '🚫 Castle Crew' : 'Add to Castle Crew'}</button>
               <button class="btn-ghost" data-soc-action="remove-friend" data-uid="${profile.id}">🚫 Coven</button>`;
    }
    else if (friendship === 'outgoing') relBtns = `<button class="btn-ghost" data-soc-action="remove-friend" data-uid="${profile.id}">Cancel request</button>`;
    else if (friendship === 'incoming') relBtns = `<button class="btn-primary" data-soc-action="accept-friend" data-uid="${profile.id}">Accept request</button>`;
    else relBtns = `<button class="btn-primary" data-soc-action="add-friend" data-uid="${profile.id}">Add friend</button>`;
    // Block/unblock + report, available on anyone else's profile. Admins +
    // the redrambler moderator can't be blocked (DB-enforced in db/0036);
    // hide the affordance for them rather than offer an action that errors.
    const uname = escapeHtml(profile.username);
    const unblockable = data.isUnblockable({ username: profile.username, is_admin: profile.is_admin });
    if (data.isMyBlock(profile.id)) {
      relBtns += `<button class="btn-ghost soc-danger" data-soc-action="unblock-user" data-uid="${profile.id}" data-name="${uname}">Unblock</button>`;
    } else if (!unblockable) {
      relBtns += `<button class="btn-ghost soc-danger" data-soc-action="block-user" data-uid="${profile.id}" data-name="${uname}">🚫 Block</button>`;
    }
    relBtns += `<button class="btn-ghost" data-soc-action="report-user" data-uid="${profile.id}" data-name="${uname}">🚩 Report</button>`;
  }

  el.innerHTML = `
    ${withBack ? `<button class="linklike soc-back" data-soc-action="close-profile">← Back to feed</button>` : ''}
    <header class="soc-profile-head">
      ${socAvatar(profile.avatarUrl, profile.username, 'soc-avatar-lg')}
      <div class="soc-profile-id">
        <h2>@${escapeHtml(profile.username)}</h2>
        ${profile.displayName ? `<p class="soc-realname">${escapeHtml(profile.displayName)}</p>` : ''}
        ${profile.bio ? `<p class="soc-bio">${linkifyMentions(profile.bio)}</p>` : (isMe ? `<p class="soc-bio soc-bio-empty">Add a bio to tell the crypt about yourself…</p>` : '')}
        ${renderSocialLinks(profile.socialLinks)}
        <div class="soc-profile-actions">${relBtns}</div>
      </div>
    </header>
    ${omitTop8 ? '' : `<section class="soc-section">
      <h2 class="soc-section-head">Top 8 Buns 🐰</h2>
      ${top8Html}
    </section>`}
    ${isMe || omitVault ? '' : `<section class="soc-section">
      <h2 class="soc-section-head">Crypt 🦇${vault.length ? ` <span class="soc-vault-count">${vault.length}</span>` : ''}</h2>
      ${renderVault(vault)}
    </section>`}
    ${omitRelics || (!isMe && !(relics || []).some((r) => RELIC_META[r.key])) ? '' : `<section class="soc-section">
      <h2 class="soc-section-head">Relics 🗝️</h2>
      ${renderRelicShelf(relics, isMe)}
    </section>`}
    ${omitPosts ? '' : `<section class="soc-section">
      <h2 class="soc-section-head">${isMe ? 'Your posts' : 'Posts'}</h2>
      ${posts.length ? (posts.filter((p) => !isHiddenPost(p.id)).map(renderPostCard).join('') || `<p class="empty-note">No posts to show.</p>`) : `<p class="empty-note">No posts yet.</p>`}
    </section>`}`;
}

// The vault browser grid — another collector's plushes, already filtered
// server-side (get_user_vault) to what your tier may see. Read-only: photo +
// its name (nickname wins), catalog image as the photo fallback. Tap a photo
// to zoom, reusing the Top 8 lightbox action.
function renderVault(vault) {
  if (!vault || !vault.length) {
    return `<p class="empty-note">Nothing to show here — either their crypt is empty, or none of it is shared at your tier.</p>`;
  }
  const tiles = vault.map((it) => {
    const name = it.nickname || it.name || 'Plush';
    const img = it.photo || catalogImageFor(it.catalogId);
    const zoomAttr = img
      ? ` data-soc-action="zoom-top8" data-src="${escapeHtml(img)}" data-name="${escapeHtml(name)}" role="button" tabindex="0" title="Tap to see it bigger"`
      : '';
    return `
      <div class="soc-vault-tile">
        <div class="soc-vault-photo"${zoomAttr}>${img ? `<img src="${escapeHtml(img)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>'}</div>
        <span class="soc-vault-name">${escapeHtml(name)}</span>
      </div>`;
  }).join('');
  return `<div class="soc-vault-grid">${tiles}</div>`;
}

function renderTop8(top8, isMe) {
  if (!top8 || !top8.length) {
    return `<p class="empty-note soc-top8-empty">${isMe ? 'Pick your Top 8 Buns to show them off, MySpace-style.' : 'No Top 8 Buns picked yet.'}</p>`;
  }
  const slots = top8.map((t) => {
    const img = t.photoUrl || catalogImageFor(t.catalogId);
    // Tapping a Top 8 photo opens the shared lightbox so you can see it bigger.
    const zoomAttr = img
      ? ` data-soc-action="zoom-top8" data-src="${escapeHtml(img)}" data-name="${escapeHtml(t.plushName)}" role="button" tabindex="0" title="Tap to see it bigger"`
      : '';
    return `
      <div class="soc-top8-slot">
        <span class="soc-top8-rank">${t.position}</span>
        <div class="soc-top8-photo"${zoomAttr}>${img ? `<img src="${escapeHtml(img)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>'}</div>
        <span class="soc-top8-name">${escapeHtml(t.plushName)}</span>
      </div>`;
  }).join('');
  return `<div class="soc-top8-grid">${slots}</div>`;
}

// ─── Social modal (compose / edit profile / Top 8 picker) ───────────
function openSocialModal(html) {
  document.getElementById('social-modal-card').innerHTML = html;
  showEl('social-modal');
}
function closeSocialModal() {
  hideEl('social-modal');
  document.getElementById('social-modal-card').innerHTML = '';
  state.socComposePhoto = null;
  state.top8PhotoBlobs = null;
}

// ─── Confirm dialog ─────────────────────────────────────────────────
// Promise<boolean> styled confirm, reusing the social modal. Used before
// any destructive action (delete post/comment, block) so a stray tap can't
// nuke content — replaces the bare browser confirm().
function socConfirm({ title, body, confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    openSocialModal(`
      <div class="soc-confirm">
        <h2>${escapeHtml(title || 'Are you sure?')}</h2>
        ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        <div class="soc-confirm-actions">
          <button class="btn-ghost" data-soc-confirm="cancel" type="button">Cancel</button>
          <button class="btn-primary${danger ? ' soc-danger-btn' : ''}" data-soc-confirm="ok" type="button">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`);
    const card = document.getElementById('social-modal-card');
    const finish = (val) => { card.removeEventListener('click', onClick); closeSocialModal(); resolve(val); };
    function onClick(e) {
      const btn = e.target.closest('[data-soc-confirm]');
      if (!btn) return;
      finish(btn.dataset.socConfirm === 'ok');
    }
    card.addEventListener('click', onClick);
  });
}

// ─── Hide from my view (client-only, per-user) ──────────────────────
// "I don't want to see this" without blocking the author. Per-user, stored
// in localStorage; the item is filtered out of the feed/threads on render.
// No schema, no effect on anyone else's view.
function socHideKey(kind) { return `soc_hidden_${kind}_${window.currentUser?.id || 'anon'}`; }
function ensureHiddenSets() {
  if (!state.socHiddenPosts) {
    try { state.socHiddenPosts = new Set(JSON.parse(localStorage.getItem(socHideKey('posts')) || '[]')); }
    catch { state.socHiddenPosts = new Set(); }
  }
  if (!state.socHiddenComments) {
    try { state.socHiddenComments = new Set(JSON.parse(localStorage.getItem(socHideKey('comments')) || '[]')); }
    catch { state.socHiddenComments = new Set(); }
  }
}
function persistHidden(kind) {
  ensureHiddenSets();
  const set = kind === 'posts' ? state.socHiddenPosts : state.socHiddenComments;
  try { localStorage.setItem(socHideKey(kind), JSON.stringify([...set])); } catch { /* quota / private mode */ }
}
function onHidePost(postId) {
  ensureHiddenSets();
  state.socHiddenPosts.add(postId);
  persistHidden('posts');
  toast('Hidden from your feed.');
  rerenderSocialCurrent();
}
function onHideComment(commentId) {
  ensureHiddenSets();
  state.socHiddenComments.add(commentId);
  persistHidden('comments');
  toast('Comment hidden.');
  rerenderSocialCurrent();
}
function isHiddenPost(id) { ensureHiddenSets(); return state.socHiddenPosts.has(id); }
function pruneHiddenComments(comments) {
  ensureHiddenSets();
  if (!comments) return comments;
  return comments
    .filter((c) => !state.socHiddenComments.has(c.id))
    .map((c) => ({ ...c, replies: pruneHiddenComments(c.replies) }));
}

// ─── Three-dot (kebab) menu ─────────────────────────────────────────
// One "⋯" button per post/comment opening a popover of context actions,
// mirroring the reaction-palette popover (toggle .open, outside-click closes
// in onSocialClick). Empty item lists render nothing.
function socMenuItem(action, label, attrs = '', danger = false) {
  return `<button class="soc-menu-item${danger ? ' soc-menu-danger' : ''}" data-soc-action="${action}" ${attrs} role="menuitem" type="button">${label}</button>`;
}
function socKebab(menuId, items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  return `<span class="soc-menu-wrap">
      <button class="soc-kebab" data-soc-action="toggle-menu" data-menu="${menuId}" aria-label="More options" title="More">⋯</button>
      <span class="soc-menu" data-menu="${menuId}" role="menu">${list.join('')}</span>
    </span>`;
}

// One editable option row in the poll composer. `×` removes it (min 2 enforced
// on click). Reused when the author taps "Add option".
function pollOptionRow(value = '') {
  return `<div class="soc-poll-opt-row">
    <input type="text" class="soc-poll-opt" maxlength="80" placeholder="Option" value="${escapeHtml(value)}" />
    <button type="button" class="soc-poll-opt-del" data-soc-action="poll-remove-option-row" aria-label="Remove option">×</button>
  </div>`;
}

function openComposer() {
  state.socComposeVis = state.socComposeVis || 'public';
  state.socComposePhoto = null;
  const visOptions = Object.entries(VIS_META).map(([k, m]) =>
    `<option value="${k}" ${state.socComposeVis === k ? 'selected' : ''}>${m.glyph} ${m.label} — ${m.hint}</option>`).join('');
  // Optional: tag one of my own plushes (sets a catalog image + name).
  const plushOptions = ['<option value="">Tag a plush (optional)…</option>']
    .concat(state.collection.map((p) => `<option value="${escapeHtml(p.catalogId || '')}|${escapeHtml(p.nickname || p.name)}">${escapeHtml(p.nickname || p.name)}</option>`))
    .join('');
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>New post</h2>
    <form id="soc-compose-form">
      <label class="field">
        <span>Your story</span>
        <textarea id="soc-compose-body" rows="4" maxlength="1000" placeholder="Tell the crypt about your plush…"></textarea>
      </label>
      <label class="field">
        <span>Tag a plush</span>
        <select id="soc-compose-plush">${plushOptions}</select>
      </label>
      ${data.featureEnabled('feature.user_photo_uploads') ? `
      <label class="field">
        <span>Photo (optional)</span>
        <input type="file" id="soc-compose-photo" accept="image/*" />
        <span id="soc-compose-photo-name" class="soc-file-name"></span>
      </label>` : `
      <p class="soc-help soc-stock-note">📷 Photo uploads are off for now — tag a plush above to share its picture.</p>`}
      <div class="field soc-poll-compose">
        <button type="button" class="btn-ghost soc-poll-toggle" data-soc-action="poll-toggle">📊 Add a poll</button>
        <div id="soc-poll-fields" class="soc-poll-fields" hidden>
          <p class="soc-help">Your story above is the poll question.</p>
          <div id="soc-poll-options" class="soc-poll-opts">
            ${pollOptionRow()}
            ${pollOptionRow()}
          </div>
          <button type="button" class="linklike soc-poll-add-row" data-soc-action="poll-add-option-row">➕ Add option</button>
          <label class="soc-poll-check"><input type="checkbox" id="soc-poll-multi" /> Allow people to choose more than one</label>
          <label class="soc-poll-check"><input type="checkbox" id="soc-poll-allowadd" /> Allow anyone to add options</label>
          <label class="field soc-poll-closes-field">
            <span>Poll end date (optional)</span>
            <input type="datetime-local" id="soc-poll-closes" />
          </label>
        </div>
      </div>
      <label class="field">
        <span>Who can see this</span>
        <select id="soc-compose-vis">${visOptions}</select>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Post</button>
      </div>
    </form>`);
}

async function submitComposer(e) {
  e.preventDefault();
  const body = document.getElementById('soc-compose-body').value.trim();
  const vis = document.getElementById('soc-compose-vis').value;
  const plushVal = document.getElementById('soc-compose-plush').value;
  let catalogId = null, plushName = null;
  if (plushVal) {
    const [cid, name] = plushVal.split('|');
    catalogId = cid || null;
    plushName = name || null;
  }
  if (!body && !state.socComposePhoto && !plushName) {
    toast('Add a story, a photo, or tag a plush.');
    return;
  }
  // Optional attached poll. The story text is the question, so it's required
  // when a poll is present; need at least two non-blank options.
  let poll = null;
  const pollFields = document.getElementById('soc-poll-fields');
  if (pollFields && !pollFields.hasAttribute('hidden')) {
    const options = [...document.querySelectorAll('#soc-poll-options .soc-poll-opt')]
      .map((i) => i.value.trim()).filter(Boolean);
    if (!body) { toast('Add a question (your story) for the poll.'); return; }
    if (options.length < 2) { toast('A poll needs at least 2 options.'); return; }
    const closesRaw = document.getElementById('soc-poll-closes')?.value;
    poll = {
      options,
      multi: document.getElementById('soc-poll-multi')?.checked || false,
      allowAdd: document.getElementById('soc-poll-allowadd')?.checked || false,
      closesAt: closesRaw ? new Date(closesRaw).toISOString() : null,
    };
  }
  try {
    await data.createPost({ body, visibility: vis, photoBlob: state.socComposePhoto, catalogId, plushName, poll });
    state.socComposeVis = vis;
    closeSocialModal();
    toast('Posted to the crypt. 🦇');
    await loadSocialData();
    state.socProfile = null;
    setSocSubTab('feed');
  } catch (err) {
    console.error('createPost', err);
    // createPost undoes the post if an attached poll fails to save, so nothing
    // half-published survives — say so plainly instead of a bare "Could not post".
    toast(poll ? 'Could not save your poll — nothing was posted. Please try again.' : 'Could not post.');
  }
}

// ─── Edit an existing post ──────────────────────────────────────────
function openPostEditor(postId) {
  const p = findFeedPost(postId);
  if (!p) { toast('Post not found.'); return; }
  state.socComposePhoto = null;
  const visOptions = Object.entries(VIS_META).map(([k, m]) =>
    `<option value="${k}" ${p.visibility === k ? 'selected' : ''}>${m.glyph} ${m.label} — ${m.hint}</option>`).join('');

  // Plush tag select, preselecting the post's current tag. If the tagged
  // plush is no longer in the collection, keep it as a current option.
  const currentTag = p.plushName ? `${p.catalogId || ''}|${p.plushName}` : '';
  const collOpts = state.collection.map((c) => `${c.catalogId || ''}|${c.nickname || c.name}`);
  let plushOptions = `<option value="" ${currentTag ? '' : 'selected'}>No plush tagged</option>`;
  if (currentTag && !collOpts.includes(currentTag)) {
    plushOptions += `<option value="${escapeHtml(currentTag)}" selected>${escapeHtml(p.plushName)} (current)</option>`;
  }
  plushOptions += state.collection.map((c) => {
    const val = `${c.catalogId || ''}|${c.nickname || c.name}`;
    return `<option value="${escapeHtml(val)}" ${val === currentTag ? 'selected' : ''}>${escapeHtml(c.nickname || c.name)}</option>`;
  }).join('');

  const hasPhoto = !!p.photoUrl;
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Edit post</h2>
    <form id="soc-edit-form" data-post-id="${p.id}">
      <label class="field">
        <span>Your story</span>
        <textarea id="soc-edit-body" rows="4" maxlength="1000" placeholder="Tell the crypt about your plush…">${escapeHtml(p.body || '')}</textarea>
      </label>
      <label class="field">
        <span>Tag a plush</span>
        <select id="soc-edit-plush">${plushOptions}</select>
      </label>
      ${hasPhoto ? `
      <div class="field soc-edit-photo-current">
        <span>Current photo</span>
        <img src="${escapeHtml(p.photoUrl)}" alt="" class="soc-edit-thumb" />
        <label class="checkbox"><input type="checkbox" id="soc-edit-remove-photo" /> Remove photo</label>
      </div>` : ''}
      ${data.featureEnabled('feature.user_photo_uploads') ? `
      <label class="field">
        <span>${hasPhoto ? 'Replace photo' : 'Photo'} (optional)</span>
        <input type="file" id="soc-edit-photo" accept="image/*" />
        <span id="soc-edit-photo-name" class="soc-file-name"></span>
      </label>` : ''}
      <label class="field">
        <span>Who can see this</span>
        <select id="soc-edit-vis">${visOptions}</select>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Save changes</button>
      </div>
    </form>`);
}

async function submitPostEdit(e) {
  e.preventDefault();
  const postId = e.target.dataset.postId;
  const post = findFeedPost(postId);
  const body = document.getElementById('soc-edit-body').value.trim();
  const vis = document.getElementById('soc-edit-vis').value;
  const plushVal = document.getElementById('soc-edit-plush').value;
  const removePhoto = !!document.getElementById('soc-edit-remove-photo')?.checked;
  let catalogId = null, plushName = null;
  if (plushVal) { const [cid, name] = plushVal.split('|'); catalogId = cid || null; plushName = name || null; }

  // The DB requires body OR a photo OR a tagged plush. Work out whether
  // any survives this edit.
  const photoAfter = !!state.socComposePhoto || (!!post?.photoUrl && !removePhoto);
  if (!body && !photoAfter && !plushName) {
    toast('A post needs a story, a photo, or a tagged plush.');
    return;
  }
  try {
    await data.updatePost(postId, {
      body, visibility: vis, catalogId, plushName,
      photoBlob: state.socComposePhoto,
      removePhoto: removePhoto && !state.socComposePhoto,
    });
    closeSocialModal();
    toast('Post updated.');
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (err) { console.error('updatePost', err); toast('Could not update post.'); }
}

function openEditProfile() {
  const p = state.socProfile?.profile || { bio: state._myBio };
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Edit profile</h2>
    <form id="soc-profile-form">
      <label class="field">
        <span>Bio</span>
        <textarea id="soc-bio" rows="3" maxlength="280" placeholder="A line or two about you and your crypt…">${escapeHtml(p.bio || '')}</textarea>
      </label>
      <label class="field">
        <span>Avatar (optional)</span>
        <input type="file" id="soc-avatar" accept="image/*" />
        <span id="soc-avatar-name" class="soc-file-name"></span>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>`);
}

async function submitEditProfile(e) {
  e.preventDefault();
  const bio = document.getElementById('soc-bio').value.trim();
  try {
    await data.updateMyProfile({ bio, avatarBlob: state.socComposePhoto });
    closeSocialModal();
    toast('Profile updated.');
    // Refresh both the My Crypt cache and the open overlay view.
    await loadMyProfileCache();
    await openProfile(window.currentUser.id);
  } catch (err) { console.error('updateProfile', err); toast('Could not save profile.'); }
}

// Top 8 picker — drag-free, click to add/remove from an ordered list.
function openTop8Picker() {
  const existing = state.socProfile?.top8 || state._myTop8 || [];
  const current = existing.map((t) => t.plushName);
  // Fresh per-bun uploads staged this session, keyed by plush name.
  state.top8PhotoBlobs = {};
  // Default the "keep Tom" toggle to whether he's currently in the list,
  // so once excommunicated he stays gone across re-opens (no migration —
  // his presence in top_plushes IS the stored preference).
  const tomPresent = existing.some((t) =>
    t.catalogId === data.TOM_TOP.catalogId || (t.plushName || '').trim().toLowerCase() === 'tom');
  // Build from the user's collection; preselect anything already chosen.
  // Top 8 Buns are plushes + minis only — accessories, outfits, charms and
  // other merch live in the collection but don't belong in the Buns lineup.
  const items = state.collection.filter((p) => {
    const cat = itemCategory(p);
    return cat === 'plush' || cat === 'mini';
  }).map((p) => {
    const name = p.nickname || p.name;
    const picked = current.includes(name);
    // If this bun is already in the saved Top 8, keep whatever photo it stored
    // (a prior collection copy, or a bespoke upload) so re-saving keeps it and
    // its preview shows the real Top 8 image.
    const existingT = existing.find((t) => t.plushName === name);
    const img = existingT?.photoUrl || p.photo || catalogImageFor(p.catalogId);
    return `
      <div class="soc-pick-cell">
        <button type="button" class="soc-pick ${picked ? 'picked' : ''}"
          data-soc-pick data-name="${escapeHtml(name)}"
          data-catalog="${escapeHtml(p.catalogId || '')}"
          data-item-id="${escapeHtml(p.id || '')}"
          data-photo="${escapeHtml(p.photoPath || '')}"
          data-existing="${escapeHtml(existingT?.photoPath || '')}">
          <div class="soc-pick-photo">${img ? `<img src="${escapeHtml(img)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>'}</div>
          <span class="soc-pick-name">${escapeHtml(name)}</span>
          <span class="soc-pick-rank"></span>
        </button>
        <button type="button" class="soc-pick-cam" data-soc-cam aria-label="Use your own photo of ${escapeHtml(name)}" title="Use your own photo">📷</button>
        <input type="file" class="soc-pick-file" accept="image/*" hidden />
      </div>`;
  }).join('');
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Pick your Top 8 Buns</h2>
    <p class="soc-help">Tap up to 8 plushes from your collection. Tap again to remove. Order = pick order. Tap 📷 to use your own photo of a bun (otherwise the store picture shows). Tom tags along until you've picked a full 8. 🐰</p>
    <div class="soc-pick-grid">${items || '<p class="empty-note">Your collection is empty — add some plushes first.</p>'}</div>
    <label class="checkbox soc-keep-tom">
      <input type="checkbox" id="soc-keep-tom" ${tomPresent ? 'checked' : ''} />
      <span>Keep Tom in my Top 8 Buns 🐰 <span class="soc-keep-tom-note">(uncheck to excommunicate him)</span></span>
    </label>
    <div class="form-actions">
      <button type="button" class="btn-ghost" data-close-social>Cancel</button>
      <button type="button" class="btn-primary" data-soc-action="save-top8">Save Top 8 Buns</button>
    </div>`);
  refreshTop8Ranks();
}

function refreshTop8Ranks() {
  const picked = [...document.querySelectorAll('.soc-pick.picked')];
  picked.forEach((b, i) => { b.querySelector('.soc-pick-rank').textContent = `#${i + 1}`; });
}

async function saveTop8() {
  const picked = [...document.querySelectorAll('.soc-pick.picked')];
  if (picked.length > 8) { toast('Pick at most 8.'); return; }
  const blobs = state.top8PhotoBlobs || {};
  const entries = [];
  for (const b of picked) {
    const name = b.dataset.name;
    const entry = { plushName: name, catalogId: b.dataset.catalog || null };
    const blob = blobs[name];
    if (blob) {
      // They uploaded their own photo for this bun. If the matching collection
      // item has no photo yet, fill it in too — one photo, reused everywhere
      // (we never overwrite an existing collection photo).
      const item = state.collection.find((p) => b.dataset.itemId && p.id === b.dataset.itemId);
      if (item && !item.photoPath) {
        try { await data.put('collection', { ...item, photo: blob }); }
        catch (err) { console.warn('top8 collection enrich failed', err); }
      }
      entry.socialBlob = blob;
    } else if (b.dataset.existing) {
      entry.socialPath = b.dataset.existing;   // keep the photo already stored
    } else if (b.dataset.photo) {
      entry.photoPath = b.dataset.photo;       // copy their collection photo in
    }
    entries.push(entry);
  }
  const keepTom = document.getElementById('soc-keep-tom')?.checked ?? true;
  try {
    await data.setTopPlushes(entries, { keepTom });
    closeSocialModal();
    toast('Top 8 Buns saved. 🐰');
    await loadMyProfileCache();
    await openProfile(window.currentUser.id);
  } catch (err) { console.error('saveTop8', err); toast('Could not save Top 8 Buns.'); }
}

// ─── Social event wiring ────────────────────────────────────────────
// ─── @mention typeahead ─────────────────────────────────────────────
// Lightweight autocomplete for @username mentions in comment boxes, the
// post composer, and bios. Once there's at least one letter after the '@'
// we surface matching collectors in a dropdown you can click instead of
// typing the whole handle (item 6).
const MENTION_FIELD_SEL = '.soc-comment-input, #soc-compose-body, #soc-edit-body, #soc-bio, #acct-bio';
let mentionState = { field: null, start: 0, end: 0, token: 0 };

function getMentionDropdown() {
  let el = document.getElementById('mention-suggest');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mention-suggest';
    el.className = 'mention-suggest hidden';
    document.body.appendChild(el);
    // mousedown fires before the field blurs, so the insertion still has a
    // live target field to write into.
    el.addEventListener('mousedown', (e) => {
      const row = e.target.closest('[data-mention-username]');
      if (!row) return;
      e.preventDefault();
      insertMention(row.dataset.mentionUsername);
    });
  }
  return el;
}

function hideMentionDropdown() {
  const el = document.getElementById('mention-suggest');
  if (el) el.classList.add('hidden');
  mentionState.field = null;
}

function positionMentionDropdown(field) {
  const el = getMentionDropdown();
  const r = field.getBoundingClientRect();
  el.style.left = `${Math.round(r.left)}px`;
  el.style.top = `${Math.round(r.bottom + 4)}px`;
  el.style.minWidth = `${Math.round(Math.min(Math.max(r.width, 160), 280))}px`;
}

async function onMentionInput(field) {
  const pos = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, pos);
  // Active mention = an '@' followed by 1–20 handle chars, right at the caret.
  const m = before.match(/(?:^|[^\w@])@([a-zA-Z0-9_-]{1,20})$/);
  if (!m) { hideMentionDropdown(); return; }
  const prefix = m[1];
  const token = ++mentionState.token;
  mentionState = { field, start: pos - prefix.length, end: pos, token };
  let users = [];
  try { users = await data.searchUsers(prefix, 6); } catch { users = []; }
  // Bail if the user kept typing / moved on while we were awaiting.
  if (mentionState.token !== token || mentionState.field !== field) return;
  const el = getMentionDropdown();
  if (!users.length) { hideMentionDropdown(); return; }
  el.innerHTML = users.map((u) =>
    `<button type="button" class="mention-row" data-mention-username="${escapeHtml(u.username)}">
       ${socAvatar(u.avatarUrl, u.username, 'mention-avatar')}<span>@${escapeHtml(u.username)}</span>
     </button>`).join('');
  positionMentionDropdown(field);
  el.classList.remove('hidden');
}

function insertMention(username) {
  const { field, start, end } = mentionState;
  if (!field) return;
  const v = field.value;
  field.value = v.slice(0, start) + username + ' ' + v.slice(end);
  const caret = start + username.length + 1;
  field.focus();
  try { field.setSelectionRange(caret, caret); } catch { /* not all inputs support it */ }
  hideMentionDropdown();
  // Let any maxlength/validation listeners react to the programmatic change.
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function wireMentionAutocomplete() {
  document.addEventListener('input', (e) => {
    if (e.target.matches?.(MENTION_FIELD_SEL)) onMentionInput(e.target);
  });
  // Dismiss when focus/click leaves the field and the dropdown.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#mention-suggest')) return;
    if (e.target.matches?.(MENTION_FIELD_SEL)) return;
    hideMentionDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideMentionDropdown();
  });
  // Reposition isn't worth tracking on scroll — just hide so it can't drift.
  window.addEventListener('scroll', hideMentionDropdown, true);
}

function wireSocialEvents() {
  wireMentionAutocomplete();
  // Sub-tabs.
  document.querySelectorAll('#social-view .subtab').forEach((s) => {
    s.addEventListener('click', async () => {
      state.socProfile = null;
      if (s.dataset.socSubtab === 'me') {
        // Lazy-load my own profile data into the cache the tab reads.
        await loadMyProfileCache();
      }
      setSocSubTab(s.dataset.socSubtab);
    });
  });

  // Delegated clicks across the whole social view + modal.
  document.getElementById('social-view').addEventListener('click', onSocialClick);
  document.getElementById('social-modal').addEventListener('click', onSocialModalClick);

  // The My Crypt masthead (slim header, on top) and footer (Top 8 + your posts,
  // below the collection) live outside #social-view but reuse the same delegated
  // profile handlers (edit profile, edit Top 8, view a profile, like/comment on
  // your own posts, graceful image fallback).
  for (const id of ['crypt-masthead', 'crypt-footer']) {
    const cryptEl = document.getElementById(id);
    if (!cryptEl) continue;
    cryptEl.addEventListener('click', onSocialClick);
    cryptEl.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-soc-action="submit-comment"]');
      if (f) { e.preventDefault(); submitCommentForm(f); return; }
      const ef = e.target.closest('[data-soc-action="submit-comment-edit"]');
      if (ef) { e.preventDefault(); submitCommentEdit(ef); return; }
      const pf = e.target.closest('[data-soc-action="add-poll-option"]');
      if (pf) { e.preventDefault(); onAddPollOption(pf); }
    });
    cryptEl.addEventListener('change', onCommentPhotoPick);
    cryptEl.addEventListener('error', (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG' || img.dataset.fellBack) return;
      img.dataset.fellBack = '1';
      const slot = img.closest('.soc-top8-photo');
      if (slot) { slot.innerHTML = '<span class="no-photo">🖤</span>'; return; }
      const photo = img.closest('.soc-post-photo, .soc-comment-photo');
      if (photo) { photo.remove(); }
    }, true);
  }

  // Search (debounced) on the friends sub-tab.
  document.getElementById('social-view').addEventListener('input', async (e) => {
    if (e.target.id !== 'soc-search-input') return;
    state.socSearchQuery = e.target.value.trim();
    clearTimeout(wireSocialEvents._t);
    wireSocialEvents._t = setTimeout(async () => {
      state.socSearch = state.socSearchQuery ? await data.searchUsers(state.socSearchQuery).catch(() => []) : [];
      if (state.socSubTab === 'friends' && !state.socProfile) renderFriends();
    }, 250);
  });

  // Comment/reply 📷 picks anywhere in the social view (0090).
  document.getElementById('social-view').addEventListener('change', onCommentPhotoPick);

  // Comment submit + compose/profile/top8 forms (submit events).
  document.getElementById('social-view').addEventListener('submit', (e) => {
    const f = e.target.closest('[data-soc-action="submit-comment"]');
    if (f) { e.preventDefault(); submitCommentForm(f); return; }
    const ef = e.target.closest('[data-soc-action="submit-comment-edit"]');
    if (ef) { e.preventDefault(); submitCommentEdit(ef); return; }
    const pf = e.target.closest('[data-soc-action="add-poll-option"]');
    if (pf) { e.preventDefault(); onAddPollOption(pf); return; }
    const df = e.target.closest('[data-soc-action="submit-dm"]');
    if (df) { e.preventDefault(); submitDmForm(df); }
  });

  // Graceful image fallback. `error` doesn't bubble, so listen in the
  // capture phase. A broken Top 8 image collapses to the 🖤 placeholder;
  // a broken post photo drops its block — no broken-image icons.
  document.getElementById('social-view').addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.fellBack) return;
    img.dataset.fellBack = '1';
    const slot = img.closest('.soc-top8-photo');
    if (slot) { slot.innerHTML = '<span class="no-photo">🖤</span>'; return; }
    const photo = img.closest('.soc-post-photo, .soc-comment-photo');
    if (photo) { photo.remove(); }
  }, true);
  document.getElementById('social-modal').addEventListener('submit', (e) => {
    if (e.target.id === 'soc-compose-form') submitComposer(e);
    else if (e.target.id === 'soc-edit-form') submitPostEdit(e);
    else if (e.target.id === 'soc-profile-form') submitEditProfile(e);
  });

  // File pickers inside the modal — compress + stash the blob. Each photo
  // input has a matching `<id>-name` span for the chosen-file label.
  document.getElementById('social-modal').addEventListener('change', async (e) => {
    if (['soc-compose-photo', 'soc-avatar', 'soc-edit-photo'].includes(e.target.id)) {
      const file = e.target.files?.[0];
      if (!file) { state.socComposePhoto = null; return; }
      try {
        state.socComposePhoto = await compressImage(file);
        const label = document.getElementById(e.target.id + '-name');
        if (label) label.textContent = '✓ ' + file.name;
      } catch (err) { console.warn('compress', err); toast('Could not read that image.'); }
    } else if (e.target.classList.contains('soc-pick-file')) {
      // A per-bun Top 8 photo upload.
      const cell = e.target.closest('.soc-pick-cell');
      const btn = cell?.querySelector('.soc-pick');
      const file = e.target.files?.[0];
      if (!file || !btn) return;
      try {
        const blob = await compressImage(file);
        (state.top8PhotoBlobs ||= {})[btn.dataset.name] = blob;
        // Show it right away, and treat uploading as picking this bun.
        const photo = btn.querySelector('.soc-pick-photo');
        if (photo) photo.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="" />`;
        if (!btn.classList.contains('picked')
            && document.querySelectorAll('.soc-pick.picked').length < 8) {
          btn.classList.add('picked');
          refreshTop8Ranks();
        }
      } catch (err) { console.warn('top8 pick photo', err); toast('Could not read that image.'); }
    }
  });
}

async function loadMyProfileCache() {
  try {
    const [profile, posts, top8, relics] = await Promise.all([
      data.getSocialProfile(window.currentUser.id),
      data.listUserPosts(window.currentUser.id),
      data.getTopPlushes(window.currentUser.id),
      data.listRelics(window.currentUser.id),
    ]);
    state._myBio = profile?.bio || '';
    state._myDisplayName = profile?.displayName || null;
    state._myAvatarUrl = profile?.avatarUrl || null;
    state._mySocialLinks = profile?.socialLinks || {};
    state._myDefaultItemVisibility = profile?.defaultItemVisibility || 'inner';
    state._myPosts = posts;
    state._myTop8 = top8;
    state._myRelics = relics;
  } catch (e) { console.warn('loadMyProfileCache', e); }
}

function onSocialModalClick(e) {
  if (e.target.closest('[data-close-social]')) { closeSocialModal(); return; }
  const cam = e.target.closest('[data-soc-cam]');
  if (cam) {
    // Open the hidden file input paired with this bun's tile.
    cam.parentElement.querySelector('.soc-pick-file')?.click();
    return;
  }
  const pick = e.target.closest('[data-soc-pick]');
  if (pick) {
    const isPicked = pick.classList.contains('picked');
    if (!isPicked && document.querySelectorAll('.soc-pick.picked').length >= 8) {
      toast('That\'s 8 — remove one first.');
      return;
    }
    pick.classList.toggle('picked');
    refreshTop8Ranks();
    return;
  }
  const action = e.target.closest('[data-soc-action]')?.dataset.socAction;
  if (action === 'save-top8') { saveTop8(); return; }
  // Poll composer controls (0079).
  if (action === 'poll-toggle') {
    const fields = document.getElementById('soc-poll-fields');
    const btn = e.target.closest('.soc-poll-toggle');
    if (fields) {
      const turningOn = fields.hasAttribute('hidden');
      fields.toggleAttribute('hidden', !turningOn);
      if (btn) btn.textContent = turningOn ? '📊 Remove poll' : '📊 Add a poll';
    }
    return;
  }
  if (action === 'poll-add-option-row') {
    const wrap = document.getElementById('soc-poll-options');
    if (wrap && wrap.querySelectorAll('.soc-poll-opt-row').length >= 8) { toast('Up to 8 options.'); return; }
    wrap?.insertAdjacentHTML('beforeend', pollOptionRow());
    return;
  }
  if (action === 'poll-remove-option-row') {
    const wrap = document.getElementById('soc-poll-options');
    const row = e.target.closest('.soc-poll-opt-row');
    if (wrap && wrap.querySelectorAll('.soc-poll-opt-row').length <= 2) { toast('A poll needs at least 2 options.'); return; }
    row?.remove();
    return;
  }
}

async function onSocialClick(e) {
  // Tapping anywhere outside an open reaction picker dismisses it (Facebook-style).
  if (!e.target.closest('.soc-react-wrap')) {
    document.querySelectorAll('.soc-react-palette.open').forEach((p) => p.classList.remove('open'));
  }
  // Same for an open kebab (⋯) menu.
  if (!e.target.closest('.soc-menu-wrap')) {
    document.querySelectorAll('.soc-menu.open').forEach((m) => m.classList.remove('open'));
  }
  const target = e.target.closest('[data-soc-action]');
  if (!target) return;
  const a = target.dataset.socAction;
  const uid = target.dataset.uid;
  const postId = target.dataset.postId;

  // Choosing any menu item closes the menu (the toggle itself is exempt).
  if (a !== 'toggle-menu') {
    document.querySelectorAll('.soc-menu.open').forEach((m) => m.classList.remove('open'));
  }

  switch (a) {
    case 'open-compose': openComposer(); break;
    case 'go-friends': setSocSubTab('friends'); break;
    case 'gift-accept': await respondToGift(target.dataset.giftId, true); break;
    case 'gift-decline': await respondToGift(target.dataset.giftId, false); break;
    case 'gift-cancel': await cancelPendingGift(target.dataset.giftId); break;
    case 'open-dm': await openDm(uid, target.dataset.name); break;
    case 'dm-back': closeDm(); break;
    case 'share-app': await shareApp(); break;
    case 'view-profile': await openProfile(uid); break;
    case 'close-profile': closeProfileToFeed(); break;
    case 'edit-profile': closeSocialModal(); openAccountModal(); break;
    case 'edit-top8': openTop8Picker(); break;
    case 'zoom-top8': openLightbox(target.dataset.src, target.dataset.name); break;
    case 'zoom-comment-photo': openLightbox(target.dataset.src, target.dataset.name || ''); break;
    case 'view-relic': openRelicCard(target.dataset.relicKey, target.dataset.earnedAt); break;

    case 'toggle-menu': {
      const id = target.dataset.menu;
      const menu = document.querySelector(`.soc-menu[data-menu="${id}"]`);
      document.querySelectorAll('.soc-menu.open').forEach((m) => { if (m !== menu) m.classList.remove('open'); });
      if (menu) menu.classList.toggle('open');
      break;
    }
    case 'hide-post': onHidePost(postId); break;
    case 'hide-comment': onHideComment(target.dataset.commentId); break;

    case 'react-post': await onReactPost(target.dataset.postId, target.dataset.emoji); break;
    case 'vote-poll': await onVotePoll(target.dataset.postId, target.dataset.optionId, target.dataset.on === '1', target.dataset.multi === '1'); break;
    case 'toggle-comments': onToggleComments(postId); break;
    case 'edit-post': openPostEditor(postId); break;
    case 'delete-post': await onDeletePost(postId); break;
    case 'delete-comment': await onDeleteComment(target.dataset.commentId); break;
    case 'edit-comment':
      state.socEditComment = target.dataset.commentId;
      state.socReplyTo = null;
      rerenderSocialCurrent();
      break;
    case 'cancel-edit-comment':
      state.socEditComment = null;
      rerenderSocialCurrent();
      break;
    case 'react-comment': await onReactComment(target.dataset.commentId, target.dataset.emoji); break;
    case 'toggle-react-comment': await onToggleCommentReaction(target.dataset.commentId); break;
    case 'toggle-react-palette': {
      // Keyed by comment id on replies, post id on posts — same picker markup.
      const pal = document.querySelector(`[data-react-palette="${target.dataset.paletteId || target.dataset.commentId}"]`);
      // Only one picker open at a time.
      document.querySelectorAll('.soc-react-palette.open').forEach((p) => { if (p !== pal) p.classList.remove('open'); });
      if (pal) pal.classList.toggle('open');
      break;
    }
    case 'reply-comment': {
      const cid = target.dataset.commentId;
      const opening = state.socReplyTo !== cid;
      state.socReplyTo = opening ? cid : null;
      // Make sure the thread is expanded so the reply box is visible.
      if (postId) state.socExpandedComments.add(postId);
      rerenderSocialCurrent();
      // Expanding the thread + rebuilding the whole feed leaves the freshly
      // opened reply box off-screen, so the user had to hunt for it. Bring it
      // to them and focus it after the DOM settles. preventScroll keeps focus
      // from fighting our own scrollIntoView.
      if (opening) {
        requestAnimationFrame(() => {
          const input = document.querySelector(`.soc-reply-form[data-parent-id="${cid}"] .soc-comment-input`);
          if (input) {
            input.scrollIntoView({ block: 'center' });
            input.focus({ preventScroll: true });
          }
        });
      }
      break;
    }
    case 'view-mention': {
      const id = await data.findUserIdByUsername(target.dataset.username);
      if (id) await openProfile(id);
      else toast(`No collector named @${target.dataset.username}.`);
      break;
    }

    case 'add-friend':    await socFriendAction(() => data.sendFriendRequest(uid), 'Friend request sent.'); break;
    case 'accept-friend': await socFriendAction(() => data.acceptFriendRequest(uid), 'Friend added. 🦇'); break;
    case 'decline-friend':await socFriendAction(() => data.removeFriend(uid), 'Request declined.'); break;
    case 'remove-friend': await socFriendAction(() => data.removeFriend(uid), 'Removed.'); break;
    case 'toggle-inner':  await socFriendAction(() => data.setInner(uid, target.dataset.on === '1'), 'Castle Crew updated. 🏰'); break;
    case 'toggle-coffin': await socFriendAction(() => data.setCoffinBuddy(uid, target.dataset.on === '1'), 'Coffin Buddies updated. ⚰️'); break;

    case 'block-user':    await onBlockUser(uid, target.dataset.name); break;
    case 'unblock-user':  await onUnblockUser(uid, target.dataset.name); break;
    case 'report-post':   openReportModal('post', postId, target.dataset.owner, target.dataset.name); break;
    case 'report-comment':openReportModal('comment', target.dataset.commentId, target.dataset.owner, target.dataset.name); break;
    case 'report-user':   openReportModal('user', uid, uid, target.dataset.name); break;
  }
}

// Block: confirm (it severs friendship + circles), then refresh.
async function onBlockUser(uid, name) {
  const who = name ? `@${name}` : 'this collector';
  // Admins + the redrambler moderator can't be blocked (DB-enforced). Guard
  // here too so the rare path that still surfaces a button fails gracefully.
  if (data.isUnblockable({ username: name })) {
    toast(`${who} can't be blocked.`);
    return;
  }
  if (!await socConfirm({
    title: `Block ${who}?`,
    body: "You won't see each other's posts, comments, or profiles, any friendship is removed, and neither of you can start a trade with the other.",
    confirmLabel: 'Block', danger: true,
  })) return;
  try {
    await data.blockUser(uid);
    toast(`Blocked ${who}. 🚫`);
    // Re-pull the feed/friends so their content drops out immediately.
    await loadSocialData();
    if (state.socProfile && !state.socProfile.isMe) state.socProfile = null;
    renderSocial();
    updateSocialBadge();
  } catch (e) { console.error('block', e); toast('Could not block.'); }
}

async function onUnblockUser(uid, name) {
  try {
    await data.unblockUser(uid);
    toast(`Unblocked${name ? ` @${name}` : ''}.`);
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else renderSocial();
  } catch (e) { console.error('unblock', e); toast('Could not unblock.'); }
}

// ─── Reporting ──────────────────────────────────────────────────────
const REPORT_REASONS = [
  ['spam',        'Spam or scam'],
  ['harassment',  'Harassment or bullying'],
  ['hate',        'Hate or violence'],
  ['sexual',      'Sexual or inappropriate content'],
  ['impersonation','Impersonation'],
  ['other',       'Something else'],
];

function openReportModal(targetType, targetId, ownerId, name) {
  state.reportTarget = { targetType, targetId, ownerId, name };
  const labels = { post: 'post', comment: 'comment', user: 'collector' };
  document.getElementById('report-title').textContent =
    `Report ${labels[targetType] || 'content'}${name ? ` by @${name}` : ''}`;
  const sel = document.getElementById('report-reason');
  sel.innerHTML = REPORT_REASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  document.getElementById('report-details').value = '';
  showEl('report-modal');
}

async function submitReport(e) {
  e.preventDefault();
  const t = state.reportTarget;
  if (!t) return;
  const reason = document.getElementById('report-reason').value;
  const details = document.getElementById('report-details').value.trim();
  const btn = document.getElementById('report-submit');
  btn.disabled = true;
  try {
    await data.reportContent({
      targetType: t.targetType,
      targetId: t.targetId,
      targetOwnerId: t.ownerId,
      reason,
      details,
    });
    hideEl('report-modal');
    state.reportTarget = null;
    toast('Thanks — report sent to the crypt-keepers. 🦇');
  } catch (err) {
    console.error('report', err);
    toast('Could not send that report.');
  } finally {
    btn.disabled = false;
  }
}

// Run a friend-graph mutation, then refresh the relevant views + badge.
async function socFriendAction(fn, okMsg) {
  try {
    await fn();
    toast(okMsg);
    await loadSocialData();
    if (state.socProfile) {
      await openProfile(state.socProfile.profile.id);   // refresh the open profile
    } else {
      renderSocial();
    }
    updateSocialBadge();
  } catch (e) {
    console.error('friend action', e);
    toast(e.message === 'duplicate key value violates unique constraint "friendships_pkey"'
      ? 'Already requested.' : 'Could not complete that.');
  }
}

// Pick a reaction on a post. Mutually exclusive per user (same as comments):
// tapping the one you already have removes it; a different one swaps it. The
// (post_id, user_id) PK means the swap is a single upsert (see data.reactPost).
async function onReactPost(postId, emoji) {
  const post = findFeedPost(postId);
  const mineEmoji = post && (post.reactions || []).find((r) => r.mine)?.emoji;
  try {
    if (mineEmoji === emoji) await data.reactPost(postId, emoji, false);
    else await data.reactPost(postId, emoji, true);
    await refreshAfterReaction();
  } catch (e) { reactionError(e); }
}

// Cast, change, or remove a poll vote (0079). `on` says whether the tap should
// add the vote (false = I'm un-voting the option I already chose). Single-choice
// swaps happen in data.votePoll; here we just guard against a closed poll and
// re-render with fresh tallies.
async function onVotePoll(postId, optionId, on, multi) {
  const post = findFeedPost(postId);
  if (post?.poll?.closed) { toast('This poll has ended.'); return; }
  try {
    await data.votePoll(postId, optionId, on, multi);
    await refreshAfterReaction();
  } catch (e) { console.error('votePoll', e); toast('Could not record your vote.'); }
}

async function onAddPollOption(form) {
  const input = form.querySelector('.soc-poll-addinput');
  const label = input?.value.trim();
  if (!label) return;
  try {
    await data.addPollOption(form.dataset.postId, label);
    if (input) input.value = '';
    await refreshAfterReaction();
  } catch (e) { console.error('addPollOption', e); toast('Could not add that option.'); }
}

function onToggleComments(postId) {
  if (state.socExpandedComments.has(postId)) state.socExpandedComments.delete(postId);
  else state.socExpandedComments.add(postId);
  rerenderSocialCurrent();
}

// A comment form's 📷 pick (0090): compress + stash the blob on the form and
// swap the icon for a thumbnail so you can see what's about to be attached.
// Re-tapping opens the picker again; cancelling it clears the pending photo.
async function onCommentPhotoPick(e) {
  if (!e.target.classList?.contains('soc-comment-photo-input')) return;
  const form = e.target.closest('form');
  const ico = form?.querySelector('.soc-comment-photo-ico');
  if (!form || !ico) return;
  const file = e.target.files?.[0];
  if (!file) {
    form._photoBlob = null;
    ico.textContent = '📷';
    return;
  }
  try {
    form._photoBlob = await compressImage(file);
    ico.innerHTML = `<img class="soc-comment-photo-thumb" src="${URL.createObjectURL(form._photoBlob)}" alt="Photo attached" />`;
  } catch (err) {
    console.warn('compress', err);
    form._photoBlob = null;
    ico.textContent = '📷';
    toast('Could not read that image.');
  }
}

async function submitCommentForm(form) {
  const input = form.querySelector('.soc-comment-input');
  const body = input.value.trim();
  const photoBlob = form._photoBlob || null;   // set by the 📷 picker (0090)
  if (!body && !photoBlob) return;
  const postId = form.dataset.postId;
  const parentId = form.dataset.parentId || null;
  try {
    await data.addComment(postId, body, parentId, photoBlob);
    // Clear only after the write succeeds — clearing up front lost the user's
    // typed comment when the request failed.
    input.value = '';
    form._photoBlob = null;
    state.socReplyTo = null;
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('comment', e); toast('Could not comment.'); }
}

// Save an edit to one of my own comments (item 25).
async function submitCommentEdit(form) {
  const input = form.querySelector('.soc-comment-input');
  const body = input.value.trim();
  const commentId = form.dataset.commentId;
  if (!body) { toast('A comment can’t be empty.'); return; }
  try {
    await data.editComment(commentId, body);
    state.socEditComment = null;
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('edit comment', e); toast('Could not save your edit.'); }
}

// Find the comment object behind a chip/picker, wherever it's rendered.
function findCommentEverywhere(commentId) {
  const post = state.socFeed.find((p) => (p.comments || []).some((c) => commentHasId(c, commentId)))
    || (state.socProfile?.posts || []).find((p) => (p.comments || []).some((c) => commentHasId(c, commentId)));
  return post ? findCommentById(post.comments, commentId) : null;
}

// Pick a specific reaction from the picker. Reactions are mutually exclusive
// per user (Facebook-style): tapping the one you already have removes it;
// tapping a different one swaps your old reaction for the new one.
async function onReactComment(commentId, emoji) {
  const c = findCommentEverywhere(commentId);
  const mineEmoji = c && (c.reactions || []).find((r) => r.mine)?.emoji;
  try {
    if (mineEmoji === emoji) {
      await data.toggleCommentReaction(commentId, emoji, false);
    } else {
      if (mineEmoji) await data.toggleCommentReaction(commentId, mineEmoji, false);
      await data.toggleCommentReaction(commentId, emoji, true);
    }
    await refreshAfterReaction();
  } catch (e) { reactionError(e); }
}

// Tapping the reaction-summary pill (or the Like link once you've reacted):
// remove my reaction if I have one, otherwise add the default 🖤 Like. This is
// the "increment by tapping / remove by one if already liked" behaviour.
async function onToggleCommentReaction(commentId) {
  const c = findCommentEverywhere(commentId);
  const mineEmoji = c && (c.reactions || []).find((r) => r.mine)?.emoji;
  try {
    if (mineEmoji) await data.toggleCommentReaction(commentId, mineEmoji, false);
    else await data.toggleCommentReaction(commentId, SOC_REACTION_DEFAULT, true);
    await refreshAfterReaction();
  } catch (e) { reactionError(e); }
}

async function refreshAfterReaction() {
  await loadSocialData();
  if (state.socProfile) await openProfile(state.socProfile.profile.id);
  else rerenderSocialCurrent();
}

function reactionError(e) {
  console.error('react', e);
  toast(/comment_reactions/i.test(e?.message || '')
    ? 'Run the latest migration (db/0032_comment_social.sql).'
    : 'Could not react.');
}

function commentHasId(c, id) { return findCommentById([c], id) != null; }
function findCommentById(list, id) {
  for (const c of (list || [])) {
    if (c.id === id) return c;
    const found = findCommentById(c.replies, id);
    if (found) return found;
  }
  return null;
}

async function onDeletePost(postId) {
  const post = findFeedPost(postId);
  const mod = post && !post.mine && window.currentUser?.canModerate;
  if (!await socConfirm({
    title: 'Delete this post?',
    body: mod ? "You're removing another collector's post as a moderator. This can't be undone."
              : "This can't be undone.",
    confirmLabel: 'Delete', danger: true,
  })) return;
  try {
    await data.deletePost(postId);
    toast('Post deleted.');
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('delete post', e); toast('Could not delete.'); }
}

async function onDeleteComment(commentId) {
  if (!await socConfirm({
    title: 'Delete this comment?',
    body: "This can't be undone.",
    confirmLabel: 'Delete', danger: true,
  })) return;
  try {
    await data.deleteComment(commentId);
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('delete comment', e); toast('Could not delete comment.'); }
}

// Find a post in whichever list is currently displayed (feed or an open
// profile) so optimistic updates can mutate it in place.
function findFeedPost(postId) {
  if (state.socProfile) return state.socProfile.posts.find((p) => p.id === postId);
  return state.socFeed.find((p) => p.id === postId);
}

function rerenderSocialCurrent() {
  renderSocial();
}

// The auth gate calls boot() again on SIGNED_IN / TOKEN_REFRESHED, so
// guard the one-time event wiring — re-attaching listeners would make
// every form submit (post, trade, etc.) fire twice. Data reloads below
// are safe to repeat.

// Full-screen "the crypt is resting" takeover for non-admins while an admin has
// maintenance mode on. Boot returns early after this, so the app never renders.
function showMaintenanceScreen(reason) {
  const el = document.getElementById('maintenance-overlay');
  if (!el) return;
  const r = document.getElementById('maint-reason');
  if (r) {
    r.textContent = (reason || '').trim();
    r.classList.toggle('hidden', !r.textContent);
  }
  el.classList.remove('hidden');
  document.body.classList.add('maint-locked');
  window.removeBootSplash?.();   // takeover replaces the app — splash must not sit on top
}

// Full-screen takeover for a user an admin has blocked from the entire app
// (db/0046 profiles.app_blocked). Like maintenance mode, boot returns early
// after this, so the app never renders for them.
function showBlockedScreen() {
  const el = document.getElementById('blocked-overlay');
  if (!el) { showMaintenanceScreen(''); return; } // fail closed onto the generic takeover
  el.classList.remove('hidden');
  document.body.classList.add('maint-locked');
  window.removeBootSplash?.();
}

// Full-screen "your account has been deleted" takeover for a user who asked to
// delete their account (db/0068 profiles.deletion_requested_at). To them the
// account is gone; really it's queued for admin review. Boot returns early so
// the app never renders for them — the strongest form of the illusion.
function showDeletedScreen() {
  const el = document.getElementById('deleted-overlay');
  if (!el) { showBlockedScreen(); return; } // fail closed onto the block takeover
  el.classList.remove('hidden');
  document.body.classList.add('maint-locked');
  window.removeBootSplash?.();
}

let eventsWired = false;
async function boot() {
  if (!eventsWired) {
    // Set the flag FIRST: if wiring throws partway, a later boot() must
    // not re-run it and stack a second set of listeners on everything
    // that did bind (which is how the theme toggle ends up double-firing).
    eventsWired = true;
    wireEvents();
    wireSocialEvents();
  }
  loadFilters();                  // restore filter state + active tab from localStorage
  await data.loadActiveCollection();
  await handleJoinToken();        // ?join=<token> redeems and switches in
  await data.migrateFromIDB();    // one-time IDB → Supabase upload per account
  await data.loadAppSettings();   // feature flags (e.g. user photo uploads)
  // Deletion gate: a user who asked to delete their account (db/0068) never
  // boots — they get the "deleted" takeover. Checked first so a departing user
  // always sees the goodbye, not a block or "resting" screen. canModerate
  // (admin or moderator) is exempt so staff can't lock themselves out.
  if (window.currentUser?.pendingDeletion && !window.currentUser?.canModerate) {
    showDeletedScreen();
    return;
  }
  // App-block gate: a user an admin has fully blocked (db/0046) never boots —
  // they get a removal takeover instead. Checked before maintenance so a
  // blocked user sees the block, not the "resting" screen.
  if (window.currentUser?.appBlocked && !window.currentUser?.isAdmin) {
    showBlockedScreen();
    return;
  }
  // Maintenance gate: if an admin has taken the crypt down, show everyone but
  // admins a "resting" screen (with the reason) instead of booting the app.
  if (data.appSettings['maintenance.enabled'] === true && !window.currentUser?.isAdmin) {
    showMaintenanceScreen(data.appSettings['maintenance.reason']);
    return;
  }
  applyFeatureFlags();
  // First paint, before any section data is in hand: with state.ready still
  // empty every tab renders its "Summoning…" loading placeholder instead of a
  // blank shell (or, worse, a misleading "nothing here" empty-state) during
  // the loads below. The real render() further down replaces it once data
  // lands. Guarded so a render hiccup never aborts boot.
  try { render(); } catch (e) { console.warn('initial loading paint skipped', e); }
  // The shell + "Summoning…" placeholders are up — drop the boot splash
  // (index.html). Fires even if that paint failed: whatever the page shows
  // now beats a stuck splash.
  window.removeBootSplash?.();
  // These four loads are independent once the active collection is known —
  // run them concurrently instead of a serial await waterfall (~4 round
  // trips → 1). pens-meta keeps its own tolerance so a miss doesn't abort
  // the rest; the others reject boot the same way the serial awaits did.
  let pensOwned;
  await Promise.all([
    loadAll(),
    data.listPens().then((p) => { pensOwned = p; }),
    data.listPenMeta().then((m) => { state.pensMeta = m; }).catch((e) => console.warn('pens meta load skipped', e)),
    loadTradeData(),
  ]);
  state.pensOwned = pensOwned;
  render();
  // Social is the landing tab — load its feed/friends/requests and
  // repaint when ready (also fires friend-request notifications + badge).
  loadSocialData().then(() => {
    updateSocialBadge();
    // Repaint whatever tab we're on — social data includes pending gifts, whose
    // tray lives at the top of My Crypt. Without this, a recipient who taps a
    // gift notification lands on the crypt tab, which was painted before gifts
    // loaded, so the Accept/Decline tray never showed until some other repaint.
    render();
    if (state.tab === 'home') renderSocial();
  });
  scheduleSocialCheck();  // keep polling for new requests while the app is open
  subscribeNotificationStream();  // realtime: hear our notification rows instantly (db/0087)
  refreshNotifBell().catch((e) => console.warn('notif bell', e));  // 🔔 inbox badge
  data.claimTimeRelics?.();  // time-based relics (year-one) — fire-and-forget (db/0088)
  updateNotifyButton();
  registerSW();
  // Notifications default to ON: subscribe now if the OS already permits it,
  // otherwise arm a one-shot permission prompt for the first user gesture. An
  // explicit OFF (notify_enabled === false) or an OS-level block is respected.
  // For an already-granted first-time user this sets notify_enabled = true, so
  // the reminder scheduler below picks it up this same boot.
  await maybeAutoEnableNotifications();
  const notifyEnabled = await idb.getMeta('notify_enabled');
  // Catalog: ship the baked copy immediately, then try to refresh from live
  // Shopify in the background. Falls back silently if CORS or network blocks it.
  loadCatalog().then(() => {
    // Re-render whatever tab we're on, not just Catalog: category-derived
    // chrome (the rail identity "N buns in the crypt", crypt sub-tab counts,
    // vitals) joins collection items to the catalog via itemCategory(), so
    // everything computed before this point counted 0 buns and would stay
    // stale until the next unrelated repaint.
    render();
    refreshCatalogLive();
    scheduleCatalogRefresh();   // keep the live catalog fresh in long-open sessions

    // Restock reminders cross-reference the live catalog for retirement, so
    // only start checking once it's loaded — otherwise retired wishlist items
    // would wrongly nag (the catalog isn't in hand yet at boot).
    if (notifyEnabled) scheduleReminderCheck();
  });
  // If we were opened by tapping a notification (./#trade etc.), land on that
  // tab — after loadFilters/render have restored the previous tab, so this wins.
  handleNotificationHash();
}

// Legal modal works on the pre-sign-in auth overlay too, so wire it up
// immediately rather than waiting for boot() (which is gated behind auth).
wireLegalModal();

// ?share=TOKEN (db/0089): a read-only public wish list / crypt page. It
// replaces the auth gate for this visit — no account needed to look. The
// page's join CTA links back to ./ which boots the normal gated app.
const _shareToken = new URLSearchParams(window.location.search).get('share');
if (_shareToken) {
  renderSharedListPage(_shareToken).catch((e) => {
    console.error('share page', e);
    window.removeBootSplash?.();
  });
} else {
  // Gate the app behind sign-in + profile. The auth overlay handles its own
  // UI; once both exist, runAuthGate's callback fires and the app boots.
  runAuthGate(() => {
    // Record this visit for the admin "last seen" column. Fire-and-forget.
    data.touchLastSeen?.();
    // Retention instrument (db/0078): one deduped 'app_open' per visit.
    data.trackSession?.();
    boot().catch((e) => {
      console.error(e);
      toast('Something went wrong loading the app.');
    });
  }).catch((e) => {
    console.error('auth bootstrap', e);
  });
}
