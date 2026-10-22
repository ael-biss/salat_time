# Sala Al-Jadida Prayer Times API

Automated, edge-cached static API serving prayer times for **Sala Al-Jadida (Morocco)**, sourced from `priere.ma`.

## Endpoints

When deployed to Cloudflare Pages, your endpoints will be available at:

- **Preview & Docs**: `https://<your-project>.pages.dev/`
- **Today's Timings**: `https://<your-project>.pages.dev/api/sala-al-jadida/today.json`
- **Monthly Schedule**: `https://<your-project>.pages.dev/api/sala-al-jadida/month.json`

### Example Response (`today.json`)
```json
{
  "city": "sala-al-jadida",
  "city_label": "Sala Al-Jadida",
  "date": "2026-10-22",
  "day_name_fr": "Jeudi",
  "day_name_ar": "الخميس",
  "hijri_day": "10",
  "hijri_month": "جُمَادَى ٱلْأُولَى",
  "timings": {
    "fajr": "05:09",
    "sunrise": "06:35",
    "dhuhr": "12:17",
    "asr": "15:20",
    "maghrib": "17:49",
    "isha": "19:04"
  },
  "last_updated": "2026-10-22T20:50:38.813477+00:00"
}
```

---

## How It Works

1. **Scheduled Scraping**: A GitHub Actions workflow (`.github/workflows/update-prayer-times.yml`) runs daily at 01:00 UTC.
2. **Parsing & Validation**: `backend/scrape_sala.py` fetches the HTML with realistic browser headers, parses the schedule table, validates times against regex `^\d{2}:\d{2}$`, and regenerates `today.json` and `month.json`.
3. **Commit & Deploy**: If data changes, the GitHub Action automatically commits the updated JSON files.
4. **Cloudflare Edge CDN**: Cloudflare Pages detects the commit and serves the files globally with CORS enabled (`Access-Control-Allow-Origin: *`) and fast edge caching.

---

## Cloudflare Pages Setup

Follow these steps once to connect your GitHub repository to Cloudflare Pages:

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages**.
2. Click **Create Application** > **Pages** > **Connect to Git**.
3. Select your repository: `asstavip/salat_time` (or your repo name).
4. Configure the build settings:
   - **Project Name**: `salat-time-api` (or your preferred name)
   - **Production branch**: `master` (or your default branch)
   - **Framework preset**: `None`
   - **Root directory**: `backend`
   - **Build command**: *(leave blank)*
   - **Build output directory**: `public`
5. Click **Save and Deploy**.

Your API will be live instantly with a free `*.pages.dev` subdomain and SSL certificate!

---

## Local Development & Testing

To test the scraper locally:

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Run the scraper
python3 backend/scrape_sala.py

# 3. Serve the public directory locally (optional)
python3 -m http.server 8080 --directory backend/public
```
Open `http://localhost:8080` in your browser to view the interactive preview.
