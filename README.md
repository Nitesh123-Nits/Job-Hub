# JobHub

One-page PWA for the job search: job boards, remote sites and company career pages, plus tools to find active jobs and apply.

## Features
- **Role Search / Smart Search**: ready-made searches by one or more roles, one or more cities and posting window (24h, 3 days, week, month), including LinkedIn hiring posts and referral posts.
- **Company Search**: type any company to get its LinkedIn and Indeed jobs, career pages, ATS boards, hiring posts, recruiters, reviews, salary data and news. Quick role chips, filters for Easy Apply and experience level, and a watchlist for favourite companies.
- **Tracker**: Saved / Applied / Interview / Offer / Rejected board with follow-up dates and notes. Export and import a JSON backup.
- **Outreach**: LinkedIn note, recruiter message, HR email, referral request, follow-up and thank-you templates filled from your details.
- **Live Remote Jobs**: current remote software listings from the [Remotive](https://remotive.com) public API (listings are delayed 24h; cached, at most 4 fetches per day as Remotive asks).
- Dark mode, installable, works offline for the page itself.

All personal data (tracker, profile, watchlist) stays in your browser's localStorage. Nothing is sent to a server.

## Run locally
Serve the folder over HTTP (service workers need it):

    python3 -m http.server 8000

## Deploy
GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.
