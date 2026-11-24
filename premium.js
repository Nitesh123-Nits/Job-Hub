/* JobHub premium layer: company search, application tracker, outreach templates,
   live remote-jobs feed, dark mode and backup/restore.
   Loaded after the inline script in index.html; reuses its globals (DATA, CITIES, WINS, noIcon).
   All user data stays in this browser's localStorage under "jobhub2-*" keys. */
(() => {
"use strict";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const enc = encodeURIComponent;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const K = { track: "jobhub2-track", watch: "jobhub2-watch", prof: "jobhub2-profile", cmp: "jobhub2-cmp",
            out: "jobhub2-out", theme: "jobhub2-theme", style: "jobhub2-style", live: "jobhub2-live", fetches: "jobhub2-fetches" };
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const favicon = d => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;

let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const a = document.createElement("textarea"); a.value = text; a.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (_) {} a.remove();
  }
  toast("Copied");
}
const cardHTML = x => `<a class="card" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">
  <div class="top"><span class="logo"><img src="${favicon(x.ic)}" alt="" loading="lazy" data-l="${esc(x.n[0])}" onerror="noIcon(this)"></span><span class="arrow">↗</span></div>
  <div><span class="tag IN">${esc(x.tag)}</span><div class="nm">${esc(x.n)}</div><div class="ds">${esc(x.d)}</div></div></a>`;
const chip = (on, attr, val, label) => `<button class="chip ${on ? "on" : ""}" ${attr}="${esc(val)}">${esc(label)}</button>`;

/* ---------- state ---------- */
let prof = Object.assign({ name: "", role: "", years: "", skills: "" }, store.get(K.prof, {}));
let track = store.get(K.track, []);
let watch = store.get(K.watch, []);
const savedCmp = store.get(K.cmp, null);
let cs = Object.assign({ name: "", role: "", roles: [], cities: ["India"], win: "w" }, savedCmp || {});
if (!Array.isArray(cs.cities) || !cs.cities.length) cs.cities = [savedCmp && savedCmp.city ? savedCmp.city : "India"]; // migrate single-city value
cs.cities = cs.cities.filter(k => CITIES.some(c => c.k === k)); if (!cs.cities.length) cs.cities = ["India"];
if (!savedCmp) cs.roles = [prof.role || "Java Backend Developer"];
else if (!Array.isArray(savedCmp.roles)) { // migrate the single-role value saved by an earlier version
  const hit = ROLES.find(r => r.toLowerCase() === String(savedCmp.role || "").trim().toLowerCase());
  cs.roles = hit ? [hit] : []; cs.role = hit ? "" : String(savedCmp.role || "");
}
// selected quick-role chips plus any typed role, de-duplicated
if (cs.role && cs.role.trim() && !cs.roles.some(r => r.toLowerCase() === cs.role.trim().toLowerCase())) cs.roles.push(cs.role.trim()); // typed roles now live in the dropdown
cs.role = "";
const activeRoles = () => [...cs.roles];
let liveRoles = store.get("jobhub2-lroles", []); if (!Array.isArray(liveRoles)) liveRoles = [];
const roleExpr = list => list.length > 1 ? `(${list.map(r => `"${r}"`).join(" OR ")})` : (list[0] || "");
let os = Object.assign({ company: "", contact: "", role: "" }, store.get(K.out, {}));
const saveTrack = () => { store.set(K.track, track); drawStats(); };

/* ---------- inject UI ---------- */
$("main").insertAdjacentHTML("beforebegin", `
<div class="wrap pane" id="cmp" hidden><section>
  <div class="sh"><span class="no">00</span><h2>Company Search</h2><span class="ct" id="ccount"></span><p>Type a company. Get its jobs, career pages, hiring posts, recruiters and reviews as ready-made searches.</p></div>
  <div class="row">
    <input id="c-name" class="custom" list="c-list" placeholder="Company, e.g. Razorpay" autocomplete="off" aria-label="Company name">
  </div>
  <datalist id="c-list"></datalist>
  <div class="bl">Roles</div><div id="c-roles"></div>
  <div class="bl">Location</div><div class="chips" id="c-cities"></div>
  <div class="bl">Posted within</div><div class="chips" id="c-wins"></div>
  <div class="bl">Filters (LinkedIn)</div><div class="chips" id="c-flt"></div>
  <div class="bl">Watchlist</div><div class="chips" id="c-watch"></div>
  <div class="now" id="c-now"></div>
  <div class="actions" id="c-act"></div>
  <div id="c-results"></div>
</section></div>

<div class="wrap pane" id="trk" hidden><section>
  <div class="sh"><span class="no">00</span><h2>Tracker</h2><span class="ct" id="tcount"></span><p>Every job you save or apply to, with a follow-up date so nothing goes cold. Stored only in this browser.</p></div>
  <div class="addform">
    <div class="row">
      <input id="t-co" class="custom" placeholder="Company" autocomplete="off" aria-label="Company">
      <input id="t-role" class="custom" placeholder="Role" autocomplete="off" aria-label="Role">
      <input id="t-url" class="custom" placeholder="Job link (optional)" autocomplete="off" aria-label="Job link">
      <select id="t-st" class="sel" aria-label="Status"></select>
      <button class="btn" id="t-add" style="margin-top:10px">Add</button>
    </div>
  </div>
  <div class="actions" style="margin-top:14px">
    <button class="btn ghost" id="t-exp">Export backup</button>
    <button class="btn ghost" id="t-imp">Import backup</button>
    <input type="file" id="t-file" accept="application/json" hidden>
  </div>
  <div class="board" id="board"></div>
</section></div>

<div class="wrap pane" id="out" hidden><section>
  <div class="sh"><span class="no">00</span><h2>Outreach</h2><span class="ct">6 templates</span><p>Fill the fields once. Messages for LinkedIn, recruiters, referrals and follow-ups are written for you to copy.</p></div>
  <div class="bl">About you (saved in this browser)</div>
  <div class="row">
    <input id="o-name" class="custom" placeholder="Your name" autocomplete="off" aria-label="Your name">
    <input id="o-years" class="custom" placeholder="Years of experience" autocomplete="off" inputmode="numeric" aria-label="Years of experience">
    <input id="o-skills" class="custom" placeholder="Key skills, e.g. Java, Spring Boot, Kafka" autocomplete="off" aria-label="Key skills">
  </div>
  <div class="bl">This application</div>
  <div class="row">
    <input id="o-company" class="custom" placeholder="Company" autocomplete="off" aria-label="Company">
    <input id="o-role" class="custom" placeholder="Role" autocomplete="off" aria-label="Role">
    <input id="o-contact" class="custom" placeholder="Recruiter / referrer name" autocomplete="off" aria-label="Contact name">
    <input id="o-jobid" class="custom" placeholder="Job ID / requisition no. (for referrals)" autocomplete="off" aria-label="Job ID">
  </div>
  <div id="o-tpls"></div>
</section></div>

<div class="wrap pane" id="live" hidden><section>
  <div class="sh"><span class="no">00</span><h2>Live Remote Jobs</h2><span class="ct" id="lcount"></span><p>Remote software listings gathered from several free job feeds. Apply on the original posting.</p></div>
  <div class="bl">Roles</div><div id="l-roles"></div>
  <div class="row">
    <input id="l-q" class="custom" placeholder="Filter by company or keyword, e.g. kafka" autocomplete="off" aria-label="Filter jobs">
    <button class="btn ghost" id="l-ref" style="margin-top:10px">Reload</button>
  </div>
  <div class="chips" id="l-chips" style="margin-top:10px"></div>
  <div class="live-meta" id="l-meta"></div>
  <div id="l-err"></div>
  <div id="l-list"></div>
</section></div>
<div class="wrap pane" id="ai" hidden><section>
  <div class="sh"><span class="no">00</span><h2>AI Tools</h2><span class="ct">6 tools</span><p>Your Claude-powered tools. Each one opens in claude.ai in a new tab, where it uses your Claude account. Sign in to claude.ai first.</p></div>
  <div class="ai-grid">
    <a class="ai-card" href="https://claude.ai/artifact/6a2YjqLm2oUqgkKJJzZSKo" target="_blank" rel="noopener"><span class="ai-tag">Resume</span><b>Resume Tailor</b><span>Paste a job description and get a tailored LaTeX resume, a PDF and an ATS score.</span></a>
    <a class="ai-card" href="https://claude.ai/artifact/K5xRSc2xGM3BVgVYTx7Ysq" target="_blank" rel="noopener"><span class="ai-tag">Outreach</span><b>Outreach Studio</b><span>Cover letters, HR emails, LinkedIn notes and referral requests.</span></a>
    <a class="ai-card" href="https://claude.ai/artifact/7vybnJ6PwvWxxdaunnzimi" target="_blank" rel="noopener"><span class="ai-tag">Pipeline</span><b>Job Hunt Board</b><span>Applications from wishlist to offer, with follow-ups and AI drafts.</span></a>
    <a class="ai-card" href="https://claude.ai/artifact/NVjDkNS9RTPjuqNri4dmNV" target="_blank" rel="noopener"><span class="ai-tag">Learning</span><b>Interview Dojo</b><span>Mock interviews, system design rounds, a DSA solver and resume-based questions.</span></a>
    <a class="ai-card" href="https://claude.ai/artifact/1P4mn4q6E8Gwg8wiM36yjo" target="_blank" rel="noopener"><span class="ai-tag">Interviews</span><b>HR &amp; Manager Round Coach</b><span>HR screens, salary talks, behavioural, manager, Googliness and Amazon Leadership Principle rounds.</span></a>
    <a class="ai-card" href="https://claude.ai/artifact/M4nMe44bHAmaEGLj9Gq4vz" target="_blank" rel="noopener"><span class="ai-tag">Reading</span><b>Blog Digest</b><span>Paste a blog link and get a structured summary.</span></a>
  </div>
  <p class="ai-note">These tools need a Claude account, so they run on claude.ai rather than inside this page. Links open in a new tab.</p>
</section></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`);

// hero: stats tiles + quick company search
document.querySelector(".lede").insertAdjacentHTML("afterend", `
<div class="stats" id="stats"></div>
<form class="qc" id="qc" autocomplete="off"><input id="qc-in" list="c-list" placeholder="Company name, e.g. Razorpay" aria-label="Quick company search"><button type="submit">Search</button></form>`);

// theme toggle
$("install").insertAdjacentHTML("beforebegin", `<button class="themebtn" id="style" aria-label="Switch design"></button><button class="themebtn" id="theme" aria-label="Toggle dark mode"></button>`);

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("theme").textContent = t === "dark" ? "Light" : "Dark";
  paintBrowserBar();
}
// "modern" (default) or "classic" (the original editorial look)
function applyStyle(s) {
  document.documentElement.dataset.style = s;
  $("style").textContent = s === "modern" ? "Classic look" : "Modern look";
  paintBrowserBar();
}
function paintBrowserBar() {
  const dark = document.documentElement.dataset.theme === "dark", modern = document.documentElement.dataset.style === "modern";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? (modern ? "#1B1611" : "#0F0F0D") : (modern ? "#EEE5D0" : "#F3F0E8");
}
$("style").addEventListener("click", () => {
  const s = document.documentElement.dataset.style === "modern" ? "classic" : "modern";
  store.set(K.style, s); applyStyle(s);
});
$("theme").addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  store.set(K.theme, t); applyTheme(t);
});
applyStyle(store.get(K.style, null) || "modern");
applyTheme(store.get(K.theme, null) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ---------- stats ---------- */
const ST = [["saved", "Saved"], ["applied", "Applied"], ["interview", "Interview"], ["offer", "Offer"], ["rejected", "Rejected"]];
const isDue = j => j.status === "applied" && j.follow && j.follow <= today();
function drawStats() {
  const applied = track.filter(j => j.applied).length;
  const interviews = track.filter(j => j.status === "interview").length;
  const due = track.filter(isDue).length;
  $("stats").innerHTML = [["Tracked", track.length, ""], ["Applied", applied, ""], ["Interviews", interviews, ""], ["Follow-ups due", due, due ? "alert" : ""]]
    .map(s => `<button class="stat ${s[2]}" data-go="trk"><b>${s[1]}</b><span>${s[0]}</span></button>`).join("");
}
$("stats").addEventListener("click", () => goTab("trk"));
function goTab(id) { const b = document.querySelector(`.tab[data-t="${id}"]`); if (b) { b.click(); window.scrollTo({ top: document.querySelector(".controls").offsetTop, behavior: "smooth" }); } }

/* ---------- company search ---------- */
const CAT_IDS = ["bigtech", "finance", "product", "indiaco", "remoteco"];
$("c-list").innerHTML = [...new Set(DATA.filter(c => CAT_IDS.includes(c.id)).flatMap(c => c.s.map(s => s[0])))].sort()
  .map(n => `<option value="${esc(n)}">`).join("");
const FROMAGE = { d: 1, "3": 3, w: 7, m: 14 }; // Indeed supports 1, 3, 7, 14 days

function companyLinks() {
  const n = cs.name.trim(); if (!n) return { groups: [], jobsUrl: "" };
  const cl = pickCities(cs.cities), multiLoc = cl.length > 1;
  const w = WINS.find(x => x.k === cs.win) || WINS[2];
  const role = roleExpr(activeRoles());
  const kw = [role, n].filter(Boolean).join(" ");
  const locOf = c => c.remote ? "remote India" : (c.k === "India" ? "India" : c.n);
  const loc = multiLoc ? "(" + cl.map(c => c.remote ? "remote" : (c.k === "India" ? "India" : (/\s/.test(c.n) ? `"${c.n}"` : c.n))).join(" OR ") + ")" : locOf(cl[0]);
  const q = `"${n}"`;
  const g = (s, timed) => `https://www.google.com/search?q=${enc(s)}${timed === false ? "" : "&tbs=" + enc("qdr:" + w.g)}`;
  const li = s => `https://www.linkedin.com/search/results/content/?keywords=${enc(s)}&datePosted=${enc('"' + w.li + '"')}&sortBy=${enc('"date_posted"')}&origin=FACETED_SEARCH`;
  const pe = s => `https://www.linkedin.com/search/results/people/?keywords=${enc(s)}&origin=GLOBAL_SEARCH_HEADER`;
  const liJobs = c => `https://www.linkedin.com/jobs/search/?keywords=${enc(kw)}&location=${enc(c.li)}&f_TPR=${w.jr}&sortBy=DD${c.remote ? "&f_WT=2" : ""}${liFilt()}`;
  const jobsUrl = liJobs(cl[0]);
  const where = c => multiLoc ? ` · ${c.n}` : "";
  const jobItems = cl.flatMap(c => [
    { n: "LinkedIn Jobs" + where(c), d: `${kw}, newest first${FILT.easy ? ", Easy Apply" : ""}`, u: liJobs(c), tag: w.n, ic: "linkedin.com" },
    { n: "Indeed India" + where(c), d: `${kw} in ${c.ind}`, u: `https://in.indeed.com/jobs?q=${enc(kw)}&l=${enc(c.ind)}&fromage=${FROMAGE[w.k]}&sort=date`, tag: w.n, ic: "indeed.com" },
    { n: "Google Jobs" + where(c), d: "Aggregates many boards", u: `https://www.google.com/search?q=${enc(`${n}${role ? " " + role : ""} jobs ${locOf(c)}`)}&ibp=htl%3Bjobs`, tag: "Listings", ic: "google.com" }]);
  const ATS = "(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com)";
  const L = "linkedin.com", GG = "google.com";
  const rl = role ? ` ${role}` : "";
  const groups = [
    { g: `Jobs at ${n}`, items: [
      ...jobItems,
      { n: "Naukri", d: `Naukri listings found through Google`, u: g(`site:naukri.com ${q}${rl} ${loc}`), tag: w.n, ic: "naukri.com" }] },
    { g: `${n} career pages`, items: [
      { n: "Official careers", d: `${n} careers${rl}`, u: g(`${q} careers${rl} ${loc}`, false), tag: "Careers", ic: GG },
      { n: "Greenhouse, Lever, Ashby, Workday", d: "Company job boards", u: g(`${ATS} ${q}${rl}`), tag: w.n, ic: "greenhouse.io" }] },
    { g: "Hiring posts", items: [
      { n: "LinkedIn hiring posts", d: `Posts: hiring ${n}${rl}`, u: li(`hiring ${n}${rl}`), tag: w.pl, ic: L },
      { n: "LinkedIn referral posts", d: `Posts: ${n} referral`, u: li(`${n} referral${rl}`), tag: w.pl, ic: L },
      { n: "Google · LinkedIn posts", d: `site:linkedin.com/posts hiring ${n}`, u: g(`site:linkedin.com/posts hiring ${q}${rl}`), tag: w.n, ic: L }] },
    { g: "People to message", items: [
      { n: "Recruiters", d: `${n} technical recruiter`, u: pe(`${n} technical recruiter`), tag: "People", ic: L },
      { n: "Talent acquisition", d: `${n} talent acquisition India`, u: pe(`${n} talent acquisition India`), tag: "People", ic: L },
      { n: "Engineering managers", d: `${n} engineering manager`, u: pe(`${n} engineering manager`), tag: "People", ic: L },
      { n: "Employees for referral", d: `${n}${rl}`, u: pe(`${n}${rl}`), tag: "People", ic: L }] },
    { g: "Research the company", items: [
      { n: "LinkedIn company page", d: `Company search: ${n}`, u: `https://www.linkedin.com/search/results/companies/?keywords=${enc(n)}&origin=GLOBAL_SEARCH_HEADER`, tag: "Company", ic: L },
      { n: "Glassdoor", d: "Reviews, salaries, interviews", u: `https://www.glassdoor.co.in/Search/results.htm?keyword=${enc(n)}`, tag: "Reviews", ic: "glassdoor.co.in" },
      { n: "Interview experiences", d: `${n}${rl} interview experience`, u: g(`${q}${rl} interview experience`, false), tag: "Prep", ic: GG },
      { n: "Salary data", d: "AmbitionBox, Levels.fyi, Glassdoor", u: g(`${q}${rl} salary India (site:ambitionbox.com OR site:levels.fyi OR site:glassdoor.co.in)`, false), tag: "Pay", ic: GG },
      { n: "Hiring and layoff news", d: `News about ${n}`, u: `https://www.google.com/search?q=${enc(`${n} hiring OR layoffs`)}&tbm=nws`, tag: "News", ic: GG }] }
  ];
  return { groups, jobsUrl };
}
function drawCompany() {
  cMS.refresh();
  $("c-cities").innerHTML = CITIES.map(x => chip(cs.cities.includes(x.k), "data-c", x.k, x.n)).join("");
  $("c-wins").innerHTML = WINS.map(x => chip(x.k === cs.win, "data-w", x.k, x.n)).join("");
  $("c-flt").innerHTML = filtChips();
  $("c-watch").innerHTML = watch.length
    ? watch.map(w => `<button class="chip x ${cs.name.toLowerCase() === w.toLowerCase() ? "on" : ""}" data-w="${esc(w)}">${esc(w)}<i data-rm="${esc(w)}" title="Remove">✕</i></button>`).join("")
    : `<span class="hint" style="margin:0">Star a company to keep it here.</span>`;
  const { groups } = companyLinks();
  const total = groups.reduce((a, x) => a + x.items.length, 0);
  $("ccount").textContent = total ? total + " searches" : "";
  $("c-now").innerHTML = cs.name.trim() ? `${esc(cs.name.trim())} <em>·</em> ${esc(pickCities(cs.cities).map(c => c.n).join(", "))}` : "";
  $("c-act").innerHTML = cs.name.trim()
    ? `<button class="btn ghost" id="c-star">${watch.some(w => w.toLowerCase() === cs.name.trim().toLowerCase()) ? "★ Watching" : "☆ Watch company"}</button><button class="btn ghost" id="c-track">+ Track this company</button>`
    : "";
  $("c-results").innerHTML = groups.length
    ? groups.map(g => `<div class="bl">${esc(g.g)}</div><div class="grid">${g.items.map(cardHTML).join("")}</div>`).join("")
    : `<div class="hint">Start with a company name above, for example a firm from the Big Tech or Banks lists.</div>`;
  store.set(K.cmp, cs);
}
$("c-name").addEventListener("input", e => { cs.name = e.target.value; drawCompany(); });
const cMS = MS($("c-roles"), { get: () => cs.roles, set: a => { cs.roles = a; drawCompany(); }, none: "Any role" });
$("cmp").addEventListener("click", e => {
  const rm = e.target.closest("[data-rm]");
  if (rm) { e.stopPropagation(); watch = watch.filter(w => w !== rm.dataset.rm); store.set(K.watch, watch); drawCompany(); return; }
  const b = e.target.closest("button"); if (!b) return;
  if (b.closest(".ms")) return;
  if (b.closest("#c-flt")) { toggleFilt(b); drawBuilder(); drawSmart(); }
  else if (b.dataset.c) cs.cities = toggleCity(cs.cities, b.dataset.c);
  else if (b.dataset.w && b.closest("#c-wins")) cs.win = b.dataset.w;
  else if (b.dataset.w) { cs.name = b.dataset.w; $("c-name").value = cs.name; }
  else if (b.id === "c-star") {
    const n = cs.name.trim(), has = watch.some(w => w.toLowerCase() === n.toLowerCase());
    watch = has ? watch.filter(w => w.toLowerCase() !== n.toLowerCase()) : [...watch, n];
    store.set(K.watch, watch);
  } else if (b.id === "c-track") {
    addJob({ company: cs.name.trim(), role: activeRoles().join(", "), url: companyLinks().jobsUrl, status: "saved" });
    toast("Added to tracker"); return;
  } else return;
  drawCompany();
});
$("qc").addEventListener("submit", e => {
  e.preventDefault(); const v = $("qc-in").value.trim(); if (!v) return;
  cs.name = v; $("c-name").value = v; goTab("cmp"); $("qc-in").value = "";
});

/* ---------- tracker ---------- */
$("t-st").innerHTML = ST.map(s => `<option value="${s[0]}">${s[1]}</option>`).join("");
function addJob(j) {
  const now = today();
  const job = { id: uid(), company: j.company || "Untitled", role: j.role || "", url: j.url || "", status: j.status || "saved",
                added: now, applied: "", follow: "", notes: "" };
  if (job.status !== "saved") stampApplied(job);
  track.unshift(job); saveTrack(); if (!$("trk").hidden) drawTracker();
}
function stampApplied(job) {
  if (!job.applied) job.applied = today();
  if (job.status === "applied" && !job.follow) job.follow = addDays(job.applied, 7);
}
function ago(dateStr) {
  const d = daysBetween(dateStr, today());
  return d <= 0 ? "today" : d === 1 ? "1d ago" : d + "d ago";
}
function drawTracker() {
  $("tcount").textContent = track.length + (track.length === 1 ? " job" : " jobs");
  $("board").innerHTML = ST.map(([key, label]) => {
    const items = track.filter(j => j.status === key);
    return `<div class="col"><h3>${label}<em>${items.length}</em></h3>${items.length ? items.map(tkCard).join("") : `<div class="none">Nothing here</div>`}</div>`;
  }).join("");
}
function tkCard(j) {
  const due = isDue(j);
  const meta = [`Added ${ago(j.added)}`, j.applied ? `Applied ${ago(j.applied)}` : "", due ? `<span class="due">Follow up now</span>` : ""].filter(Boolean).join(" · ");
  return `<article class="tk" data-id="${j.id}">
    <div class="tk-h"><b>${esc(j.company)}</b><button data-act="del" aria-label="Delete">✕</button></div>
    ${j.role ? `<div class="tk-r">${esc(j.role)}</div>` : ""}
    <div class="tk-m">${meta}</div>
    <textarea data-act="note" placeholder="Notes: contact, round, next step" aria-label="Notes">${esc(j.notes)}</textarea>
    <div class="tk-f">
      <select class="sel" data-act="status" aria-label="Status">${ST.map(s => `<option value="${s[0]}" ${s[0] === j.status ? "selected" : ""}>${s[1]}</option>`).join("")}</select>
      <input type="date" class="dt" data-act="follow" value="${esc(j.follow)}" aria-label="Follow-up date" title="Follow-up date">
      ${j.url ? `<a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}
    </div></article>`;
}
$("t-add").addEventListener("click", () => {
  const co = $("t-co").value.trim(); if (!co) { $("t-co").focus(); return; }
  let url = $("t-url").value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  addJob({ company: co, role: $("t-role").value.trim(), url, status: $("t-st").value });
  ["t-co", "t-role", "t-url"].forEach(i => $(i).value = ""); toast("Added");
});
$("t-co").addEventListener("keydown", e => { if (e.key === "Enter") $("t-add").click(); });
$("board").addEventListener("click", e => {
  const b = e.target.closest('[data-act="del"]'); if (!b) return;
  if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = "Sure?"; setTimeout(() => { b.classList.remove("sure"); b.textContent = "✕"; }, 2500); return; }
  const id = b.closest(".tk").dataset.id; track = track.filter(j => j.id !== id); saveTrack(); drawTracker();
});
$("board").addEventListener("change", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const job = track.find(j => j.id === el.closest(".tk").dataset.id); if (!job) return;
  if (el.dataset.act === "note") job.notes = el.value;
  else if (el.dataset.act === "follow") job.follow = el.value;
  else if (el.dataset.act === "status") {
    job.status = el.value;
    if (job.status === "applied") { job.follow = ""; stampApplied(job); }
    else if (job.status !== "saved") stampApplied(job);
  }
  saveTrack(); if (el.dataset.act !== "note") drawTracker();
});
// backup and restore
$("t-exp").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "jobhub", version: 1, exported: new Date().toISOString(), track, watch, profile: prof }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `jobhub-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded");
});
$("t-imp").addEventListener("click", () => $("t-file").click());
$("t-file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== "jobhub" || !Array.isArray(d.track)) throw new Error("bad file");
    const have = new Set(track.map(j => j.id));
    const clean = d.track.filter(j => j && typeof j.id === "string" && !have.has(j.id)).map(j => ({
      id: j.id, company: String(j.company || "Untitled"), role: String(j.role || ""), url: /^https?:\/\//i.test(j.url || "") ? j.url : "",
      status: ST.some(s => s[0] === j.status) ? j.status : "saved", added: String(j.added || today()), applied: String(j.applied || ""),
      follow: String(j.follow || ""), notes: String(j.notes || "") }));
    track = [...clean, ...track]; saveTrack();
    if (Array.isArray(d.watch)) { watch = [...new Set([...watch, ...d.watch.map(String)])]; store.set(K.watch, watch); }
    drawTracker(); toast(`Imported ${clean.length} jobs`);
  } catch (err) { toast("That file isn't a JobHub backup"); }
});

/* ---------- outreach ---------- */
const v = (x, ph) => (x && String(x).trim()) || ph;
function templates() {
  const name = v(prof.name, "[Your name]"), years = v(prof.years, "[X]"), skills = v(prof.skills, "[your key skills]");
  const co = v(os.company, "[Company]"), role = v(os.role || prof.role, "[Role]"), who = v(os.contact, "[Name]"), jobId = v(os.jobId, "[Job ID]");
  return [
    { t: "LinkedIn connection note", max: 300, body:
`Hi ${who}, I'm a ${role} with ${years}+ years in ${skills}. I'm interested in the work at ${co} and would love to connect.` },
    { t: "LinkedIn message to a recruiter", body:
`Hi ${who},

I saw the ${role} opening at ${co}. I have ${years}+ years of experience in ${skills}, and the role looks like a close match for my background.

Could you tell me the next steps, or point me to the right person? I can share my resume right away.

Thanks,
${name}` },
    { t: "Email to HR", subject: `Application for ${role} – ${name}`, body:
`Hi ${who},

I'm writing to apply for the ${role} position at ${co}. I have ${years}+ years of experience in ${skills}.

My resume is attached. I'd be glad to discuss how I can contribute to your team and am available for a call at your convenience.

Regards,
${name}` },
    { t: "Referral request", body:
`Hi ${who},

Hope you're doing well. I noticed ${co} is hiring for ${role} and I'd like to apply. I have ${years}+ years of experience in ${skills}.

Job ID: ${jobId}

Would you be comfortable referring me? I can send my resume and a short summary so it's easy for you. Thanks either way!

${name}` },
    { t: "Follow-up after applying", subject: `Following up: ${role} application – ${name}`, body:
`Hi ${who},

I applied for the ${role} role at ${co} and wanted to follow up. I'm still very interested and happy to share anything that would help with your review.

Could you let me know where the application stands?

Thanks,
${name}` },
    { t: "Thank-you after an interview", subject: `Thank you – ${role} interview`, body:
`Hi ${who},

Thank you for taking the time to speak with me about the ${role} role at ${co}. I enjoyed the conversation and I'm excited about the team's work.

Please let me know if you need anything else from me.

Best regards,
${name}` }
  ];
}
let tplCache = [];
function drawTemplates() {
  tplCache = templates();
  $("o-tpls").innerHTML = tplCache.map((t, i) => {
    const n = t.body.length, over = t.max && n > t.max;
    return `<div class="tpl"><div class="tpl-h"><b>${esc(t.t)}</b>${t.max ? `<span class="cnt ${over ? "over" : ""}">${n}/${t.max}</span>` : ""}</div>
      ${t.subject ? `<div class="ds" style="margin-bottom:8px">Subject: ${esc(t.subject)}</div>` : ""}
      <pre>${esc(t.body)}</pre>
      <div class="actions"><button class="btn" data-copy="${i}">Copy</button>
      ${t.subject ? `<a class="btn ghost" href="mailto:?subject=${enc(t.subject)}&body=${enc(t.body)}">Open in mail</a>` : ""}</div></div>`;
  }).join("");
}
function drawOutreach() {
  $("o-name").value = prof.name; $("o-years").value = prof.years; $("o-skills").value = prof.skills;
  $("o-company").value = os.company; $("o-role").value = os.role; $("o-contact").value = os.contact; $("o-jobid").value = os.jobId || "";
  drawTemplates();
}
const bindO = (id, obj, key, storeKey) => $(id).addEventListener("input", e => { obj[key] = e.target.value; store.set(storeKey, obj); drawTemplates(); });
bindO("o-name", prof, "name", K.prof); bindO("o-years", prof, "years", K.prof); bindO("o-skills", prof, "skills", K.prof);
bindO("o-company", os, "company", K.out); bindO("o-role", os, "role", K.out); bindO("o-contact", os, "contact", K.out); bindO("o-jobid", os, "jobId", K.out);
$("o-tpls").addEventListener("click", e => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const t = tplCache[+b.dataset.copy]; copy(t.subject ? `Subject: ${t.subject}\n\n${t.body}` : t.body);
});

/* ---------- live remote jobs ----------
   Primary source: data/jobs.json, refreshed three times a day by the "Update live jobs" GitHub Action, which pulls
   Remotive, Jobicy, Remote OK and Arbeitnow on the server (no CORS problems, no per-visitor rate limits).
   Fallback when that file is empty or missing: Remotive straight from the browser, cached 6h and capped at
   4 fetches per rolling 24h, as Remotive asks. Every listing keeps its original link and source name. */
const LIVE_URL = "https://remotive.com/api/remote-jobs?category=software-dev&limit=250";
const SRC_URL = { "Remotive": "https://remotive.com", "Jobicy": "https://jobicy.com", "Remote OK": "https://remoteok.com", "Arbeitnow": "https://www.arbeitnow.com" };
let liveJobs = [], liveQ = "", liveIndia = true, liveSrc = "", liveLoaded = false, liveFetchedAt = 0, liveMode = "", liveSources = [];
// Match a job title to a selected role: normalise synonyms, then require every role word to appear in the title or tags.
const roleTokens = s => String(s).toLowerCase()
  .replace(/back[\s-]?end/g, "backend").replace(/front[\s-]?end/g, "frontend").replace(/full[\s-]?stack/g, "fullstack")
  .replace(/software development engineer|software developer/g, "software engineer").replace(/\bsde\s*-?\s*(i{1,3}|[123])\b/g, "software engineer")
  .replace(/\bdeveloper\b/g, "engineer").replace(/\bsr\.?(?=\s)/g, "senior").replace(/\btechnical\b/g, "tech").replace(/\bspring boot\b/g, "spring")
  .split(/[^a-z0-9+#]+/).filter(Boolean).map(t => t.length > 3 ? t.replace(/s$/, "") : t);
const jobMatchesRoles = (j, roles) => {
  if (!roles.length) return true;
  const have = new Set(roleTokens(`${j.title} ${(j.tags || []).join(" ")}`));
  return roles.some(r => roleTokens(r).every(t => have.has(t)));
};
// blank location = not stated by the source, so keep it
const inIndia = j => !j.loc || /india|asia|apac|worldwide|anywhere|global/i.test(j.loc);

async function loadFile() {
  const r = await fetch("data/jobs.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  if (!d || !Array.isArray(d.jobs) || !d.jobs.length) throw new Error("empty");
  liveJobs = d.jobs; liveSources = d.sources || []; liveFetchedAt = d.updated ? Date.parse(d.updated) : 0; liveMode = "file";
}
async function loadRemotiveDirect(force) {
  liveMode = "direct"; liveSources = [{ name: "Remotive", ok: true }];
  const cached = store.get(K.live, null);
  const fresh = cached && Date.now() - cached.t < 6 * 36e5;
  if (cached) { liveJobs = cached.jobs; liveFetchedAt = cached.t; }
  if (fresh && !force) { drawLive(); return; }
  const log = store.get(K.fetches, []).filter(t => Date.now() - t < 864e5);
  if (log.length >= 4) { drawLive("Daily fetch limit reached (Remotive allows about 4 a day). Showing saved results."); return; }
  try {
    const r = await fetch(LIVE_URL);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    liveJobs = (j.jobs || []).map(x => ({ id: "remotive-" + x.id, url: x.url, title: x.title, company: x.company_name, date: x.publication_date,
      loc: x.candidate_required_location, type: x.job_type, salary: x.salary, source: "Remotive" }));
    liveFetchedAt = Date.now();
    store.set(K.live, { t: liveFetchedAt, jobs: liveJobs }); log.push(liveFetchedAt); store.set(K.fetches, log);
    drawLive();
  } catch (e) {
    drawLive("Couldn't load the live feed right now" + (liveJobs.length ? ". Showing the last saved results." : "."));
  }
}
async function loadLive(force) {
  $("l-meta").textContent = "Loading…";
  try { await loadFile(); drawLive(); }
  catch (e) { await loadRemotiveDirect(force); }
}
function ageText(iso) {
  const d = iso ? daysBetween(String(iso).slice(0, 10), today()) : null;
  return d === null ? "" : d <= 0 ? "Today" : d + "d ago";
}
function drawLive(err) {
  liveLoaded = true;
  const rx = liveQ.trim().toLowerCase();
  const matches = liveJobs.filter(j => (!liveIndia || inIndia(j)) && (!liveSrc || j.source === liveSrc) && jobMatchesRoles(j, liveRoles) &&
    (!rx || `${j.title} ${j.company} ${j.loc} ${(j.tags || []).join(" ")}`.toLowerCase().includes(rx)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const shown = matches.slice(0, 120);
  $("lcount").textContent = matches.length + " jobs";
  const names = [...new Set(liveJobs.map(j => j.source).filter(Boolean))];
  $("l-chips").innerHTML = chip(liveIndia, "data-india", "1", "India-eligible")
    + (names.length > 1 ? chip(!liveSrc, "data-s", "", "All sources") + names.map(n => chip(liveSrc === n, "data-s", n, `${n} ${liveJobs.filter(j => j.source === n).length}`)).join("") : "");
  const credit = names.map(n => SRC_URL[n] ? `<a href="${SRC_URL[n]}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>` : esc(n)).join(", ");
  const failed = liveSources.filter(s => s.ok === false).map(s => s.name);
  $("l-meta").innerHTML = `Sources: ${credit || "none yet"} · ${liveFetchedAt ? "updated " + new Date(liveFetchedAt).toLocaleString() : "not fetched yet"}`
    + (liveMode === "file" ? " · refreshed automatically 3 times a day" : " · Remotive listings are delayed 24 hours")
    + (failed.length ? ` · last refresh failed for ${esc(failed.join(", "))} (older listings kept)` : "")
    + (matches.length > shown.length ? ` · showing the newest ${shown.length}` : "");
  $("l-err").innerHTML = err ? `<div class="live-err">${esc(err)} <a href="https://remotive.com/remote-jobs/software-dev" target="_blank" rel="noopener noreferrer">Open Remotive</a></div>` : "";
  $("l-list").innerHTML = shown.map(j => {
    const age = ageText(j.date);
    return `<article class="lj"><div><div class="nm">${esc(j.title)}</div>
      <div class="ds">${esc([j.company, j.loc, j.type, j.salary].filter(Boolean).join(" · "))}</div></div>
      <div class="lj-a">${age ? `<span class="tag IN">${age}</span>` : ""}${j.source ? `<span class="tag">${esc(j.source)}</span>` : ""}
      <a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Apply ↗</a>
      <button class="btn ghost" data-trk="${esc(j.id)}">+ Track</button></div></article>`;
  }).join("") || `<div class="hint">No listings match. Try fewer roles, or switch off India-eligible.</div>`;
}
const lMS = MS($("l-roles"), { get: () => liveRoles, set: a => { liveRoles = a; store.set("jobhub2-lroles", a); if (liveLoaded) drawLive(); }, none: "All roles" });
$("l-q").addEventListener("input", e => { liveQ = e.target.value; if (liveLoaded) drawLive(); });
$("l-ref").addEventListener("click", () => loadLive(true));
$("live").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.closest(".ms")) return;
  if (b.dataset.india) liveIndia = !liveIndia;
  else if (b.dataset.s !== undefined) liveSrc = b.dataset.s;
  else if (b.dataset.trk) {
    const j = liveJobs.find(x => String(x.id) === b.dataset.trk);
    if (j) { addJob({ company: j.company, role: j.title, url: j.url, status: "saved" }); toast("Added to tracker"); }
    return;
  } else return;
  drawLive();
});

/* ---------- tab routing (called from index.html render()) ---------- */
function onTab(t) {
  document.body.dataset.tab = t;
  document.body.classList.toggle("tool", t !== "all"); // hero only on the home view, so results get the space
  for (const id of ["cmp", "trk", "out", "live", "ai"]) $(id).hidden = id !== t;
  if (t === "cmp") { $("c-name").value = cs.name; drawCompany(); }
  else if (t === "trk") drawTracker();
  else if (t === "out") drawOutreach();
  else if (t === "live" && !liveLoaded) loadLive(false);
}
window.PREMIUM = { onTab };

/* ---------- global shortcut: "/" focuses the main search ---------- */
document.addEventListener("keydown", e => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); $("q").focus();
});

drawStats();
})();
