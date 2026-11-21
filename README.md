# JobHub

🔗 **Live app:** [https://nitesh123-nits.github.io/Job-Hub/](https://nitesh123-nits.github.io/Job-Hub/) · installable as a PWA (open it on your phone → *Add to Home screen*)

One-page PWA for the job search: job boards, remote sites and company career pages, plus tools to find active jobs and apply.

## Features
- **Role Search / Smart Search**: ready-made searches for one or more roles and one or more cities, with a posting window (24h, 3 days, week, month), shared LinkedIn filters (Easy Apply, experience levels) and LinkedIn hiring and referral posts. Several roles become one combined (OR) search per board.
- **Company Search**: type any company to get its LinkedIn and Indeed jobs per city, career pages, ATS boards, hiring posts, recruiters, reviews, salary data and news. Multi-select roles and cities, the same filters, and a watchlist.
- **Tracker**: Saved / Applied / Interview / Offer / Rejected board with follow-up dates and notes. Export and import a JSON backup.
- **Outreach**: LinkedIn note, recruiter message, HR email, referral request, follow-up and thank-you templates filled from your details.
- **Live Remote Jobs**: remote software listings from Remotive, Jobicy, Remote OK and Arbeitnow. A scheduled GitHub Action (`.github/workflows/update-jobs.yml`, three times a day) runs `scripts/fetch_jobs.py` and saves `data/jobs.json`, which the app reads. Every listing keeps its original link and source credit. If the file is empty the app falls back to calling Remotive directly (cached, max 4 fetches a day).
- Two looks: Modern (default) and Classic, switchable in the top bar, each with dark mode. Installable, works offline for the page itself.

All personal data (tracker, profile, watchlist) stays in your browser's localStorage. Nothing is sent to a server.

## Run locally
Serve the folder over HTTP (service workers need it):

    python3 -m http.server 8000

## Deploy
GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.
