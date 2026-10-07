// Stylegram web client: a small hash-routed SPA over the JSON API.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $("#view");

const state = { token: store("token"), me: null, categories: [] };

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch { return null; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = isError ? "error" : "";
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && state.token && path !== "/auth/login") logout(false);
    const detail = data?.error?.details?.[0];
    throw new Error(detail ? `${detail.path ? detail.path + ": " : ""}${detail.message}` : data?.error?.message ?? res.statusText);
  }
  return data;
}

const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { toast(e.message, true); }
};

const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  for (const [n, u] of [[86400 * 7, "w"], [86400, "d"], [3600, "h"], [60, "m"]]) if (s >= n) return `${Math.floor(s / n)}${u}`;
  return "";
};

function avatar(user, cls = "") {
  return user.avatarUrl
    ? `<img class="avatar ${cls}" src="${esc(user.avatarUrl)}" alt="" />`
    : `<span class="avatar avatar-fallback ${cls}">${esc((user.displayName || user.username || "?")[0].toUpperCase())}</span>`;
}
const verifiedMark = (on) => (on ? ` <span class="verified" title="Verified brand">✔︎</span>` : "");
const priceText = (p) => (p?.price ? `${p.currency} ${p.price}` : "");

// ---- Router ----------------------------------------------------------------

const routes = [
  [/^\/$/, () => (state.me ? feedPage() : explorePage())],
  [/^\/explore$/, explorePage],
  [/^\/login$/, () => authPage("login")],
  [/^\/signup$/, () => authPage("signup")],
  [/^\/new$/, requireLogin(newPostPage)],
  [/^\/p\/(\d+)$/, (id) => postPage(Number(id))],
  [/^\/u\/([\w.]+)$/, profilePage],
  [/^\/b\/([\w-]+)$/, brandPage],
  [/^\/saved$/, requireLogin(savedPage)],
  [/^\/settings$/, requireLogin(settingsPage)],
  [/^\/brand$/, requireLogin(dashboardPage)],
  [/^\/admin$/, requireLogin(adminPage)],
];

function requireLogin(fn) {
  return (...a) => (state.me ? fn(...a) : (location.hash = "#/login"));
}

async function route() {
  const [path, query = ""] = (location.hash.slice(1) || "/").split("?");
  renderNav(path);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      view.innerHTML = `<p class="empty">Loading…</p>`;
      try {
        await fn(...m.slice(1).map(decodeURIComponent), new URLSearchParams(query));
      } catch (e) {
        view.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  view.innerHTML = `<p class="empty">Page not found</p>`;
}
window.addEventListener("hashchange", route);

function renderNav(path) {
  const link = (href, label) => `<a href="#${href}" class="${path === href ? "active" : ""}">${label}</a>`;
  const me = state.me;
  $("#nav").innerHTML = me
    ? [
        link("/", "Feed"),
        link("/explore", "Explore"),
        link("/new", "＋ Post"),
        me.ownedBrand?.verified ? link("/brand", "Brand") : "",
        me.isAdmin ? link("/admin", "Admin") : "",
        `<a href="#/u/${esc(me.username)}" class="${path === `/u/${me.username}` ? "active" : ""}" title="Profile">${avatar(me)}</a>`,
      ].join("")
    : [link("/explore", "Explore"), link("/login", "Log in"), link("/signup", "Sign up")].join("");
}

$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  location.hash = q ? `#/explore?q=${encodeURIComponent(q)}` : "#/explore";
});

// ---- Auth ------------------------------------------------------------------

function logout(redirect = true) {
  state.token = null;
  state.me = null;
  store("token", null);
  if (redirect) location.hash = "#/explore";
  route();
}

async function loadMe() {
  if (!state.token) return;
  try { state.me = await api("/me"); } catch { state.me = null; }
}

function authPage(mode) {
  const signup = mode === "signup";
  view.innerHTML = `
    <div class="narrow card" style="max-width:400px;margin-top:20px">
      <h1>${signup ? "Create your account" : "Log in"}</h1>
      <p class="muted">${signup ? "Share your outfits and tag what you're wearing." : "Welcome back."}</p>
      <form id="auth">
        ${signup ? `
          <div class="tabs" role="tablist">
            <button type="button" class="active" data-type="PERSONAL">Personal</button>
            <button type="button" data-type="BRAND">Brand / business</button>
          </div>
          <label>Name <input name="displayName" required maxlength="60" /></label>
          <label>Username <input name="username" required pattern="[A-Za-z0-9._]{3,30}" autocomplete="username" /></label>
          <label>Email <input name="email" type="email" required autocomplete="email" /></label>
          <div id="brand-fields" hidden>
            <label>Brand name <input name="brandName" maxlength="60" /></label>
            <label>Official website <input name="website" type="url" placeholder="https://" /></label>
            <p class="muted">Brand accounts are verified by our team before they can manage products and review tags.</p>
          </div>` : `<label>Username or email <input name="login" required autocomplete="username" /></label>`}
        <label>Password <input name="password" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" /></label>
        <button class="primary" style="width:100%">${signup ? "Sign up" : "Log in"}</button>
      </form>
      <p class="muted" style="text-align:center">${signup ? `Have an account? <a href="#/login">Log in</a>` : `New here? <a href="#/signup">Sign up</a>`}</p>
    </div>`;
  let accountType = "PERSONAL";
  $$("[data-type]").forEach((b) =>
    b.addEventListener("click", () => {
      accountType = b.dataset.type;
      $$("[data-type]").forEach((x) => x.classList.toggle("active", x === b));
      $("#brand-fields").hidden = accountType !== "BRAND";
      $$("#brand-fields input").forEach((i) => (i.required = accountType === "BRAND"));
    }),
  );
  $("#auth").addEventListener("submit", safe(async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const res = signup
      ? await api("/auth/register", {
          method: "POST",
          body: {
            username: f.username, email: f.email, password: f.password, displayName: f.displayName, accountType,
            brand: accountType === "BRAND" ? { name: f.brandName, website: f.website } : undefined,
          },
        })
      : await api("/auth/login", { method: "POST", body: { login: f.login, password: f.password } });
    state.token = res.token;
    store("token", res.token);
    state.me = res.user;
    if (res.brand) toast(res.brand.status === "CLAIM_PENDING" ? "Your claim on this brand is waiting for review" : "Your brand is waiting for verification");
    location.hash = signup ? "#/new" : "#/";
  }));
}

// ---- Posts -----------------------------------------------------------------

function tagListItem(t, n) {
  const status = t.status === "CONFIRMED"
    ? `<span class="badge CONFIRMED" title="The brand confirmed this item">✔︎ Brand confirmed</span>`
    : t.status === "REJECTED" ? `<span class="badge REJECTED" title="The brand says this isn't their item">Rejected by brand</span>` : "";
  const name = t.product ? t.product.name : t.label;
  return `<li>
    <span class="num">${n}</span>
    <div class="info">
      <div class="l">${esc(name)}</div>
      <div class="muted"><a href="#/b/${esc(t.brand.slug)}">${esc(t.brand.name)}</a>${verifiedMark(t.brand.verified)}
        ${t.product?.price ? ` · ${esc(priceText(t.product))}` : ""} · ${esc(t.category)} ${status}</div>
    </div>
    ${t.shopUrl ? `<a class="shop" href="${esc(t.shopUrl)}" target="_blank" rel="noopener nofollow">Shop</a>` : ""}
  </li>`;
}

/** Render a post card with a carousel, tag dots, item list, actions and comments. */
function postHtml(p, { full = false } = {}) {
  return `<article class="post" data-post="${p.id}">
    <div class="post-head">
      <a href="#/u/${esc(p.author.username)}">${avatar(p.author)}</a>
      <div style="flex:1"><a class="who" href="#/u/${esc(p.author.username)}">${esc(p.author.username)}</a>${verifiedMark(p.author.brand?.verified)}
        <div class="muted"><a href="#/p/${p.id}">${timeAgo(p.createdAt)}</a></div></div>
      ${p.isMine ? `<button class="link" data-delete-post>Delete</button>` : ""}
    </div>
    <div class="media" data-index="0"></div>
    <div class="post-body">
      <div class="actions">
        <button data-like class="${p.likedByMe ? "on" : ""}" aria-label="Like">${p.likedByMe ? "♥" : "♡"}</button>
        <a href="#/p/${p.id}" style="font-size:20px" aria-label="Comments">💬</a>
        <button data-save class="${p.savedByMe ? "on" : ""}" aria-label="Save" style="margin-left:auto">${p.savedByMe ? "★" : "☆"}</button>
      </div>
      <div><b data-likes>${p.likes}</b> likes</div>
      ${p.caption ? `<p class="caption"><a href="#/u/${esc(p.author.username)}"><b>${esc(p.author.username)}</b></a> ${esc(p.caption)}</p>` : ""}
      <ul class="items"></ul>
      ${full ? `<ul class="comments"></ul>
        ${state.me ? `<form class="comment-form"><input name="body" placeholder="Add a comment…" maxlength="1000" required /><button>Post</button></form>` : ""}`
        : p.comments ? `<a class="muted" href="#/p/${p.id}">View all ${p.comments} comments</a>` : ""}
    </div>
  </article>`;
}

function mountPost(el, p, { full = false } = {}) {
  const media = $(".media", el);
  let index = 0;
  let showTags = true;
  const draw = () => {
    const img = p.images[index];
    media.classList.toggle("hide-tags", !showTags);
    media.innerHTML = `
      <img src="${esc(img.url)}" width="${img.width}" height="${img.height}" alt="Photo ${index + 1} by ${esc(p.author.username)}" />
      ${img.tags.map((t, i) => `<button class="dot ${t.status}" style="left:${t.x * 100}%;top:${t.y * 100}%" data-tag="${i}" aria-label="${esc(t.label)}"></button>`).join("")}
      ${img.tags.length ? `<button class="tag-hint" data-toggle>🏷 ${img.tags.length}</button>` : ""}
      ${p.images.length > 1 ? `<span class="count">${index + 1}/${p.images.length}</span>
        ${index > 0 ? `<button class="nav-btn prev" aria-label="Previous">‹</button>` : ""}
        ${index < p.images.length - 1 ? `<button class="nav-btn next" aria-label="Next">›</button>` : ""}` : ""}`;
    $(".items", el).innerHTML = img.tags.map((t, i) => tagListItem(t, i + 1)).join("");
  };
  media.addEventListener("click", (e) => {
    if (e.target.closest(".prev")) { index--; return draw(); }
    if (e.target.closest(".next")) { index++; return draw(); }
    const dot = e.target.closest("[data-tag]");
    $(".bubble", media)?.remove();
    if (dot) {
      const t = p.images[index].tags[Number(dot.dataset.tag)];
      const b = document.createElement(t.shopUrl ? "a" : "div");
      b.className = "bubble";
      if (t.shopUrl) Object.assign(b, { href: t.shopUrl, target: "_blank", rel: "noopener nofollow" });
      b.style.left = dot.style.left;
      b.style.top = dot.style.top;
      b.innerHTML = `<b>${esc(t.brand.name)}</b>${esc(t.product?.name ?? t.label)}${t.product?.price ? ` · ${esc(priceText(t.product))}` : ""}`;
      media.append(b);
      return;
    }
    if (e.target.closest("[data-toggle]") || e.target.tagName === "IMG") { showTags = !showTags; draw(); }
  });
  draw();

  $("[data-like]", el).addEventListener("click", safe(async (e) => {
    if (!state.me) return (location.hash = "#/login");
    p.likedByMe = !p.likedByMe;
    p.likes += p.likedByMe ? 1 : -1;
    e.currentTarget.classList.toggle("on", p.likedByMe);
    e.currentTarget.textContent = p.likedByMe ? "♥" : "♡";
    $("[data-likes]", el).textContent = p.likes;
    await api(`/posts/${p.id}/like`, { method: p.likedByMe ? "PUT" : "DELETE" });
  }));
  $("[data-save]", el).addEventListener("click", safe(async (e) => {
    if (!state.me) return (location.hash = "#/login");
    p.savedByMe = !p.savedByMe;
    e.currentTarget.classList.toggle("on", p.savedByMe);
    e.currentTarget.textContent = p.savedByMe ? "★" : "☆";
    await api(`/posts/${p.id}/save`, { method: p.savedByMe ? "PUT" : "DELETE" });
    toast(p.savedByMe ? "Saved" : "Removed from saved");
  }));
  $("[data-delete-post]", el)?.addEventListener("click", safe(async () => {
    if (!confirm("Delete this post?")) return;
    await api(`/posts/${p.id}`, { method: "DELETE" });
    toast("Post deleted");
    el.remove();
    if (full) location.hash = `#/u/${state.me.username}`;
  }));

  if (full) {
    const list = $(".comments", el);
    const drawComments = (cs) => {
      list.innerHTML = cs.map((c) => `<li><a href="#/u/${esc(c.author.username)}"><b>${esc(c.author.username)}</b></a>
        <span style="flex:1">${esc(c.body)}</span><span class="muted">${timeAgo(c.createdAt)}</span>
        ${state.me && (c.author.username === state.me.username || p.isMine) ? `<button class="link small" data-del-comment="${c.id}">✕</button>` : ""}</li>`).join("");
    };
    api(`/posts/${p.id}/comments`).then(drawComments).catch(() => {});
    list.addEventListener("click", safe(async (e) => {
      const id = e.target.dataset.delComment;
      if (!id) return;
      await api(`/comments/${id}`, { method: "DELETE" });
      drawComments(await api(`/posts/${p.id}/comments`));
    }));
    $(".comment-form", el)?.addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      await api(`/posts/${p.id}/comments`, { method: "POST", body: { body: e.target.body.value } });
      e.target.reset();
      drawComments(await api(`/posts/${p.id}/comments`));
    }));
  }
}

function renderPosts(container, posts, opts) {
  for (const p of posts) {
    const wrap = document.createElement("div");
    wrap.innerHTML = postHtml(p, opts);
    const el = wrap.firstElementChild;
    container.append(el);
    mountPost(el, p, opts);
  }
}

function gridHtml(cards) {
  return cards.map((c) => `<a href="#/p/${c.id}"><img src="${esc(c.thumbUrl)}" alt="" loading="lazy" />
    ${c.tags ? `<span class="meta">🏷 ${c.tags}${c.images > 1 ? ` · ${c.images} photos` : ""}</span>` : ""}</a>`).join("");
}

/** A grid with "Load more" using the id cursor. */
async function pagedGrid(container, path, emptyText) {
  container.innerHTML = `<div class="grid"></div><button class="more" hidden>Load more</button>`;
  const grid = $(".grid", container);
  const more = $(".more", container);
  let before;
  const load = async () => {
    const sep = path.includes("?") ? "&" : "?";
    const cards = await api(`${path}${sep}limit=12${before ? `&before=${before}` : ""}`);
    grid.insertAdjacentHTML("beforeend", gridHtml(cards));
    before = cards.at(-1)?.id;
    more.hidden = cards.length < 12;
    if (!grid.children.length) container.innerHTML = `<p class="empty">${esc(emptyText)}</p>`;
  };
  more.addEventListener("click", safe(load));
  await load();
}

async function feedPage() {
  view.innerHTML = `<div class="narrow"><div id="posts"></div><button class="more" hidden>Load more</button></div>`;
  const posts = $("#posts");
  const more = $(".more");
  let before;
  const load = async () => {
    const page = await api(`/feed?limit=5${before ? `&before=${before}` : ""}`);
    renderPosts(posts, page);
    before = page.at(-1)?.id;
    more.hidden = page.length < 5;
    if (!posts.children.length) {
      posts.innerHTML = `<div class="card empty">Your feed is empty.<br/><br/>
        <a href="#/new"><b>Share your first outfit</b></a> or <a href="#/explore"><b>explore</b></a> and follow people.</div>`;
    }
  };
  more.addEventListener("click", safe(load));
  await load();
}

async function explorePage(params) {
  const q = params?.get("q") ?? "";
  const category = params?.get("category") ?? "";
  if (!state.categories.length) state.categories = await api("/categories");
  const qs = new URLSearchParams({ ...(q && { q }), ...(category && { category }) }).toString();
  view.innerHTML = `
    ${q ? `<h1>Results for “${esc(q)}”</h1><div id="found" class="row" style="margin:8px 0 14px"></div>` : `<h1>Explore</h1><p class="muted">Outfits from everyone. Tap a photo to see what's being worn.</p>`}
    <div class="chips">
      <a class="chip ${category ? "" : "active"}" href="#/explore${q ? `?q=${encodeURIComponent(q)}` : ""}">All</a>
      ${state.categories.map((c) => `<a class="chip ${c === category ? "active" : ""}" href="#/explore?${new URLSearchParams({ ...(q && { q }), category: c })}">${esc(c)}</a>`).join("")}
    </div>
    <div id="grid"></div>`;
  if (q) {
    const [brands, users] = await Promise.all([api(`/brands?q=${encodeURIComponent(q)}`), api(`/users?q=${encodeURIComponent(q)}`)]);
    $("#found").innerHTML = [
      ...brands.slice(0, 5).map((b) => `<a class="chip" href="#/b/${esc(b.slug)}">🏷 ${esc(b.name)}${verifiedMark(b.verified)}</a>`),
      ...users.slice(0, 5).map((u) => `<a class="chip" href="#/u/${esc(u.username)}">@${esc(u.username)}</a>`),
    ].join("");
  }
  await pagedGrid($("#grid"), `/explore${qs ? `?${qs}` : ""}`, "No posts found");
}

async function postPage(id) {
  const p = await api(`/posts/${id}`);
  view.innerHTML = `<div class="narrow" id="one"></div>`;
  renderPosts($("#one"), [p], { full: true });
}

async function savedPage() {
  view.innerHTML = `<h1>Saved</h1><p class="muted">Looks you've saved for later.</p><div id="grid"></div>`;
  await pagedGrid($("#grid"), "/me/saved", "Nothing saved yet. Tap ☆ on a post to save it.");
}

// ---- Profiles & brands -----------------------------------------------------

async function profilePage(username) {
  const u = await api(`/users/${encodeURIComponent(username)}`);
  view.innerHTML = `
    <section class="profile">
      ${avatar(u, "lg")}
      <div style="flex:1;min-width:0">
        <div class="row"><h1 style="margin:0">${esc(u.username)}</h1>${verifiedMark(u.brand?.verified)}
          ${u.isMe ? `<a href="#/settings"><button class="small">Edit profile</button></a><a href="#/saved"><button class="small">Saved</button></a><button class="small" id="logout">Log out</button>`
            : state.me ? `<button class="small ${u.isFollowing ? "" : "primary"}" id="follow">${u.isFollowing ? "Following" : "Follow"}</button>` : ""}
        </div>
        <div class="stats"><span><b>${u.posts}</b> posts</span><span><b id="followers">${u.followers}</b> followers</span><span><b>${u.following}</b> following</span></div>
        <div><b>${esc(u.displayName)}</b></div>
        ${u.bio ? `<div class="bio">${esc(u.bio)}</div>` : ""}
        ${u.brand ? `<a class="muted" href="#/b/${esc(u.brand.slug)}">View brand page →</a>` : ""}
      </div>
    </section>
    <div id="grid"></div>`;
  $("#logout")?.addEventListener("click", () => logout());
  $("#follow")?.addEventListener("click", safe(async (e) => {
    u.isFollowing = !u.isFollowing;
    await api(`/users/${encodeURIComponent(username)}/follow`, { method: u.isFollowing ? "PUT" : "DELETE" });
    u.followers += u.isFollowing ? 1 : -1;
    e.target.textContent = u.isFollowing ? "Following" : "Follow";
    e.target.classList.toggle("primary", !u.isFollowing);
    $("#followers").textContent = u.followers;
  }));
  await pagedGrid($("#grid"), `/users/${encodeURIComponent(username)}/posts`, u.isMe ? "Share your first outfit with ＋ Post" : "No posts yet");
}

async function brandPage(slug, params) {
  const productId = params?.get("product");
  const [b, products] = await Promise.all([api(`/brands/${slug}`), api(`/brands/${slug}/products`)]);
  const selected = products.find((p) => String(p.id) === productId);
  view.innerHTML = `
    <section class="profile">
      ${b.logoUrl ? `<img class="avatar lg" src="${esc(b.logoUrl)}" alt="" />` : `<span class="avatar lg avatar-fallback" style="font-size:36px">${esc(b.name[0])}</span>`}
      <div style="flex:1;min-width:0">
        <div class="row"><h1 style="margin:0">${esc(b.name)}</h1>${verifiedMark(b.verified)}</div>
        <div class="stats"><span><b>${b.postCount}</b> posts</span><span><b>${b.tagCount}</b> tagged items</span></div>
        ${b.description ? `<div class="bio">${esc(b.description)}</div>` : ""}
        <div class="row" style="margin-top:6px">
          ${b.website ? `<a class="shop" href="${esc(b.website)}" target="_blank" rel="noopener nofollow">Visit store</a>` : ""}
          ${b.account ? `<a class="muted" href="#/u/${esc(b.account.username)}">@${esc(b.account.username)}</a>` : ""}
        </div>
        ${!b.claimed ? `<p class="muted">Community brand page, created from people's tags. Is this your brand? <a href="#/signup"><b>Claim it</b></a></p>` : ""}
      </div>
    </section>
    ${products.length ? `<h2>Products</h2><div class="products">${products.map((p) => `
      <a class="product" href="#/b/${esc(slug)}?product=${p.id}" style="${selected?.id === p.id ? "border-color:var(--accent)" : ""}">
        <div class="n">${esc(p.name)}</div><div class="muted">${esc(priceText(p) || p.category)}</div></a>`).join("")}</div>` : ""}
    <div class="row spread"><h2>${selected ? `Seen wearing ${esc(selected.name)}` : `Seen on`}</h2>
      ${selected ? `<a class="muted" href="#/b/${esc(slug)}">Show all</a>` : ""}</div>
    <div id="grid"></div>`;
  await pagedGrid($("#grid"), `/brands/${slug}/posts${selected ? `?product=${selected.id}` : ""}`, "Nobody has tagged this yet");
}

async function settingsPage() {
  const me = state.me;
  view.innerHTML = `<div class="narrow card">
    <h1>Edit profile</h1>
    <div class="row" style="margin:12px 0">${avatar(me, "lg")}<label class="drop" style="padding:12px;flex:1">Change photo<input type="file" id="avatar" accept="image/*" /></label></div>
    <form id="profile">
      <label>Name <input name="displayName" value="${esc(me.displayName)}" maxlength="60" required /></label>
      <label>Bio <textarea name="bio" rows="3" maxlength="300">${esc(me.bio)}</textarea></label>
      <button class="primary">Save</button>
    </form>
    ${me.brandClaim?.status === "PENDING" ? `<p class="muted">Your claim on <b>${esc(me.brandClaim.name)}</b> is waiting for review.</p>` : ""}
    ${me.ownedBrand && !me.ownedBrand.verified ? `<p class="muted"><b>${esc(me.ownedBrand.name)}</b> is waiting for verification.</p>` : ""}
  </div>`;
  $("#avatar").addEventListener("change", safe(async (e) => {
    const form = new FormData();
    form.append("avatar", e.target.files[0]);
    await api("/me/avatar", { method: "PUT", form });
    await loadMe();
    toast("Profile photo updated");
    route();
  }));
  $("#profile").addEventListener("submit", safe(async (e) => {
    e.preventDefault();
    state.me = await api("/me", { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) });
    toast("Profile saved");
    location.hash = `#/u/${state.me.username}`;
  }));
}

// ---- New post + tagging editor ---------------------------------------------

/** Autocomplete input for brand names. Calls onPick({slug, name}) or onPick({name}) for a new brand. */
function brandAutocomplete(input, onPick) {
  const wrap = input.parentElement;
  let list;
  let timer;
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
      list.innerHTML = brands.map((b, i) => `<li data-i="${i}">${esc(b.name)}${verifiedMark(b.verified)}</li>`).join("")
        + (exact ? "" : `<li data-new>Use “${esc(q)}” (new brand)</li>`);
      list.addEventListener("mousedown", (e) => {
        const li = e.target.closest("li");
        if (!li) return;
        e.preventDefault();
        if (li.dataset.new !== undefined) onPick({ name: q });
        else {
          const b = brands[Number(li.dataset.i)];
          input.value = b.name;
          onPick({ slug: b.slug, name: b.name, verified: b.verified });
        }
        close();
      });
      wrap.append(list);
    }, 200);
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

async function newPostPage() {
  if (!state.categories.length) state.categories = await api("/categories");
  const photos = []; // { file, url, width, height }
  const tags = []; // { image, x, y, label, category, brandSlug?, brandName?, brandLabel, productId?, productName?, url? }
  let current = 0;

  view.innerHTML = `<div class="narrow">
    <h1>New post</h1>
    <p class="muted">Add up to 10 photos, then tap on each item you're wearing to tag the brand.</p>
    <label class="drop" id="drop">📷 Choose photos<input type="file" id="files" accept="image/*" multiple /></label>
    <div id="editor" hidden>
      <div class="editor-media" id="canvas"></div>
      <div class="thumbs" id="thumbs"></div>
      <p class="muted">Tap the photo to tag an item. ${"<b>"}Tip:${"</b>"} pick the exact product when the brand has a catalog.</p>
      <ul class="items" id="tag-list"></ul>
      <label>Caption <textarea id="caption" rows="3" maxlength="2200" placeholder="Write a caption…"></textarea></label>
      <div class="row spread"><button id="reset">Start over</button><button class="primary" id="share">Share</button></div>
    </div>
  </div>`;

  const canvas = $("#canvas");
  const draw = () => {
    const ph = photos[current];
    canvas.innerHTML = `<img src="${ph.url}" alt="Photo ${current + 1}" />` +
      tags.map((t, i) => (t.image === current ? `<span class="dot" style="left:${t.x * 100}%;top:${t.y * 100}%;pointer-events:none" title="${esc(t.label)}"></span>` : "")).join("");
    $("#thumbs").innerHTML = photos.length > 1
      ? photos.map((p, i) => `<button class="${i === current ? "active" : ""}" data-i="${i}"><img src="${p.url}" alt="" /></button>`).join("") : "";
    $("#tag-list").innerHTML = tags.length
      ? tags.map((t, i) => `<li><span class="num">${i + 1}</span><div class="info"><div class="l">${esc(t.productName ?? t.label)}</div>
          <div class="muted">${esc(t.brandLabel)} · ${esc(t.category)}${photos.length > 1 ? ` · photo ${t.image + 1}` : ""}</div></div>
          <button class="link" data-remove="${i}">Remove</button></li>`).join("")
      : `<li class="muted" style="justify-content:center">No items tagged yet</li>`;
  };

  $("#files").addEventListener("change", (e) => {
    const files = [...e.target.files].slice(0, 10 - photos.length);
    for (const file of files) photos.push({ file, url: URL.createObjectURL(file) });
    if (!photos.length) return;
    $("#drop").hidden = true;
    $("#editor").hidden = false;
    draw();
  });
  $("#thumbs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) { current = Number(b.dataset.i); draw(); }
  });
  $("#tag-list").addEventListener("click", (e) => {
    const i = e.target.dataset.remove;
    if (i !== undefined) { tags.splice(Number(i), 1); draw(); }
  });
  $("#reset").addEventListener("click", () => route());

  canvas.addEventListener("click", (e) => {
    if (e.target.closest(".tag-form") || e.target.tagName !== "IMG") return;
    const rect = e.target.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    openTagForm(x, y);
  });

  function openTagForm(x, y) {
    $(".tag-form", canvas)?.remove();
    const form = document.createElement("form");
    form.className = "tag-form";
    form.innerHTML = `
      <label class="suggest">Brand <input name="brand" required autocomplete="off" placeholder="e.g. Levi's" /></label>
      <label id="product-wrap" hidden>Product <select name="product"><option value="">Not listed</option></select></label>
      <label>What is it? <input name="label" required maxlength="80" placeholder="e.g. Denim jacket" /></label>
      <label>Category <select name="category">${state.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label>Product link (optional) <input name="url" type="url" placeholder="https://" /></label>
      <div class="row spread"><button type="button" data-cancel>Cancel</button><button class="primary">Add tag</button></div>`;
    canvas.append(form);
    // Keep the form inside the photo: centre it under the tap point, flipping above it near the bottom.
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const fw = form.offsetWidth, fh = form.offsetHeight;
    form.style.left = `${Math.max(8, Math.min(x * W - fw / 2, W - fw - 8))}px`;
    form.style.top = `${y * H + 20 + fh <= H ? y * H + 20 : Math.max(8, y * H - fh - 20)}px`;
    const dot = document.createElement("span");
    dot.className = "dot";
    Object.assign(dot.style, { left: `${x * 100}%`, top: `${y * 100}%`, pointerEvents: "none" });
    canvas.append(dot);
    let brand = { name: "" };
    let products = [];
    const brandInput = form.brand;
    brandAutocomplete(brandInput, async (b) => {
      brand = b;
      products = [];
      $("#product-wrap", form).hidden = true;
      if (!b.slug) return;
      products = await api(`/brands/${b.slug}/products`).catch(() => []);
      if (!products.length) return;
      form.product.innerHTML = `<option value="">Not listed</option>` +
        products.map((p) => `<option value="${p.id}">${esc(p.name)}${p.price ? ` · ${esc(priceText(p))}` : ""}</option>`).join("");
      $("#product-wrap", form).hidden = false;
    });
    form.product.addEventListener("change", () => {
      const p = products.find((x) => String(x.id) === form.product.value);
      if (p) { form.label.value = p.name; form.category.value = p.category; }
    });
    form.addEventListener("click", (e) => e.stopPropagation());
    $("[data-cancel]", form).addEventListener("click", () => { form.remove(); dot.remove(); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = products.find((x) => String(x.id) === form.product.value);
      tags.push({
        image: current, x, y,
        label: form.label.value.trim(),
        category: form.category.value,
        ...(brand.slug ? { brandSlug: brand.slug } : { brandName: brandInput.value.trim() }),
        brandLabel: brand.name || brandInput.value.trim(),
        ...(p ? { productId: p.id, productName: p.name } : {}),
        ...(form.url.value ? { url: form.url.value } : {}),
      });
      draw();
    });
    brandInput.focus();
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
      toast("Posted!");
      location.hash = `#/p/${post.id}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Share";
    }
  }));
}

// ---- Brand dashboard -------------------------------------------------------

async function dashboardPage(_p, params) {
  const tab = params?.get("tab") ?? "review";
  if (!state.categories.length) state.categories = await api("/categories");
  const d = await api("/brand/dashboard");
  view.innerHTML = `
    <div class="row spread"><div><h1>${esc(d.brand.name)} ${verifiedMark(true)}</h1><p class="muted">Brand dashboard</p></div>
      <a href="#/b/${esc(d.brand.slug)}"><button class="small">View public page</button></a></div>
    <div class="stat-row">
      <div class="stat"><div class="muted">Tagged items</div><div class="v">${d.tags.total}</div></div>
      <div class="stat"><div class="muted">To review</div><div class="v">${d.tags.pending}</div></div>
      <div class="stat"><div class="muted">Posts</div><div class="v">${d.posts}</div></div>
      <div class="stat"><div class="muted">Creators</div><div class="v">${d.creators}</div></div>
      <div class="stat"><div class="muted">Shop clicks · 7d</div><div class="v">${d.clicks.last7Days}</div></div>
      <div class="stat"><div class="muted">Shop clicks · 30d</div><div class="v">${d.clicks.last30Days}</div></div>
    </div>
    <div class="tabs">
      ${[["review", `Review tags (${d.tags.pending})`], ["all", "All tags"], ["products", "Products"], ["profile", "Brand profile"]]
        .map(([k, l]) => `<a href="#/brand?tab=${k}"><button class="${k === tab ? "active" : ""}">${l}</button></a>`).join("")}
    </div>
    <div class="card" id="panel"></div>`;
  const panel = $("#panel");

  if (tab === "review" || tab === "all") {
    const [tags, products] = await Promise.all([api(`/brand/tags${tab === "review" ? "?status=PENDING" : ""}`), api("/brand/products")]);
    if (!tags.length) { panel.innerHTML = `<p class="empty">${tab === "review" ? "All caught up — no tags waiting for review." : "No tags yet."}</p>`; return; }
    panel.innerHTML = `<table class="table"><tbody>${tags.map((t) => `
      <tr data-tag="${t.id}">
        <td><a href="#/p/${t.postId}"><img src="${esc(t.thumbUrl)}" alt="" /></a></td>
        <td><b>${esc(t.label)}</b><div class="muted">@${esc(t.author)} · ${esc(t.category)} · ${t.clicks} clicks
          ${t.url ? ` · <a href="${esc(t.url)}" target="_blank" rel="noopener nofollow">their link</a>` : ""}</div>
          ${tab === "all" ? `<span class="badge ${t.status}">${t.status}</span>` : ""}</td>
        <td><select data-product><option value="">${t.product ? "" : "— Match to product —"}</option>${products.map((p) => `<option value="${p.id}" ${t.product?.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>
        <td><div class="row"><button class="small primary" data-act="CONFIRM">Confirm</button><button class="small" data-act="REJECT">Not ours</button></div></td>
      </tr>`).join("")}</tbody></table>`;
    panel.addEventListener("click", safe(async (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      const tr = e.target.closest("tr");
      const productId = $("[data-product]", tr).value;
      await api(`/brand/tags/${tr.dataset.tag}/review`, {
        method: "POST",
        body: { action: act, ...(act === "CONFIRM" && productId ? { productId: Number(productId) } : {}) },
      });
      toast(act === "CONFIRM" ? "Tag confirmed" : "Tag rejected");
      if (tab === "review") tr.remove(); else route();
    }));
  } else if (tab === "products") {
    const products = await api("/brand/products");
    panel.innerHTML = `
      <form id="product" class="row" style="align-items:flex-end;margin-bottom:12px">
        <label style="flex:2 1 160px;margin:0">Name <input name="name" required maxlength="120" /></label>
        <label style="flex:2 1 200px;margin:0">Product URL <input name="url" type="url" required placeholder="https://" /></label>
        <label style="flex:1 1 80px;margin:0">Price <input name="price" inputmode="decimal" /></label>
        <label style="flex:0 1 80px;margin:0">Currency <input name="currency" value="USD" maxlength="3" /></label>
        <label style="flex:1 1 110px;margin:0">Category <select name="category">${state.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
        <button class="primary">Add</button>
      </form>
      <table class="table"><tbody>${products.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="muted">${esc(p.category)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(new URL(p.url).hostname)}</a></div></td>
        <td>${esc(priceText(p))}</td><td><button class="small" data-archive="${p.id}">Archive</button></td></tr>`).join("") || `<tr><td class="muted">No products yet. Add products so people can tag the exact item.</td></tr>`}</tbody></table>`;
    $("#product").addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await api("/brand/products", { method: "POST", body: { ...f, price: f.price || undefined, currency: f.currency.toUpperCase() } });
      toast("Product added");
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
      <div class="row" style="margin-bottom:12px">${d.brand.logoUrl ? `<img class="avatar lg" src="${esc(d.brand.logoUrl)}" alt="" />` : ""}
        <label class="drop" style="padding:12px;flex:1">Upload logo<input type="file" id="logo" accept="image/*" /></label></div>
      <label>Website <input name="website" type="url" value="${esc(d.brand.website ?? "")}" /></label>
      <label>About <textarea name="description" rows="3" maxlength="500">${esc(d.brand.description)}</textarea></label>
      <button class="primary">Save</button></form>`;
    $("#logo").addEventListener("change", safe(async (e) => {
      const form = new FormData();
      form.append("logo", e.target.files[0]);
      await api("/brand/logo", { method: "PUT", form });
      toast("Logo updated");
      route();
    }));
    $("#brand").addEventListener("submit", safe(async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await api("/brand", { method: "PATCH", body: { website: f.website || undefined, description: f.description } });
      toast("Brand profile saved");
    }));
  }
}

async function adminPage() {
  const q = await api("/admin/queue");
  view.innerHTML = `<div id="admin"><h1>Admin</h1>
    <div class="card"><h2>Brands waiting for verification</h2>
      ${q.brandsToVerify.length ? `<table class="table"><tbody>${q.brandsToVerify.map((b) => `<tr><td><b>${esc(b.name)}</b>
        <div class="muted">@${esc(b.owner)} · <a href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website)}</a></div></td>
        <td><button class="small primary" data-verify="${esc(b.slug)}">Verify</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">None</p>`}
    </div>
    <div class="card"><h2>Brand claims</h2>
      ${q.claims.length ? `<table class="table"><tbody>${q.claims.map((c) => `<tr><td><b>${esc(c.name)}</b>
        <div class="muted">claimed by @${esc(c.username)} (${esc(c.email)}) ${c.message ? `· “${esc(c.message)}”` : ""}</div></td>
        <td><div class="row"><button class="small primary" data-claim="${c.id}" data-approve="1">Approve</button><button class="small" data-claim="${c.id}">Reject</button></div></td></tr>`).join("")}</tbody></table>` : `<p class="muted">None</p>`}
    </div></div>`;
  $("#admin").addEventListener("click", safe(async (e) => {
    const { verify, claim, approve } = e.target.dataset;
    if (verify) await api(`/admin/brands/${verify}/verify`, { method: "POST", body: { verified: true } });
    else if (claim) await api(`/admin/claims/${claim}`, { method: "POST", body: { approve: Boolean(approve) } });
    else return;
    toast("Done");
    route();
  }));
}

// ---- Boot ------------------------------------------------------------------

await loadMe();
route();
