// Stylegram web client: a hash-routed single-page app over the JSON API.
import { icons } from "./icons.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $("#view");
const state = { token: store("token"), me: null, categories: [] };

// ---- Utilities -------------------------------------------------------------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch { return null; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Escape text, then turn @mentions and #hashtags into links. */
function rich(text) {
  return esc(text)
    .replace(/(^|\s)@([a-z0-9._]{3,30})/gi, (_, sp, u) => `${sp}<a class="mention" href="#/u/${u.toLowerCase()}">@${u}</a>`)
    .replace(/(^|\s)#([\p{L}\p{N}_]{1,40})/gu, (_, sp, t) => `${sp}<a class="mention" href="#/explore?q=${encodeURIComponent("#" + t)}">#${t}</a>`);
}

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = isError ? "error" : "";
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3200);
}

async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  } catch {
    const err = new Error(navigator.onLine === false ? "You're offline. Check your connection and try again." : "Couldn't reach Stylegram. Check your connection and try again.");
    err.offline = true;
    throw err;
  }
  if (res.headers.get("X-Offline-Cache") && !api.offlineNoticeShown) {
    api.offlineNoticeShown = true;
    toast("You're offline. Showing what you saw last time.");
  }
  if (!res.headers.get("X-Offline-Cache")) api.offlineNoticeShown = false;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && state.token && path !== "/auth/login") logout(false);
    const d = data?.error?.details?.[0];
    throw new Error(d ? `${d.path ? d.path + ": " : ""}${d.message}` : data?.error?.message ?? res.statusText);
  }
  return data;
}

const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { toast(e.message, true); }
};

const n = (x) => Number(x).toLocaleString();
const plural = (x, word) => `${n(x)} ${word}${x === 1 ? "" : "s"}`;

function ago(iso, long = false) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units = [[31536000, "y", "year"], [604800, "w", "week"], [86400, "d", "day"], [3600, "h", "hour"], [60, "m", "minute"]];
  for (const [secs, short, word] of units) {
    if (s >= secs) {
      const v = Math.floor(s / secs);
      return long ? `${v} ${word}${v === 1 ? "" : "s"} ago` : `${v}${short}`;
    }
  }
  return long ? "just now" : "now";
}

function avatar(u, size = 32, { ring = false } = {}) {
  const style = `style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px"`;
  const inner = u?.avatarUrl
    ? `<img class="avatar" ${style} src="${esc(u.avatarUrl)}" alt="" loading="lazy" />`
    : `<span class="avatar" ${style}>${esc((u?.displayName || u?.username || u?.name || "?")[0].toUpperCase())}</span>`;
  return ring ? `<span class="ring">${inner}</span>` : inner;
}
const vf = (on) => (on ? icons.verified() : "");
const money = (p) => (p?.price ? `${p.currency === "USD" ? "$" : p.currency + " "}${p.price}` : "");
const spinner = () => `<div class="loading"><div class="spinner"></div></div>`;

/** Bottom sheet on phones, centred dialog on larger screens. */
function sheet(html, { onClick } = {}) {
  closeSheets();
  const el = document.createElement("div");
  el.className = "sheet-backdrop";
  el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => e.key === "Escape" && close();
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-close]")) return close();
    onClick?.(e, close);
  });
  document.addEventListener("keydown", onKey);
  document.body.append(el);
  return close;
}
function closeSheets() { $$(".sheet-backdrop").forEach((s) => s.remove()); }

// ---- Install as an app (PWA) ------------------------------------------------

const install = {
  prompt: null, // Chrome/Edge/Android: the deferred beforeinstallprompt event
  standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  get canPrompt() { return Boolean(this.prompt); },
  get iosHint() { return this.ios && !this.standalone && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent); },
};

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  install.prompt = e;
  renderInstallBanner();
  renderChrome(currentPath());
});
window.addEventListener("appinstalled", () => {
  install.prompt = null;
  renderInstallBanner();
  renderChrome(currentPath());
  toast("Stylegram was added to your home screen.");
});

async function promptInstall() {
  if (install.prompt) {
    install.prompt.prompt();
    await install.prompt.userChoice.catch(() => {});
    install.prompt = null;
    renderInstallBanner();
    renderChrome(currentPath());
  } else if (install.iosHint) {
    iosInstallSheet();
  } else {
    sheet(`<div class="product-sheet"><h3>Install Stylegram</h3>
      <p class="muted">Open your browser's menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
      Installing needs a secure (https) address. On your own computer, http://localhost works too.</p>
      <div class="btns"><button class="btn" data-close>OK</button></div></div>`);
  }
}

function iosInstallSheet() {
  sheet(`<div class="product-sheet" style="text-align:center">
    <img src="/icons/apple-touch-icon.png" alt="" width="64" height="64" style="border-radius:14px;margin:0 auto 12px" />
    <h3>Add Stylegram to your Home Screen</h3>
    <ol class="ios-steps">
      <li>Tap the <b>Share</b> button ${icons.iosShare()} in Safari's toolbar.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>. Stylegram opens full-screen, like an app.</li>
    </ol>
    <div class="btns"><button class="btn" data-close>Got it</button></div></div>`);
}

function renderInstallBanner() {
  const el = $("#install-banner");
  const dismissed = store("installDismissed") === "1";
  const show = !install.standalone && !dismissed && (install.canPrompt || install.iosHint);
  el.hidden = !show;
  if (!show) return;
  el.innerHTML = `<button class="icon-btn x" data-dismiss aria-label="Dismiss">${icons.close()}</button>
    <img src="/icons/icon-192.png" alt="" width="40" height="40" />
    <div class="t"><div class="b">Stylegram</div><div class="muted small">Get the full-screen app on your phone</div></div>
    <button class="btn primary" data-install>${install.canPrompt ? "Install" : "Add"}</button>`;
}
$("#install-banner").addEventListener("click", (e) => {
  if (e.target.closest("[data-dismiss]")) { store("installDismissed", "1"); renderInstallBanner(); }
  else if (e.target.closest("[data-install]")) promptInstall();
});

const currentPath = () => (location.hash.slice(1) || "/").split("?")[0];

// ---- Chrome: sidebar, mobile top bar, tab bar ------------------------------

function renderChrome(path) {
  const me = state.me;
  const is = (p) => path === p;
  const item = (href, icon, label, active) =>
    `<a href="#${href}" class="${active ? "active" : ""}" title="${label}">${icon}<span class="label">${label}</span></a>`;
  const profileIcon = me ? avatar(me, 24) : icons.user();
  const brandLinks = (me?.ownedBrand?.verified ? item("/brand", icons.chart(is("/brand")), "Brand dashboard", is("/brand")) : "")
    + (me?.isAdmin ? item("/admin", icons.shield(), "Admin", is("/admin")) : "");

  $("#sidebar").innerHTML = `
    <a class="brand" href="#/"><span class="wordmark">Stylegram</span><span class="mini">${icons.bag()}</span></a>
    <nav>
      ${me ? item("/", icons.home(is("/")), "Home", is("/")) : ""}
      ${item("/explore?focus=1", icons.search(false), "Search", false)}
      ${item("/explore", icons.explore(is("/explore")), "Explore", is("/explore"))}
      ${me ? item("/new", `<span class="create-dot">${icons.create()}</span>`, "Create", is("/new")) : ""}
      ${me ? item("/saved", icons.bookmark(is("/saved")), "Closet", is("/saved")) : ""}
      ${brandLinks}
      ${me ? item(`/u/${me.username}`, profileIcon, "Profile", is(`/u/${me.username}`)) : item("/login", icons.user(), "Log in", is("/login"))}
    </nav>
    ${!install.standalone && install.canPrompt ? `<button class="item" id="install-app">${icons.download()}<span class="label">Install app</span></button>` : ""}
    ${me ? `<button class="item" id="more-menu">${icons.menu()}<span class="label">More</span></button>` : ""}`;
  $("#more-menu")?.addEventListener("click", moreMenu);
  $("#install-app")?.addEventListener("click", promptInstall);

  $("#mobile-top").innerHTML = `
    <a href="#/" class="wordmark" style="font-size:30px">Stylegram</a>
    <div class="actions">
      ${path === "/login" || path === "/signup" ? "" : me ? `${me.ownedBrand?.verified ? `<a class="icon-btn" href="#/brand" aria-label="Brand dashboard">${icons.chart()}</a>` : ""}
        ${me.isAdmin ? `<a class="icon-btn" href="#/admin" aria-label="Admin">${icons.shield()}</a>` : ""}
        <a class="icon-btn" href="#/new" aria-label="Create">${icons.create()}</a>`
        : `<a class="btn primary" href="#/login">Log in</a><a class="text-btn" style="margin-left:8px" href="#/signup">Sign up</a>`}
    </div>`;

  $("#tabbar").onclick = (e) => {
    const a = e.target.closest('a[href="#/"]');
    if (a && currentPath() === "/") { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); route(); }
  };
  $("#tabbar").innerHTML = me
    ? [
        `<a href="#/" class="${is("/") ? "active" : ""}" aria-label="Home">${icons.home(is("/"))}</a>`,
        `<a href="#/explore" class="${is("/explore") ? "active" : ""}" aria-label="Explore">${icons.search(is("/explore"))}</a>`,
        `<a href="#/new" class="create-tab" aria-label="Create"><span>${icons.create()}</span></a>`,
        `<a href="#/saved" class="${is("/saved") ? "active" : ""}" aria-label="Closet">${icons.bookmark(is("/saved"))}</a>`,
        `<a href="#/u/${esc(me.username)}" class="${is(`/u/${me.username}`) ? "active" : ""}" aria-label="Profile">${avatar(me, 26)}</a>`,
      ].join("")
    : "";
}

function moreMenu() {
  sheet(`<div class="menu-list">
      <a href="#/settings" data-close>Settings</a>
      <a href="#/saved" data-close>Closet</a>
      ${state.me.ownedBrand?.verified ? `<a href="#/brand" data-close>Brand dashboard</a>` : ""}
      ${!install.standalone && (install.canPrompt || install.iosHint) ? `<button data-install>Add Stylegram to Home Screen</button>` : ""}
      <button data-logout class="danger">Log out</button>
      <button data-close>Cancel</button></div>`,
    { onClick: (e, close) => {
      if (e.target.closest("[data-logout]")) { close(); logout(); }
      if (e.target.closest("[data-install]")) { close(); promptInstall(); }
    } });
}

// ---- Router ----------------------------------------------------------------

const routes = [
  [/^\/$/, () => (state.me ? homePage() : explorePage(new URLSearchParams()))],
  [/^\/explore$/, (q) => explorePage(q)],
  [/^\/login$/, () => authPage("login")],
  [/^\/signup$/, () => authPage("signup")],
  [/^\/new$/, requireLogin(createPage)],
  [/^\/p\/(\d+)$/, (id) => postPage(Number(id))],
  [/^\/u\/([\w.]+)$/, (u, q) => profilePage(u, q)],
  [/^\/b\/([\w-]+)$/, (slug, q) => brandPage(slug, q)],
  [/^\/saved$/, requireLogin(savedPage)],
  [/^\/settings$/, requireLogin(settingsPage)],
  [/^\/brand$/, requireLogin((q) => dashboardPage(q))],
  [/^\/admin$/, requireLogin(adminPage)],
];

function requireLogin(fn) {
  return (...a) => (state.me ? fn(...a) : (location.hash = "#/login"));
}

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  closeSheets();
  const [path, query = ""] = (location.hash.slice(1) || "/").split("?");
  renderChrome(path);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    view.innerHTML = spinner();
    try {
      await fn(...m.slice(1).map(decodeURIComponent), new URLSearchParams(query));
    } catch (e) {
      if (seq === routeSeq && e.offline) {
        const off = navigator.onLine === false;
        view.innerHTML = `<div class="grid-empty"><div class="circle-icon">${icons.wifiOff()}</div><div class="big">${off ? "You're offline" : "Can't connect right now"}</div>
          <p>${off ? "This page hasn't been saved for offline use yet. Reconnect to see it." : "Stylegram couldn't be reached. Pages you've already seen still open."}</p><button class="btn primary" id="retry">Try again</button></div>`;
        $("#retry").addEventListener("click", route);
      } else if (seq === routeSeq) view.innerHTML = `<div class="grid-empty"><div class="big">Sorry, this page isn't available.</div><p>${esc(e.message)}</p><a class="text-btn" href="#/">Go back to Stylegram</a></div>`;
    }
    if (seq === routeSeq) window.scrollTo(0, 0);
    return;
  }
  view.innerHTML = `<div class="grid-empty"><div class="big">Sorry, this page isn't available.</div><a class="text-btn" href="#/">Go back to Stylegram</a></div>`;
}
window.addEventListener("hashchange", route);

// ---- Auth ------------------------------------------------------------------

/** Saved offline data belongs to whoever was logged in: wipe it when that changes. */
function clearOfflineData() {
  if ("caches" in window) caches.delete("api-v1").catch(() => {});
}

function logout(redirect = true) {
  clearOfflineData();
  state.token = null;
  state.me = null;
  store("token", null);
  if (redirect) location.hash = "#/login";
  route();
}

async function loadMe() {
  if (!state.token) return;
  try { state.me = await api("/me"); } catch { state.me = null; }
}

function authPage(mode) {
  const signup = mode === "signup";
  view.innerHTML = `<div class="auth">
    <div class="box">
      <div class="wordmark">Stylegram</div>
      ${signup ? `<p class="tagline">Sign up to share your looks and shop what people are wearing.</p>
        <div class="seg"><button type="button" class="on" data-type="PERSONAL">Personal</button><button type="button" data-type="BRAND">Brand</button></div>` : ""}
      <form id="auth">
        ${signup ? `
          <input class="field" name="email" type="email" placeholder="Email" required autocomplete="email" />
          <input class="field" name="displayName" placeholder="Full Name" required maxlength="60" autocomplete="name" />
          <input class="field" name="username" placeholder="Username" required pattern="[A-Za-z0-9._]{3,30}" autocomplete="username" />
          <div id="brand-fields" hidden>
            <input class="field" name="brandName" placeholder="Brand name" maxlength="60" />
            <input class="field" name="website" type="url" placeholder="Official website (https://…)" />
          </div>` : `<input class="field" name="login" placeholder="Username or email" required autocomplete="username" />`}
        <input class="field" name="password" type="password" placeholder="Password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" />
        ${signup ? `<p class="fine" id="fine">People who use our service can see what you post and the brands you tag.</p>` : ""}
        <button class="btn primary block" style="margin-top:${signup ? 0 : 8}px">${signup ? "Sign up" : "Log in"}</button>
      </form>
      ${signup ? "" : `<div class="or">OR</div><a class="text-btn" href="#/explore" style="font-size:14px">Browse without an account</a>`}
    </div>
    <div class="box small-box">${signup ? `Have an account? <a class="text-btn" href="#/login">Log in</a>` : `Don't have an account? <a class="text-btn" href="#/signup">Sign up</a>`}</div>
  </div>`;
  let accountType = "PERSONAL";
  $$("[data-type]").forEach((b) => b.addEventListener("click", () => {
    accountType = b.dataset.type;
    $$("[data-type]").forEach((x) => x.classList.toggle("on", x === b));
    $("#brand-fields").hidden = accountType !== "BRAND";
    $$("#brand-fields input").forEach((i) => (i.required = accountType === "BRAND"));
    $("#fine").textContent = accountType === "BRAND"
      ? "Brand accounts are verified by our team before they can manage products and review tags."
      : "People who use our service can see what you post and the brands you tag.";
  }));
  $("#auth").addEventListener("submit", safe(async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const res = signup
      ? await api("/auth/register", { method: "POST", body: {
          username: f.username, email: f.email, password: f.password, displayName: f.displayName, accountType,
          brand: accountType === "BRAND" ? { name: f.brandName, website: f.website } : undefined } })
      : await api("/auth/login", { method: "POST", body: { login: f.login, password: f.password } });
    clearOfflineData();
    state.token = res.token;
    store("token", res.token);
    state.me = res.user;
    if (res.brand) toast(res.brand.status === "CLAIM_PENDING" ? "Your claim on this brand is waiting for review" : "Your brand is waiting for verification");
    location.hash = "#/";
  }));
}

// ---- Post component --------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Carousel: every slide uses the first photo's aspect (clamped like Instagram); tags live in a frame that matches each photo exactly. */
function mediaHtml(p) {
  const first = p.images[0];
  const R = clamp(first.width / first.height, 0.8, 1.91);
  const slides = p.images.map((img, i) => {
    const r = img.width / img.height;
    const [w, h] = r >= R ? [100, (R / r) * 100] : [(r / R) * 100, 100];
    const tags = img.tags.map((t) => {
      const above = t.y > 0.75 ? " above" : "";
      return `<button class="tagb ${t.status}${above}" style="left:${clamp(t.x, 0.12, 0.88) * 100}%;top:${t.y * 100}%" data-tag="${t.id}">
        <span class="t">${esc(t.brand.name)}</span><span class="s">${esc(t.product?.name ?? t.label)}${t.product?.price ? ` · ${esc(money(t.product))}` : ""}</span></button>`;
    }).join("");
    return `<div class="slide"><div class="frame" style="width:${w}%;height:${h}%">
      <img src="${esc(img.url)}" alt="Photo ${i + 1} by ${esc(p.author.username)}" ${i ? `loading="lazy"` : ""} draggable="false" />${tags}</div></div>`;
  }).join("");
  const multi = p.images.length > 1;
  return `<div class="media" style="aspect-ratio:${R}">
      <div class="track">${slides}</div>
      <div class="burst">${icons.heart(true)}</div>
      ${multi ? `<span class="count">1/${p.images.length}</span><button class="arrow prev" hidden aria-label="Previous">${icons.chevronLeft()}</button><button class="arrow next" aria-label="Next">${icons.chevronRight()}</button>` : ""}
      <button class="bag-btn" ${p.images[0].tags.length ? "" : "hidden"} aria-label="Show tagged products">${icons.bag(true)}</button>
    </div>
    ${multi ? `<div class="dots">${p.images.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}`;
}

function allTags(p) { return p.images.flatMap((img) => img.tags).filter((t) => t.status !== "REJECTED" || p.isMine); }

function shopStrip(p) {
  const tags = allTags(p);
  if (!tags.length) return "";
  return `<div class="shop-strip">${tags.map((t) => `
    <button class="shop-card" data-tag="${t.id}">
      <span class="logo">${t.brand.logoUrl ? `<img src="${esc(t.brand.logoUrl)}" alt="" />` : esc(t.brand.name[0])}</span>
      <span class="txt"><span class="b">${esc(t.brand.name)}${vf(t.brand.verified)}</span>
        <span class="p">${esc(t.product?.name ?? t.label)}${t.product?.price ? ` · ${esc(money(t.product))}` : ""}</span></span>
    </button>`).join("")}</div>`;
}

function likesLine(p) {
  if (p.likedBy && p.likes > 1) {
    return `${avatar(p.likedBy, 18)}Liked by <a class="b" href="#/u/${esc(p.likedBy.username)}">${esc(p.likedBy.username)}</a> and <span class="b">${plural(p.likes - 1, "other")}</span>`;
  }
  return p.likes ? plural(p.likes, "like") : `Be the first to <span class="b">like this</span>`;
}

function captionHtml(p) {
  if (!p.caption) return "";
  const long = p.caption.length > 125 || p.caption.split("\n").length > 2;
  const short = long ? p.caption.slice(0, 110).split("\n").slice(0, 2).join("\n") : p.caption;
  return `<p class="caption"><a class="b" href="#/u/${esc(p.author.username)}">${esc(p.author.username)}</a><span data-cap>${rich(short)}</span>${long ? `… <button class="more" data-more>more</button>` : ""}</p>`;
}

function postHeader(p) {
  return `<div class="post-head">
    <a href="#/u/${esc(p.author.username)}">${avatar(p.author, 32, { ring: true })}</a>
    <div class="who"><a class="b" href="#/u/${esc(p.author.username)}">${esc(p.author.username)}</a>${vf(p.author.brand?.verified)}
      <span class="muted"> • <a href="#/p/${p.id}">${ago(p.createdAt)}</a></span></div>
    <button class="icon-btn" data-menu aria-label="More options">${icons.more()}</button>
  </div>`;
}

function actionRow(p) {
  return `<div class="action-row">
    <button data-like class="${p.likedByMe ? "liked" : ""}" aria-label="${p.likedByMe ? "Unlike" : "Like"}">${icons.heart(p.likedByMe)}</button>
    <a href="#/p/${p.id}" aria-label="Comment">${icons.comment()}</a>
    <button data-share aria-label="Share">${icons.share()}</button>
    <span class="spacer"></span>
    <button data-save aria-label="${p.savedByMe ? "Remove from closet" : "Add to closet"}">${icons.bookmark(p.savedByMe)}</button>
  </div>`;
}

const commentLine = (c) => `<div class="c-line"><a class="b" href="#/u/${esc(c.author.username)}">${esc(c.author.username)}</a>${rich(c.body)}</div>`;

function feedPostHtml(p) {
  return `<article class="post" data-post="${p.id}">
    ${postHeader(p)}
    ${mediaHtml(p)}
    <div class="post-body">
      ${actionRow(p)}
      ${shopStrip(p)}
      <div class="likes">${likesLine(p)}</div>
      ${captionHtml(p)}
      ${p.comments > 2 ? `<a class="view-all" href="#/p/${p.id}">View all ${n(p.comments)} comments</a>` : ""}
      <div data-recent>${p.recentComments.map(commentLine).join("")}</div>
      ${state.me ? `<form class="add-comment"><input name="body" placeholder="Add a comment…" maxlength="1000" autocomplete="off" /><button class="text-btn" disabled>Post</button></form>` : ""}
    </div>
  </article>`;
}

function detailPostHtml(p) {
  return `<article class="post detail" data-post="${p.id}">
    <div class="media-col"><div>${mediaHtml(p)}</div></div>
    <div class="side">
      ${postHeader(p)}
      <div class="thread">
        ${p.caption ? `<div class="c">${avatar(p.author, 32, { ring: true })}<div class="body"><a class="b" href="#/u/${esc(p.author.username)}">${esc(p.author.username)}</a> ${rich(p.caption)}
          <div class="meta"><span>${ago(p.createdAt)}</span></div></div></div>` : ""}
        <div data-thread>${spinner()}</div>
      </div>
      <div class="foot post-body">
        ${actionRow(p)}
        ${shopStrip(p)}
        <div class="likes">${likesLine(p)}</div>
        <span class="when">${ago(p.createdAt, true)}</span>
        ${state.me ? `<form class="add-comment"><input name="body" placeholder="Add a comment…" maxlength="1000" autocomplete="off" /><button class="text-btn" disabled>Post</button></form>`
          : `<p class="muted small"><a class="text-btn" href="#/login">Log in</a> to like or comment.</p>`}
      </div>
    </div>
  </article>`;
}

function findTag(p, id) { return allTags(p).find((t) => t.id === Number(id)); }

function productSheet(t) {
  const p = t.product;
  sheet(`<div class="product-sheet">
    <div class="brandline"><span class="logo">${t.brand.logoUrl ? `<img src="${esc(t.brand.logoUrl)}" alt="" />` : esc(t.brand.name[0])}</span>
      <div><a class="b" href="#/b/${esc(t.brand.slug)}" data-close>${esc(t.brand.name)}</a>${vf(t.brand.verified)}
        <div class="muted small">${t.brand.verified ? "Verified brand" : "Community brand page"}</div></div></div>
    <h3>${esc(p?.name ?? t.label)}</h3>
    ${p?.price ? `<div class="price">${esc(money(p))}</div>` : ""}
    <div class="muted" style="text-transform:capitalize">${esc(t.category)}</div>
    <div style="margin-top:8px">${t.status === "CONFIRMED" ? `<span class="ok-badge">✓ Confirmed by ${esc(t.brand.name)}</span>`
      : t.status === "REJECTED" ? `<span class="bad-badge">${esc(t.brand.name)} says this isn't their item</span>`
      : `<span class="muted small">Tagged by the creator · not yet confirmed by the brand</span>`}</div>
    <div class="btns">
      ${t.shopUrl ? `<a class="btn primary" href="${esc(t.shopUrl)}" target="_blank" rel="noopener nofollow" data-close>${p ? "View on website" : `Shop ${esc(t.brand.name)}`}</a>` : ""}
      <a class="btn" href="#/b/${esc(t.brand.slug)}${p ? `?product=${p.id}` : ""}" data-close>${p ? "More looks with this item" : "See brand page"}</a>
      <button class="btn" data-close>Close</button>
    </div></div>`);
}

function postMenu(p, el) {
  const url = `${location.origin}/#/p/${p.id}`;
  sheet(`<div class="menu-list">
      ${p.isMine ? `<button class="danger" data-act="delete">Delete</button>` : ""}
      ${!p.isMine && state.me ? `<button class="danger strong" data-act="unfollow">Unfollow</button>` : ""}
      <a href="#/p/${p.id}" data-close>Go to post</a>
      <button data-act="copy">Copy link</button>
      <a href="#/u/${esc(p.author.username)}" data-close>About this account</a>
      <button data-close>Cancel</button></div>`,
    { onClick: safe(async (e, close) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      close();
      if (act === "copy") { await navigator.clipboard?.writeText(url).catch(() => {}); toast("Link copied to clipboard."); }
      if (act === "unfollow") { await api(`/users/${encodeURIComponent(p.author.username)}/follow`, { method: "DELETE" }); toast(`Unfollowed ${p.author.username}`); }
      if (act === "delete") {
        if (!confirm("Delete post? This can't be undone.")) return;
        await api(`/posts/${p.id}`, { method: "DELETE" });
        toast("Post deleted.");
        if (location.hash.startsWith(`#/p/${p.id}`)) location.hash = `#/u/${state.me.username}`;
        else el.remove();
      }
    }) });
}

/** Wire up likes, double-tap, carousel, tags, comments for one rendered post. */
function mountPost(el, p, { detail = false } = {}) {
  const media = $(".media", el);
  const track = $(".track", media);
  let index = 0;

  const setLike = safe(async (liked, { fromTap = false } = {}) => {
    if (!state.me) return (location.hash = "#/login");
    if (fromTap) {
      const b = $(".burst", media);
      b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
      if (p.likedByMe) return;
    }
    if (liked === p.likedByMe) return;
    p.likedByMe = liked;
    p.likes += liked ? 1 : -1;
    const btn = $("[data-like]", el);
    btn.classList.toggle("liked", liked);
    btn.innerHTML = icons.heart(liked);
    btn.setAttribute("aria-label", liked ? "Unlike" : "Like");
    $(".likes", el).innerHTML = likesLine(p);
    try { await api(`/posts/${p.id}/like`, { method: liked ? "PUT" : "DELETE" }); }
    catch (e) { p.likedByMe = !liked; p.likes += liked ? -1 : 1; $(".likes", el).innerHTML = likesLine(p); btn.classList.toggle("liked", !liked); btn.innerHTML = icons.heart(!liked); throw e; }
  });

  // Carousel position → counter, dots, arrows, tag button.
  const sync = () => {
    index = Math.round(track.scrollLeft / track.clientWidth) || 0;
    const count = $(".count", media);
    if (count) count.textContent = `${index + 1}/${p.images.length}`;
    $$(".dots i", el).forEach((d, i) => d.classList.toggle("on", i === index));
    const prev = $(".arrow.prev", media), next = $(".arrow.next", media);
    if (prev) prev.hidden = index === 0;
    if (next) next.hidden = index === p.images.length - 1;
    $(".bag-btn", media).hidden = !p.images[index]?.tags.length;
  };
  track.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });

  let tapTimer = null;
  media.addEventListener("click", (e) => {
    if (e.target.closest(".arrow")) {
      track.scrollBy({ left: (e.target.closest(".prev") ? -1 : 1) * track.clientWidth, behavior: "smooth" });
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag && media.classList.contains("show-tags")) return productSheet(findTag(p, tag.dataset.tag));
    if (e.target.closest(".bag-btn")) return media.classList.toggle("show-tags");
    // Single tap toggles tags; double tap likes.
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; setLike(true, { fromTap: true }); return; }
    tapTimer = setTimeout(() => { tapTimer = null; media.classList.toggle("show-tags"); }, 260);
  });

  el.addEventListener("click", safe(async (e) => {
    const t = e.target;
    if (t.closest("[data-like]")) return setLike(!p.likedByMe);
    if (t.closest(".shop-card")) return productSheet(findTag(p, t.closest(".shop-card").dataset.tag));
    if (t.closest("[data-menu]")) return postMenu(p, el);
    if (t.closest("[data-more]")) { $("[data-cap]", el).innerHTML = rich(p.caption); t.closest("[data-more]").remove(); el.querySelector(".caption").lastChild?.remove?.(); return; }
    if (t.closest("[data-share]")) {
      const url = `${location.origin}/#/p/${p.id}`;
      if (navigator.share) await navigator.share({ url, title: `Post by ${p.author.username}` }).catch(() => {});
      else { await navigator.clipboard?.writeText(url).catch(() => {}); toast("Link copied to clipboard."); }
      return;
    }
    const save = t.closest("[data-save]");
    if (save) {
      if (!state.me) return (location.hash = "#/login");
      p.savedByMe = !p.savedByMe;
      save.innerHTML = icons.bookmark(p.savedByMe);
      save.classList.add("pop");
      await api(`/posts/${p.id}/save`, { method: p.savedByMe ? "PUT" : "DELETE" });
      toast(p.savedByMe ? "Added to your closet." : "Removed from your closet.");
    }
  }));

  const form = $(".add-comment", el);
  if (form) {
    const btn = $("button", form);
    form.body.addEventListener("input", () => (btn.disabled = !form.body.value.trim()));
    form.addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) return;
      btn.disabled = true;
      const c = await api(`/posts/${p.id}/comments`, { method: "POST", body: { body } });
      form.reset();
      p.comments++;
      if (detail) drawThread();
      else $("[data-recent]", el).insertAdjacentHTML("beforeend", commentLine(c));
    }));
  }

  async function drawThread() {
    const list = await api(`/posts/${p.id}/comments`);
    $("[data-thread]", el).innerHTML = list.length || p.caption ? list.map((c) => `
      <div class="c">${avatar(c.author, 32)}<div class="body"><a class="b" href="#/u/${esc(c.author.username)}">${esc(c.author.username)}</a> ${rich(c.body)}
        <div class="meta"><span>${ago(c.createdAt)}</span>
        ${state.me && (c.author.username === state.me.username || p.isMine) ? `<button data-del="${c.id}">Delete</button>` : ""}</div></div></div>`).join("")
      : `<div class="grid-empty" style="padding:40px 0"><div class="big" style="font-size:22px">No comments yet.</div>Start the conversation.</div>`;
  }
  if (detail) {
    drawThread().catch(() => {});
    $("[data-thread]", el).addEventListener("click", safe(async (e) => {
      const id = e.target.dataset.del;
      if (!id) return;
      await api(`/comments/${id}`, { method: "DELETE" });
      drawThread();
    }));
  }
}

function appendPosts(container, posts, opts = {}) {
  for (const p of posts) {
    container.insertAdjacentHTML("beforeend", opts.detail ? detailPostHtml(p) : feedPostHtml(p));
    mountPost(container.lastElementChild, p, opts);
  }
}

/** Call `load` whenever the sentinel scrolls into view (infinite scroll). */
function infinite(sentinel, load) {
  let busy = false, done = false;
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || busy || done || !document.body.contains(sentinel)) return;
    busy = true;
    try { done = !(await load()); } catch (e) { toast(e.message, true); done = true; }
    busy = false;
    if (done) { io.disconnect(); sentinel.innerHTML = ""; }
  }, { rootMargin: "600px" });
  io.observe(sentinel);
}

// ---- Pages -----------------------------------------------------------------

async function homePage() {
  const me = state.me;
  view.innerHTML = `<div class="home">
    <div class="feed">
      <div class="stories" id="stories"></div>
      <div id="posts"></div>
      <div id="more">${spinner()}</div>
    </div>
    <aside class="rightcol">
      <div class="me"><a href="#/u/${esc(me.username)}">${avatar(me, 44)}</a>
        <div style="flex:1;min-width:0"><a class="b" href="#/u/${esc(me.username)}">${esc(me.username)}</a><div class="muted">${esc(me.displayName)}</div></div>
        <button class="text-btn small" id="switch">Switch</button></div>
      <div class="row spread" style="margin-top:24px"><span class="muted b">Suggested for you</span><a class="b small" href="#/explore">See All</a></div>
      <ul class="sugg" id="sugg"></ul>
      <div class="footer-links">About · Help · Brands · Privacy · Terms<br/><br/>© ${new Date().getFullYear()} STYLEGRAM</div>
    </aside>
  </div>`;
  $("#switch").addEventListener("click", () => logout());

  Promise.all([api("/me/following"), api("/me/suggestions")]).then(([following, sugg]) => {
    $("#stories").innerHTML = following.length
      ? following.map((u) => `<a class="story" href="#/u/${esc(u.username)}">${avatar(u, 56, { ring: true })}<span class="name">${esc(u.username)}</span></a>`).join("")
      : "";
    $("#stories").hidden = !following.length;
    const li = (u) => `<li>${`<a href="#/u/${esc(u.username)}">${avatar(u, 44)}</a>`}
      <div class="who"><a class="b" href="#/u/${esc(u.username)}">${esc(u.username)}${vf(u.brand?.verified)}</a><span class="muted small">${esc(u.reason)}</span></div>
      <button class="text-btn small" data-follow="${esc(u.username)}">Follow</button></li>`;
    $("#sugg").innerHTML = sugg.map(li).join("") || `<li class="muted">You're following everyone. Nice.</li>`;
  }).catch(() => {});
  $("#sugg").addEventListener("click", safe(async (e) => {
    const u = e.target.dataset.follow;
    if (!u) return;
    const following = e.target.textContent === "Following";
    await api(`/users/${encodeURIComponent(u)}/follow`, { method: following ? "DELETE" : "PUT" });
    e.target.textContent = following ? "Follow" : "Following";
    e.target.classList.toggle("muted", !following);
  }));

  const posts = $("#posts");
  let before;
  infinite($("#more"), async () => {
    const page = await api(`/feed?limit=5${before ? `&before=${before}` : ""}`);
    appendPosts(posts, page);
    before = page.at(-1)?.id;
    if (!posts.children.length) {
      posts.innerHTML = `<div class="grid-empty"><div class="circle-icon">${icons.bag()}</div><div class="big">Welcome to Stylegram</div>
        <p>Follow people and brands to see their looks here, or share your own outfit.</p>
        <div class="row" style="justify-content:center"><a class="btn primary" href="#/new">Share a look</a><a class="btn" href="#/explore">Explore</a></div></div>`;
    }
    return page.length === 5;
  });
}

function tileHtml(c, cls = "") {
  return `<a class="tile ${cls}" href="#/p/${c.id}">
    <img src="${esc(cls.includes("tall") ? c.imageUrl : c.thumbUrl)}" alt="" loading="lazy" />
    <span class="badges">${c.images > 1 ? icons.images() : ""}${c.tags ? icons.bag(true) : ""}</span>
    <span class="hover"><span>${icons.heart(true)} ${n(c.likes)}</span><span>${icons.comment()} ${n(c.comments ?? 0)}</span></span>
  </a>`;
}

/** Infinite grid of post tiles. `explore` gives the mixed big/small layout. */
function postGrid(container, path, { explore = false, empty } = {}) {
  container.innerHTML = `<div class="grid${explore ? " explore" : ""}"></div><div class="sentinel">${spinner()}</div>`;
  const grid = $(".grid", container);
  let before, i = 0;
  infinite($(".sentinel", container), async () => {
    const sep = path.includes("?") ? "&" : "?";
    const cards = await api(`${path}${sep}limit=15${before ? `&before=${before}` : ""}`);
    grid.insertAdjacentHTML("beforeend", cards.map((c) => {
      const k = i++ % 10;
      return tileHtml(c, explore && k === 2 ? "tall tall-right" : explore && k === 5 ? "tall tall-left" : "");
    }).join(""));
    before = cards.at(-1)?.id;
    if (!grid.children.length && empty) container.innerHTML = empty;
    return cards.length === 15;
  });
}

async function explorePage(params) {
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  if (!state.categories.length) state.categories = await api("/categories");
  const href = (o) => {
    const s = new URLSearchParams(Object.entries({ q, category, ...o }).filter(([, v]) => v)).toString();
    return `#/explore${s ? `?${s}` : ""}`;
  };
  view.innerHTML = `<div class="explore-wrap">
    <form class="searchbox" id="search" role="search" autocomplete="off">${icons.search()}
      <input name="q" value="${esc(q)}" placeholder="Search brands, items, people" aria-label="Search" />
      <ul class="results" id="results" hidden></ul></form>
    <div class="chips">
      <a class="chip ${category ? "" : "on"}" href="${href({ category: "" })}">For you</a>
      ${state.categories.map((c) => `<a class="chip ${c === category ? "on" : ""}" href="${href({ category: c })}">${esc(c)}</a>`).join("")}
    </div>
    ${q ? `<h2 class="page-title">Looks matching “${esc(q)}”</h2>` : ""}
    <div id="grid"></div></div>`;

  const input = $("#search input");
  const results = $("#results");
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = input.value.trim();
    if (!term) { results.hidden = true; return; }
    timer = setTimeout(async () => {
      const [brands, users] = await Promise.all([api(`/brands?q=${encodeURIComponent(term)}`), api(`/users?q=${encodeURIComponent(term)}`)]).catch(() => [[], []]);
      results.innerHTML = [
        ...brands.slice(0, 5).map((b) => `<li><a href="#/b/${esc(b.slug)}">${avatar({ name: b.name, avatarUrl: b.logoUrl }, 44)}
          <span><span class="b">${esc(b.name)}</span>${vf(b.verified)}<br/><span class="muted">${b.verified ? "Brand" : "Community brand page"}</span></span></a></li>`),
        ...users.slice(0, 6).map((u) => `<li><a href="#/u/${esc(u.username)}">${avatar(u, 44)}
          <span><span class="b">${esc(u.username)}</span>${vf(u.brand?.verified)}<br/><span class="muted">${esc(u.displayName)}</span></span></a></li>`),
        `<li><a href="${href({ q: term, category: "" })}"><span class="avatar" style="width:44px;height:44px">${icons.search()}</span><span>Looks matching <b>${esc(term)}</b></span></a></li>`,
      ].join("");
      results.hidden = false;
    }, 180);
  });
  input.addEventListener("blur", () => setTimeout(() => (results.hidden = true), 200));
  $("#search").addEventListener("submit", (e) => { e.preventDefault(); location.hash = href({ q: input.value.trim(), category: "" }); });
  if (params.get("focus")) input.focus();

  const qs = new URLSearchParams(Object.entries({ q, category }).filter(([, v]) => v)).toString();
  postGrid($("#grid"), `/explore${qs ? `?${qs}` : ""}`, {
    explore: true,
    empty: `<div class="grid-empty"><div class="circle-icon">${icons.search()}</div><div class="big">No results found</div>Try a brand name, an item like “sneakers”, or a #hashtag.</div>`,
  });
}

async function postPage(id) {
  const p = await api(`/posts/${id}`);
  view.innerHTML = `<div class="detail-wrap"><div id="one"></div>
    <div id="more-from" style="margin-top:40px"></div></div>`;
  const wide = matchMedia("(min-width: 900px)").matches;
  appendPosts($("#one"), [p], { detail: wide });
  if (!wide) {
    // Phones: full comment list under the post.
    const el = $("#one .post");
    el.insertAdjacentHTML("beforeend", `<div class="post-body thread" style="padding-top:8px"><div data-thread></div></div>`);
    const list = await api(`/posts/${p.id}/comments`);
    $("[data-thread]", el).innerHTML = list.map((c) => `<div class="c">${avatar(c.author, 32)}<div class="body">
      <a class="b" href="#/u/${esc(c.author.username)}">${esc(c.author.username)}</a> ${rich(c.body)}<div class="meta"><span>${ago(c.createdAt)}</span></div></div></div>`).join("");
    $("[data-recent]", el).remove();
    $(".view-all", el)?.remove();
  }
  const others = (await api(`/users/${encodeURIComponent(p.author.username)}/posts?limit=7`)).filter((c) => c.id !== p.id).slice(0, 6);
  if (others.length) {
    $("#more-from").innerHTML = `<p class="muted b" style="padding:0 12px 12px;border-top:1px solid var(--border);padding-top:24px">More posts from <a href="#/u/${esc(p.author.username)}" style="color:var(--text)">${esc(p.author.username)}</a></p>
      <div class="grid">${others.map((c) => tileHtml(c)).join("")}</div>`;
  }
}

async function savedPage() {
  view.innerHTML = `<div class="profile-wrap" style="padding-top:20px"><h2 class="page-title">Your closet</h2>
    <p class="muted" style="padding:0 12px 16px;margin:0">Looks you've hung up for later. Only you can see your closet.</p><div id="grid"></div></div>`;
  postGrid($("#grid"), "/me/saved", {
    empty: `<div class="grid-empty"><div class="circle-icon">${icons.bookmark()}</div><div class="big">Your closet is empty</div>Tap the hanger on any look to keep it here. Only you can see your closet.</div>`,
  });
}

async function profilePage(username, params) {
  const u = await api(`/users/${encodeURIComponent(username)}`);
  const tab = params.get("tab") === "saved" && u.isMe ? "saved" : "posts";
  const buttons = u.isMe
    ? `<a class="btn" href="#/settings">Edit profile</a><a class="btn" href="#/saved">Closet</a>`
    : state.me
      ? `<button class="btn ${u.isFollowing ? "" : "primary"}" id="follow">${u.isFollowing ? "Following" : "Follow"}</button>
         ${u.brand ? `<a class="btn" href="#/b/${esc(u.brand.slug)}">Shop</a>` : ""}`
      : `<a class="btn primary" href="#/login">Follow</a>`;
  view.innerHTML = `<div class="profile-wrap">
    <header class="profile">
      <div class="pic">${avatar(u, 150)}</div>
      <div>
        <div class="top"><h2>${esc(u.username)}</h2>${vf(u.brand?.verified)}
          <div class="buttons">${buttons}</div>
          ${u.isMe ? `<button class="icon-btn" id="pmenu" aria-label="Options">${icons.menu()}</button>` : ""}</div>
      </div>
      <div class="stats">
        <span><b>${n(u.posts)}</b> posts</span>
        <span><b id="followers">${n(u.followers)}</b> followers</span>
        <span><b>${n(u.following)}</b> following</span>
      </div>
      <div class="info">
        <div class="name">${esc(u.displayName)}</div>
        ${u.accountType === "BRAND" ? `<div class="muted">Brand</div>` : ""}
        ${u.bio ? `<div class="bio">${rich(u.bio)}</div>` : ""}
        ${u.brand ? `<a class="ext" href="#/b/${esc(u.brand.slug)}">${icons.bag().replace('width="24" height="24"', 'width="12" height="12" style="display:inline;vertical-align:-1px"')} Shop on Stylegram</a>` : ""}
      </div>
    </header>
    <nav class="ptabs">
      <a href="#/u/${esc(u.username)}" class="${tab === "posts" ? "on" : ""}">${icons.grid(tab === "posts")}<span class="label">Posts</span></a>
      ${u.isMe ? `<a href="#/u/${esc(u.username)}?tab=saved" class="${tab === "saved" ? "on" : ""}">${icons.saved(tab === "saved")}<span class="label">Closet</span></a>` : ""}
      ${u.brand ? `<a href="#/b/${esc(u.brand.slug)}">${icons.shop(false)}<span class="label">Shop</span></a>` : ""}
    </nav>
    <div id="grid"></div></div>`;
  // Mobile layout: stats below the bio.
  if (!matchMedia("(min-width: 736px)").matches) $(".profile").append($(".profile .stats"));

  $("#pmenu")?.addEventListener("click", moreMenu);
  $("#follow")?.addEventListener("click", safe(async (e) => {
    const b = e.currentTarget;
    u.isFollowing = !u.isFollowing;
    await api(`/users/${encodeURIComponent(username)}/follow`, { method: u.isFollowing ? "PUT" : "DELETE" });
    u.followers += u.isFollowing ? 1 : -1;
    b.textContent = u.isFollowing ? "Following" : "Follow";
    b.classList.toggle("primary", !u.isFollowing);
    $("#followers").textContent = n(u.followers);
  }));
  postGrid($("#grid"), tab === "saved" ? "/me/saved" : `/users/${encodeURIComponent(username)}/posts`, {
    empty: u.isMe && tab === "posts"
      ? `<div class="grid-empty"><div class="circle-icon">${icons.bag()}</div><div class="big">Share your first look</div>
          When you share photos and tag what you're wearing, they'll appear on your profile.<br/><br/><a class="text-btn" href="#/new">Share your first photo</a></div>`
      : `<div class="grid-empty"><div class="circle-icon">${icons.photos().replace('width="72" height="72"', 'width="32" height="32"')}</div><div class="big">No posts yet</div></div>`,
  });
}

async function brandPage(slug, params) {
  const tab = params.get("tab") === "shop" ? "shop" : "posts";
  const productId = params.get("product");
  const [b, products] = await Promise.all([api(`/brands/${slug}`), api(`/brands/${slug}/products`)]);
  const selected = products.find((p) => String(p.id) === productId);
  view.innerHTML = `<div class="profile-wrap">
    <header class="profile">
      <div class="pic">${avatar({ name: b.name, avatarUrl: b.logoUrl }, 150)}</div>
      <div><div class="top"><h2>${esc(b.name)}</h2>${vf(b.verified)}
        <div class="buttons">${b.website ? `<a class="btn primary" href="${esc(b.website)}" target="_blank" rel="noopener nofollow">Visit store</a>` : ""}
          ${b.account ? `<a class="btn" href="#/u/${esc(b.account.username)}">@${esc(b.account.username)}</a>` : ""}</div></div></div>
      <div class="stats"><span><b>${n(b.postCount)}</b> looks</span><span><b>${n(b.tagCount)}</b> tagged items</span><span><b>${n(products.length)}</b> products</span></div>
      <div class="info">
        <div class="name">${b.verified ? "Brand" : "Community brand page"}</div>
        ${b.description ? `<div class="bio">${esc(b.description)}</div>` : ""}
        ${!b.claimed ? `<div class="muted small" style="margin-top:6px">Created from people's tags. Is this your brand? <a class="text-btn" href="#/signup">Claim it</a></div>` : ""}
      </div>
    </header>
    <nav class="ptabs">
      <a href="#/b/${esc(slug)}" class="${tab === "posts" ? "on" : ""}">${icons.grid(tab === "posts")}<span class="label">Seen on</span></a>
      <a href="#/b/${esc(slug)}?tab=shop" class="${tab === "shop" ? "on" : ""}">${icons.shop(tab === "shop")}<span class="label">Shop</span></a>
    </nav>
    ${selected ? `<div class="row spread" style="padding:14px 12px"><span>Looks with <b>${esc(selected.name)}</b> ${money(selected) ? `· ${esc(money(selected))}` : ""}</span>
      <span class="row"><a class="btn primary" href="${esc(selected.url)}" target="_blank" rel="noopener nofollow">Buy</a><a class="btn" href="#/b/${esc(slug)}">Clear</a></span></div>` : ""}
    <div id="grid"></div></div>`;
  if (!matchMedia("(min-width: 736px)").matches) $(".profile").append($(".profile .stats"));

  if (tab === "shop") {
    $("#grid").innerHTML = products.length
      ? `<div class="products" style="padding:12px">${products.map((p) => `
          <a class="product" href="#/b/${esc(slug)}?product=${p.id}"><span class="n">${esc(p.name)}</span>
          <span class="muted" style="text-transform:capitalize">${esc(p.category)}</span><span class="b">${esc(money(p))}</span></a>`).join("")}</div>`
      : `<div class="grid-empty"><div class="circle-icon">${icons.bag()}</div><div class="big">No products yet</div>${b.claimed ? "This brand hasn't added its catalog yet." : "Products appear once the brand joins Stylegram."}</div>`;
    return;
  }
  postGrid($("#grid"), `/brands/${slug}/posts${selected ? `?product=${selected.id}` : ""}`, {
    empty: `<div class="grid-empty"><div class="circle-icon">${icons.bag()}</div><div class="big">No looks yet</div>Nobody has tagged this yet.</div>`,
  });
}

async function settingsPage() {
  const me = state.me;
  view.innerHTML = `<div class="page" style="max-width:620px"><h1>Edit profile</h1>
    <div class="card row" style="margin-top:20px;background:var(--btn-2);border:0">
      ${avatar(me, 56)}<div style="flex:1"><div class="b">${esc(me.username)}</div><div class="muted">${esc(me.displayName)}</div></div>
      <label class="btn primary file-btn">Change photo<input type="file" id="avatar" accept="image/*" /></label></div>
    <form id="profile">
      <label class="lbl" for="dn">Name</label><input class="input" id="dn" name="displayName" value="${esc(me.displayName)}" maxlength="60" required />
      <label class="lbl" for="bio">Bio</label><textarea class="input" id="bio" name="bio" rows="3" maxlength="300">${esc(me.bio)}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" style="min-width:120px">Submit</button></div>
    </form>
    ${me.brandClaim?.status === "PENDING" ? `<p class="muted">Your claim on <b>${esc(me.brandClaim.name)}</b> is waiting for review.</p>` : ""}
    ${me.ownedBrand && !me.ownedBrand.verified ? `<p class="muted"><b>${esc(me.ownedBrand.name)}</b> is waiting for verification.</p>` : ""}
    <div class="menu-list card" style="padding:0;margin-top:30px"><button class="danger" id="logout">Log out</button></div></div>`;
  $("#logout").addEventListener("click", () => logout());
  $("#avatar").addEventListener("change", safe(async (e) => {
    const form = new FormData();
    form.append("avatar", e.target.files[0]);
    await api("/me/avatar", { method: "PUT", form });
    await loadMe();
    toast("Profile photo updated.");
    route();
  }));
  $("#profile").addEventListener("submit", safe(async (e) => {
    e.preventDefault();
    state.me = await api("/me", { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) });
    toast("Profile saved.");
    location.hash = `#/u/${state.me.username}`;
  }));
}

// ---- Create post (pick photos → tag → caption → share) ----------------------

function brandAutocomplete(input, onPick) {
  let list, timer;
  const close = () => { list?.remove(); list = null; };
  input.addEventListener("input", () => {
    onPick({ name: input.value.trim() });
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    timer = setTimeout(async () => {
      const brands = await api(`/brands?q=${encodeURIComponent(q)}`).catch(() => []);
      close();
      list = document.createElement("ul");
      const exact = brands.some((b) => b.name.toLowerCase() === q.toLowerCase());
      list.innerHTML = brands.map((b, i) => `<li data-i="${i}">${esc(b.name)}${vf(b.verified)}</li>`).join("")
        + (exact ? "" : `<li data-new>Use “${esc(q)}” (new brand)</li>`);
      list.addEventListener("mousedown", (e) => {
        const li = e.target.closest("li");
        if (!li) return;
        e.preventDefault();
        if (li.dataset.new !== undefined) onPick({ name: q });
        else { const b = brands[Number(li.dataset.i)]; input.value = b.name; onPick({ slug: b.slug, name: b.name }); }
        close();
      });
      input.parentElement.append(list);
    }, 180);
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

async function createPage() {
  if (!state.categories.length) state.categories = await api("/categories");
  const photos = [];
  const tags = [];
  let current = 0;

  view.innerHTML = `<div class="create"><div class="panel">
    <div class="bar"><button id="back" aria-label="Back" hidden>${icons.back()}</button><span class="title">Create new post</span><button class="text-btn" id="share" hidden>Share</button></div>
    <label class="pick" id="pick">${icons.photos()}<h3>Drag photos here</h3>
      <span class="btn primary">Select from device</span><input type="file" id="files" accept="image/*" multiple hidden /></label>
    <div class="body" id="body" hidden>
      <div><div class="editor-media" id="canvas"></div><div class="thumbs" id="thumbs" hidden></div></div>
      <div class="side">
        <div class="row">${avatar(state.me, 28)}<span class="b">${esc(state.me.username)}</span></div>
        <textarea id="caption" maxlength="2200" placeholder="Write a caption… Use #hashtags and @mentions"></textarea>
        <div class="count"><span id="cc">0</span>/2,200</div>
        <div class="b" style="margin-top:6px">Tagged products</div>
        <ul class="tag-list" id="tag-list"></ul>
      </div>
    </div></div></div>`;

  const canvas = $("#canvas");
  const draw = () => {
    const ph = photos[current];
    canvas.innerHTML = `<img src="${ph.url}" alt="Photo ${current + 1}" />` +
      tags.map((t) => (t.image === current ? `<span class="pin" style="left:${t.x * 100}%;top:${t.y * 100}%"></span>` : "")).join("") +
      `<span class="editor-hint">Tap an item to tag its brand</span>`;
    $("#thumbs").hidden = photos.length < 2;
    $("#thumbs").innerHTML = photos.map((p, i) => `<button class="${i === current ? "on" : ""}" data-i="${i}"><img src="${p.url}" alt="" /></button>`).join("");
    $("#tag-list").innerHTML = tags.length
      ? tags.map((t, i) => `<li><span class="num">${i + 1}</span><div class="t"><div class="b">${esc(t.productName ?? t.label)}</div>
          <div class="muted small">${esc(t.brandLabel)} · ${esc(t.category)}${photos.length > 1 ? ` · photo ${t.image + 1}` : ""}</div></div>
          <button class="icon-btn" data-remove="${i}" aria-label="Remove tag">${icons.close()}</button></li>`).join("")
      : `<li class="muted small">Tap the photo where an item is to tag the brand and product.</li>`;
  };

  const addFiles = (files) => {
    for (const file of [...files].filter((f) => f.type.startsWith("image/")).slice(0, 10 - photos.length)) {
      photos.push({ file, url: URL.createObjectURL(file) });
    }
    if (!photos.length) return;
    $("#pick").hidden = true;
    $("#body").hidden = false;
    $("#back").hidden = false;
    $("#share").hidden = false;
    draw();
  };
  $("#files").addEventListener("change", (e) => addFiles(e.target.files));
  const pick = $("#pick");
  pick.addEventListener("dragover", (e) => { e.preventDefault(); pick.classList.add("drag"); });
  pick.addEventListener("dragleave", () => pick.classList.remove("drag"));
  pick.addEventListener("drop", (e) => { e.preventDefault(); pick.classList.remove("drag"); addFiles(e.dataTransfer.files); });
  $("#back").addEventListener("click", () => (photos.length && !confirm("Discard post? If you leave, your edits won't be saved.") ? null : route()));
  $("#caption").addEventListener("input", (e) => ($("#cc").textContent = n(e.target.value.length)));
  $("#thumbs").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { current = Number(b.dataset.i); draw(); } });
  $("#tag-list").addEventListener("click", (e) => { const b = e.target.closest("[data-remove]"); if (b) { tags.splice(Number(b.dataset.remove), 1); draw(); } });

  canvas.addEventListener("click", (e) => {
    if (e.target.closest(".tag-form") || e.target.tagName !== "IMG") return;
    const rect = e.target.getBoundingClientRect();
    openTagForm(clamp((e.clientX - rect.left) / rect.width, 0, 1), clamp((e.clientY - rect.top) / rect.height, 0, 1));
  });

  function openTagForm(x, y) {
    $(".tag-form", canvas)?.remove();
    $(".editor-hint", canvas)?.remove();
    const form = document.createElement("form");
    form.className = "tag-form";
    form.innerHTML = `
      <div class="suggest"><input class="input" name="brand" required autocomplete="off" placeholder="Brand (e.g. Northwind Denim)" /></div>
      <select class="input" name="product" hidden style="margin-top:8px"><option value="">Product not listed</option></select>
      <input class="input" name="label" required maxlength="80" placeholder="What is it? (e.g. Denim jacket)" style="margin-top:8px" />
      <div class="row" style="margin-top:8px;flex-wrap:nowrap">
        <select class="input" name="category" style="flex:1">${state.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        <input class="input" name="url" type="url" placeholder="Link (optional)" style="flex:1.4" /></div>
      <div class="row2"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary">Done</button></div>`;
    canvas.append(form);
    const W = canvas.clientWidth, H = canvas.clientHeight, fw = form.offsetWidth, fh = form.offsetHeight;
    form.style.left = `${Math.max(8, Math.min(x * W - fw / 2, W - fw - 8))}px`;
    form.style.top = `${y * H + 20 + fh <= H ? y * H + 20 : Math.max(8, y * H - fh - 20)}px`;
    const pin = document.createElement("span");
    pin.className = "pin";
    Object.assign(pin.style, { left: `${x * 100}%`, top: `${y * 100}%` });
    canvas.append(pin);
    let brand = { name: "" }, products = [];
    brandAutocomplete(form.brand, async (b) => {
      brand = b;
      products = [];
      form.product.hidden = true;
      if (!b.slug) return;
      products = await api(`/brands/${b.slug}/products`).catch(() => []);
      if (!products.length) return;
      form.product.innerHTML = `<option value="">Product not listed</option>` + products.map((p) => `<option value="${p.id}">${esc(p.name)}${p.price ? ` · ${esc(money(p))}` : ""}</option>`).join("");
      form.product.hidden = false;
    });
    form.product.addEventListener("change", () => {
      const p = products.find((x) => String(x.id) === form.product.value);
      if (p) { form.label.value = p.name; form.category.value = p.category; }
    });
    form.addEventListener("click", (e) => e.stopPropagation());
    $("[data-cancel]", form).addEventListener("click", () => draw());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = products.find((x) => String(x.id) === form.product.value);
      tags.push({
        image: current, x, y, label: form.label.value.trim(), category: form.category.value,
        ...(brand.slug ? { brandSlug: brand.slug } : { brandName: form.brand.value.trim() }),
        brandLabel: brand.name || form.brand.value.trim(),
        ...(p ? { productId: p.id, productName: p.name } : {}),
        ...(form.url.value ? { url: form.url.value } : {}),
      });
      draw();
    });
    form.brand.focus();
  }

  $("#share").addEventListener("click", safe(async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Sharing…";
    try {
      const form = new FormData();
      photos.forEach((p) => form.append("images", p.file));
      form.append("caption", $("#caption").value);
      form.append("tags", JSON.stringify(tags.map(({ brandLabel, productName, ...t }) => t)));
      const post = await api("/posts", { method: "POST", form });
      toast("Your post has been shared.");
      location.hash = `#/p/${post.id}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Share";
    }
  }));
}

// ---- Brand dashboard & admin -------------------------------------------------

async function dashboardPage(params) {
  const tab = params.get("tab") ?? "review";
  if (!state.categories.length) state.categories = await api("/categories");
  const d = await api("/brand/dashboard");
  view.innerHTML = `<div class="page">
    <div class="row spread"><div><h1>${esc(d.brand.name)} ${vf(true)}</h1><div class="muted">Brand dashboard</div></div>
      <a class="btn" href="#/b/${esc(d.brand.slug)}">View brand page</a></div>
    <div class="stat-row">
      ${[["Tagged items", d.tags.total], ["To review", d.tags.pending], ["Looks", d.posts], ["Creators", d.creators], ["Shop clicks · 7d", d.clicks.last7Days], ["Shop clicks · 30d", d.clicks.last30Days]]
        .map(([l, v]) => `<div class="stat"><div class="muted small">${l}</div><div class="v">${n(v)}</div></div>`).join("")}
    </div>
    <div class="seg-tabs">${[["review", `Review tags (${d.tags.pending})`], ["all", "All tags"], ["products", "Products"], ["profile", "Brand profile"]]
      .map(([k, l]) => `<a class="chip ${k === tab ? "on" : ""}" style="text-transform:none" href="#/brand?tab=${k}">${l}</a>`).join("")}</div>
    <div class="card" id="panel"></div></div>`;
  const panel = $("#panel");

  if (tab === "review" || tab === "all") {
    const [tags, products] = await Promise.all([api(`/brand/tags${tab === "review" ? "?status=PENDING" : ""}`), api("/brand/products")]);
    if (!tags.length) { panel.innerHTML = `<p class="grid-empty">${tab === "review" ? "All caught up. No tags waiting for review." : "No tags yet."}</p>`; return; }
    panel.innerHTML = `<table class="table"><tbody>${tags.map((t) => `
      <tr data-tag="${t.id}">
        <td style="width:60px"><a href="#/p/${t.postId}"><img src="${esc(t.thumbUrl)}" alt="" /></a></td>
        <td><b>${esc(t.label)}</b><div class="muted small">@${esc(t.author)} · ${esc(t.category)} · ${t.clicks} clicks
          ${t.url ? ` · <a class="mention" href="${esc(t.url)}" target="_blank" rel="noopener nofollow">their link</a>` : ""}</div>
          ${tab === "all" ? `<span class="${t.status === "CONFIRMED" ? "ok-badge" : t.status === "REJECTED" ? "bad-badge" : "warn-badge"}">${t.status.toLowerCase()}</span>` : ""}</td>
        <td><select data-product><option value="">${t.product ? "" : "Match to product…"}</option>${products.map((p) => `<option value="${p.id}" ${t.product?.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>
        <td><div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="CONFIRM">Confirm</button><button class="btn" data-act="REJECT">Not ours</button></div></td>
      </tr>`).join("")}</tbody></table>`;
    panel.addEventListener("click", safe(async (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      const tr = e.target.closest("tr");
      const productId = $("[data-product]", tr).value;
      await api(`/brand/tags/${tr.dataset.tag}/review`, { method: "POST", body: { action: act, ...(act === "CONFIRM" && productId ? { productId: Number(productId) } : {}) } });
      toast(act === "CONFIRM" ? "Tag confirmed." : "Tag rejected.");
      if (tab === "review") tr.remove(); else route();
    }));
  } else if (tab === "products") {
    const products = await api("/brand/products");
    panel.innerHTML = `
      <form id="product" class="form-grid">
        <label>Name<input class="input" name="name" required maxlength="120" /></label>
        <label>Product URL<input class="input" name="url" type="url" required placeholder="https://" /></label>
        <label>Price<input class="input" name="price" inputmode="decimal" /></label>
        <label>Currency<input class="input" name="currency" value="USD" maxlength="3" /></label>
        <label>Category<select class="input" name="category">${state.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
        <button class="btn primary">Add product</button>
      </form>
      <table class="table"><tbody>${products.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="muted small">${esc(p.category)} · <a class="mention" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(new URL(p.url).hostname)}</a></div></td>
        <td>${esc(money(p))}</td><td style="text-align:right"><button class="btn" data-archive="${p.id}">Archive</button></td></tr>`).join("") || `<tr><td class="muted">No products yet. Add products so people can tag the exact item.</td></tr>`}</tbody></table>`;
    $("#product").addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await api("/brand/products", { method: "POST", body: { ...f, price: f.price || undefined, currency: f.currency.toUpperCase() } });
      toast("Product added.");
      route();
    }));
    panel.addEventListener("click", safe(async (e) => {
      const id = e.target.dataset.archive;
      if (!id || !confirm("Archive this product? Existing tags keep their link.")) return;
      await api(`/brand/products/${id}`, { method: "DELETE" });
      route();
    }));
  } else {
    panel.innerHTML = `<form id="brand">
      <div class="row" style="margin-bottom:12px">${avatar({ name: d.brand.name, avatarUrl: d.brand.logoUrl }, 56)}
        <label class="btn primary file-btn">Upload logo<input type="file" id="logo" accept="image/*" /></label></div>
      <label class="lbl">Website</label><input class="input" name="website" type="url" value="${esc(d.brand.website ?? "")}" />
      <label class="lbl">About</label><textarea class="input" name="description" rows="3" maxlength="500">${esc(d.brand.description)}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary">Save</button></div></form>`;
    $("#logo").addEventListener("change", safe(async (e) => {
      const form = new FormData();
      form.append("logo", e.target.files[0]);
      await api("/brand/logo", { method: "PUT", form });
      toast("Logo updated.");
      route();
    }));
    $("#brand").addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await api("/brand", { method: "PATCH", body: { website: f.website || undefined, description: f.description } });
      toast("Brand profile saved.");
    }));
  }
}

async function adminPage() {
  const q = await api("/admin/queue");
  view.innerHTML = `<div class="page" id="admin"><h1>Admin</h1>
    <div class="card" style="margin-top:16px"><div class="b" style="margin-bottom:8px">Brands waiting for verification</div>
      ${q.brandsToVerify.length ? `<table class="table"><tbody>${q.brandsToVerify.map((b) => `<tr><td><b>${esc(b.name)}</b>
        <div class="muted small">@${esc(b.owner)} · <a class="mention" href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website)}</a></div></td>
        <td style="text-align:right"><button class="btn primary" data-verify="${esc(b.slug)}">Verify</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">None</p>`}
    </div>
    <div class="card"><div class="b" style="margin-bottom:8px">Brand claims</div>
      ${q.claims.length ? `<table class="table"><tbody>${q.claims.map((c) => `<tr><td><b>${esc(c.name)}</b>
        <div class="muted small">claimed by @${esc(c.username)} (${esc(c.email)}) ${c.message ? `· “${esc(c.message)}”` : ""}</div></td>
        <td><div class="row" style="justify-content:flex-end"><button class="btn primary" data-claim="${c.id}" data-approve="1">Approve</button><button class="btn" data-claim="${c.id}">Reject</button></div></td></tr>`).join("")}</tbody></table>` : `<p class="muted">None</p>`}
    </div></div>`;
  $("#admin").addEventListener("click", safe(async (e) => {
    const { verify, claim, approve } = e.target.dataset;
    if (verify) await api(`/admin/brands/${verify}/verify`, { method: "POST", body: { verified: true } });
    else if (claim) await api(`/admin/claims/${claim}`, { method: "POST", body: { approve: Boolean(approve) } });
    else return;
    toast("Done.");
    route();
  }));
}

// ---- Boot ------------------------------------------------------------------

window.addEventListener("offline", () => toast("You're offline. Some things won't load until you reconnect.", true));
window.addEventListener("online", () => toast("Back online."));

await loadMe();
renderInstallBanner();
route();
