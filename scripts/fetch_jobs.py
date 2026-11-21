#!/usr/bin/env python3
"""Fetch remote software jobs from several free public APIs and write data/jobs.json.

Runs server-side (GitHub Actions), so the web app reads one same-origin file: no CORS problems and no
per-visitor rate limits. Each source is polled only a few times a day, as the providers ask:
  Remotive  - at most ~4 fetches/day; listings are delayed 24h
  Jobicy    - at most once per hour; a few checks a day are enough
  Remote OK - must be credited with a followed link back to the job on remoteok.com
  Arbeitnow - free, no key
Listings keep their original URL and a `source` field so the app can credit them.
Standard library only.
"""
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "jobs.json"
UA = "JobHubBot/1.0 (+https://github.com/Nitesh123-Nits/Job-Hub)"
MAX_AGE_DAYS, MAX_JOBS = 45, 700
DEV = re.compile(r"java|backend|back-end|back end|software|developer|engineer|devops|sre|golang|python|node|kotlin|"
                 r"spring|kafka|platform|full.?stack|cloud|api|microservice|architect|programmer|data", re.I)


def fetch_json(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def to_iso(v):
    """Unix seconds or ISO-like string -> UTC ISO string, or None."""
    try:
        if isinstance(v, (int, float)) and v > 0:
            return datetime.fromtimestamp(v, timezone.utc).isoformat(timespec="seconds")
        if isinstance(v, str) and v.strip():
            d = datetime.fromisoformat(v.strip().replace("Z", "+00:00").replace(" ", "T", 1))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (ValueError, OverflowError, OSError):
        pass
    return None


def text(v):
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x) for x in v if x)
    return str(v).strip() if v else ""


def salary(lo, hi, cur="", per=""):
    try:
        lo, hi = float(lo or 0), float(hi or 0)
    except (TypeError, ValueError):
        return ""
    if not lo and not hi:
        return ""
    rng = f"{lo:,.0f}–{hi:,.0f}" if lo and hi and lo != hi else f"{(hi or lo):,.0f}"
    return " ".join(x for x in [cur, rng + (f"/{per}" if per else "")] if x)


def job(source, sid, title, company, loc, typ, date, url, sal="", tags=None):
    if not (title and url):
        return None
    return {"id": f"{source.lower().replace(' ', '')}-{sid}", "title": text(title), "company": text(company),
            "loc": text(loc), "type": text(typ).replace("_", " "), "date": to_iso(date), "url": url,
            "source": source, "salary": sal, "tags": [text(t) for t in (tags or [])][:6]}


def remotive():
    d = fetch_json("https://remotive.com/api/remote-jobs?category=software-dev&limit=250")
    return [job("Remotive", x.get("id"), x.get("title"), x.get("company_name"), x.get("candidate_required_location"),
                x.get("job_type"), x.get("publication_date"), x.get("url"), text(x.get("salary")), x.get("tags"))
            for x in d.get("jobs", [])]


def jobicy():
    wanted = ["india", "apac", "anywhere"]
    geos = ["apac", "anywhere"]
    try:  # ask Jobicy which location slugs exist; add "india" if it is offered
        slugs = set(re.findall(r'"(?:geoSlug|slug|id)"\s*:\s*"([a-z0-9-]+)"', json.dumps(fetch_json("https://jobicy.com/api/v2/remote-jobs?get=locations"))))
        geos = [g for g in wanted if g in slugs] or geos
    except Exception as e:
        print("jobicy locations lookup failed:", e, file=sys.stderr)
    out = []
    for g in geos:
        time.sleep(1.5)
        d = fetch_json(f"https://jobicy.com/api/v2/remote-jobs?count=200&geo={g}")
        for x in d.get("jobs", []):
            t = text(x.get("jobTitle"))
            if not DEV.search(t + " " + text(x.get("jobIndustry"))):
                continue
            out.append(job("Jobicy", x.get("id"), t, x.get("companyName"), x.get("jobGeo"), x.get("jobType"), x.get("pubDate"),
                           x.get("url"), salary(x.get("salaryMin"), x.get("salaryMax"), x.get("salaryCurrency"), x.get("salaryPeriod"))))
    return out


def remoteok():
    d = fetch_json("https://remoteok.com/api")
    out = []
    for x in d[1:] if isinstance(d, list) else []:  # element 0 is the legal notice
        t = text(x.get("position"))
        if not DEV.search(t + " " + text(x.get("tags"))):
            continue
        out.append(job("Remote OK", x.get("id"), t, x.get("company"), x.get("location") or "", "",
                       x.get("date") or x.get("epoch"), x.get("url"), salary(x.get("salary_min"), x.get("salary_max"), "USD", "year"), x.get("tags")))
    return out


def arbeitnow():
    d = fetch_json("https://www.arbeitnow.com/api/job-board-api")
    out = []
    for x in d.get("data", []):
        if not x.get("remote"):
            continue
        t = text(x.get("title"))
        if not DEV.search(t + " " + text(x.get("tags"))):
            continue
        out.append(job("Arbeitnow", x.get("slug"), t, x.get("company_name"), x.get("location") or "Remote", x.get("job_types"),
                       x.get("created_at"), x.get("url"), "", x.get("tags")))
    return out


SOURCES = [("Remotive", remotive), ("Jobicy", jobicy), ("Remote OK", remoteok), ("Arbeitnow", arbeitnow)]


def build(previous, fetchers=SOURCES, now=None):
    now = now or datetime.now(timezone.utc)
    jobs, report = [], []
    for name, fn in fetchers:
        try:
            got = [j for j in fn() if j]
            report.append({"name": name, "ok": True, "count": len(got)})
            jobs += got
        except Exception as e:  # keep the last good listings for a source that failed this time
            print(f"{name} failed: {e}", file=sys.stderr)
            old = [j for j in previous.get("jobs", []) if j.get("source") == name]
            report.append({"name": name, "ok": False, "count": len(old), "error": str(e)[:120]})
            jobs += old
    cutoff = (now - timedelta(days=MAX_AGE_DAYS)).isoformat(timespec="seconds")
    seen, unique = set(), []
    for j in sorted(jobs, key=lambda j: j.get("date") or "", reverse=True):
        if j.get("date") and j["date"] < cutoff:
            continue
        key = (j["title"].lower(), j["company"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(j)
    return {"updated": now.isoformat(timespec="seconds"), "sources": report, "jobs": unique[:MAX_JOBS]}


def main():
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    data = build(previous)
    if not any(s["ok"] for s in data["sources"]):
        print("every source failed; keeping the existing file", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(data['jobs'])} jobs:", ", ".join(f"{s['name']}={s['count']}{'' if s['ok'] else ' (failed)'}" for s in data["sources"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
