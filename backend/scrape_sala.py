#!/usr/bin/env python3
"""
Scraper for Sala Al-Jadida prayer times from priere.ma.
Extracts today's timings and the monthly table, validates data,
and generates static JSON files for Cloudflare Pages.
"""

import argparse
import datetime
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup, Tag

URL = "https://priere.ma/horaire-priere-sala-al-jadida"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7",
    "Referer": "https://priere.ma/",
}

FRENCH_MONTHS = {
    "janvier": 1,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
}

TIME_REGEX = re.compile(r"^\d{2}:\d{2}$")


def fetch_page(url: str) -> str:
    """Fetch HTML content from priere.ma with browser-like headers."""
    print(f"[*] Fetching prayer page from {url}...")
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    response.encoding = "utf-8"
    return response.text


def parse_today_date(soup: BeautifulSoup) -> Tuple[Optional[str], Optional[int], Optional[int], Optional[int]]:
    """
    Parse the current date string from the opening-hours status widget.
    Example: 'Jeudi 22 octobre 2026' -> ('Jeudi', 2026, 10, 22)
    """
    status_el = soup.find("span", class_="current-status")
    if not status_el:
        return None, None, None, None

    text = status_el.get_text(strip=True)
    # Match pattern: DayName DayNumber MonthName Year
    match = re.search(r"([A-Za-zÀ-ÿ]+)\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})", text)
    if match:
        day_name, day_num, month_name, year_num = match.groups()
        month_idx = FRENCH_MONTHS.get(month_name.lower())
        if month_idx:
            return day_name, int(year_num), month_idx, int(day_num)
    return None, None, None, None


def parse_today_timings(soup: BeautifulSoup) -> Dict[str, str]:
    """Parse today's prayer times from the opening-hours box."""
    timings = {}
    key_mapping = {
        "alfajr": "fajr",
        "chourouq": "sunrise",
        "duhr": "dhuhr",
        "asr": "asr",
        "maghrib": "maghrib",
        "ishae": "isha",
    }

    opening_hours_div = soup.find("div", class_="box-widget opening-hours")
    if opening_hours_div:
        for li in opening_hours_div.find_all("li"):
            day_spans = li.find_all("span", class_="opening-hours-day")
            time_span = li.find("span", class_="opening-hours-time")
            if day_spans and time_span:
                name_key = day_spans[0].get_text(strip=True).lower()
                clean_time = time_span.get_text(strip=True)
                mapped_name = key_mapping.get(name_key)
                if mapped_name and TIME_REGEX.match(clean_time):
                    timings[mapped_name] = clean_time

    return timings


def parse_monthly_table(
    soup: BeautifulSoup,
    anchor_year: Optional[int],
    anchor_month: Optional[int],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Parse the monthly table (<table class="table table-striped">).
    Extracts headers and rows, and computes full Gregorian dates (YYYY-MM-DD).
    """
    table = soup.find("table", class_="table")
    if not table:
        raise ValueError("Could not find prayer schedule table in HTML.")

    # 1. Parse table headers
    th_cells = table.find("thead").find_all("th")
    if len(th_cells) < 9:
        raise ValueError(f"Expected 9 header columns, found {len(th_cells)}")

    hijri_month_name = th_cells[1].get_text(strip=True)
    gregorian_header = th_cells[2].get_text(strip=True)

    metadata = {
        "city": "sala-al-jadida",
        "city_label": "Sala Al-Jadida",
        "hijri_month": hijri_month_name,
        "gregorian_period": gregorian_header,
    }

    # 2. Parse table rows
    tbody = table.find("tbody")
    rows = tbody.find_all("tr") if tbody else []

    days_data = []

    # Track Gregorian month transitions across rows
    # The table might span 2 months: e.g. Oct 13 -> Oct 31, then Nov 1 -> Nov 11
    current_year = anchor_year or datetime.datetime.now().year
    current_month = anchor_month or datetime.datetime.now().month
    prev_gregorian_day: Optional[int] = None

    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 9:
            continue

        day_ar = tds[0].get_text(strip=True)
        hijri_day_str = tds[1].get_text(strip=True)
        gregorian_day_str = tds[2].get_text(strip=True)

        fajr = tds[3].get_text(strip=True)
        sunrise = tds[4].get_text(strip=True)
        dhuhr = tds[5].get_text(strip=True)
        asr = tds[6].get_text(strip=True)
        maghrib = tds[7].get_text(strip=True)
        isha = tds[8].get_text(strip=True)

        is_today = "today" in (row.get("class") or []) or any(
            "today" in (td.get("class") or []) for td in tds
        )

        # Parse numeric Gregorian day if possible
        try:
            gregorian_day_num = int(gregorian_day_str)
        except ValueError:
            gregorian_day_num = None

        # Detect month rollover (e.g. 31 -> 1)
        if gregorian_day_num is not None:
            if prev_gregorian_day is not None and gregorian_day_num < prev_gregorian_day:
                current_month += 1
                if current_month > 12:
                    current_month = 1
                    current_year += 1
            prev_gregorian_day = gregorian_day_num
            iso_date = f"{current_year:04d}-{current_month:02d}-{gregorian_day_num:02d}"
        else:
            iso_date = None

        day_entry = {
            "date": iso_date,
            "day_ar": day_ar,
            "hijri_day": hijri_day_str,
            "gregorian_day": gregorian_day_num if gregorian_day_num is not None else gregorian_day_str,
            "fajr": fajr,
            "sunrise": sunrise,
            "dhuhr": dhuhr,
            "asr": asr,
            "maghrib": maghrib,
            "isha": isha,
            "is_today": is_today,
        }
        days_data.append(day_entry)

    return metadata, days_data


def validate_data(days_data: List[Dict[str, Any]], today_timings: Dict[str, str]) -> None:
    """Validate data integrity before writing JSON files."""
    # Table must have between 28 and 31 days
    if not (28 <= len(days_data) <= 31):
        raise ValueError(
            f"Integrity check failed: expected 28-31 days in month table, got {len(days_data)}"
        )

    required_prayers = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]

    # Validate monthly rows
    for idx, day in enumerate(days_data):
        for prayer in required_prayers:
            time_val = day.get(prayer, "")
            if not TIME_REGEX.match(time_val):
                raise ValueError(
                    f"Integrity check failed on row {idx} for '{prayer}': invalid time '{time_val}'"
                )

    # Validate today's timings
    if len(today_timings) != 6:
        raise ValueError(
            f"Integrity check failed on today timings: expected 6 prayers, got {len(today_timings)}"
        )
    for prayer in required_prayers:
        time_val = today_timings.get(prayer, "")
        if not TIME_REGEX.match(time_val):
            raise ValueError(
                f"Integrity check failed on today timings for '{prayer}': invalid time '{time_val}'"
            )

    print("[✓] Data integrity check passed successfully.")


def main():
    parser = argparse.ArgumentParser(description="Scrape Sala Al-Jadida prayer times.")
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory to write today.json and month.json",
    )
    args = parser.parse_args()

    # Determine paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if args.output_dir:
        output_dir = os.path.abspath(args.output_dir)
    else:
        # Default: backend/public/api/sala-al-jadida
        output_dir = os.path.join(script_dir, "public", "api", "sala-al-jadida")

    os.makedirs(output_dir, exist_ok=True)

    # 1. Fetch
    html_content = fetch_page(URL)
    soup = BeautifulSoup(html_content, "html.parser")

    # 2. Parse current date & today's timings
    day_name_fr, anchor_year, anchor_month, anchor_day = parse_today_date(soup)
    today_timings = parse_today_timings(soup)

    # 3. Parse monthly table
    metadata, days_data = parse_monthly_table(soup, anchor_year, anchor_month)

    # Find today's entry from the table if present
    today_entry_from_table = next((d for d in days_data if d["is_today"]), None)

    # If today's timings were missing from widget, fallback to the table row
    if len(today_timings) < 6 and today_entry_from_table:
        for prayer in ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]:
            today_timings[prayer] = today_entry_from_table[prayer]

    # 4. Validate
    validate_data(days_data, today_timings)

    # 5. Format JSON files
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Determine today's date string
    if anchor_year and anchor_month and anchor_day:
        today_date_str = f"{anchor_year:04d}-{anchor_month:02d}-{anchor_day:02d}"
    elif today_entry_from_table and today_entry_from_table.get("date"):
        today_date_str = today_entry_from_table["date"]
    else:
        today_date_str = datetime.date.today().isoformat()

    today_json = {
        "city": "sala-al-jadida",
        "city_label": "Sala Al-Jadida",
        "date": today_date_str,
        "day_name_fr": day_name_fr or "",
        "day_name_ar": today_entry_from_table["day_ar"] if today_entry_from_table else "",
        "hijri_day": today_entry_from_table["hijri_day"] if today_entry_from_table else "",
        "hijri_month": metadata["hijri_month"],
        "timings": today_timings,
        "last_updated": now_iso,
    }

    month_json = {
        "city": metadata["city"],
        "city_label": metadata["city_label"],
        "hijri_month": metadata["hijri_month"],
        "gregorian_period": metadata["gregorian_period"],
        "days_count": len(days_data),
        "days": days_data,
        "last_updated": now_iso,
    }

    # 6. Write output files
    today_file = os.path.join(output_dir, "today.json")
    month_file = os.path.join(output_dir, "month.json")

    with open(today_file, "w", encoding="utf-8") as f:
        json.dump(today_json, f, ensure_ascii=False, indent=2)
    print(f"[✓] Successfully wrote: {today_file}")

    with open(month_file, "w", encoding="utf-8") as f:
        json.dump(month_json, f, ensure_ascii=False, indent=2)
    print(f"[✓] Successfully wrote: {month_file}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[!] Error: {e}", file=sys.stderr)
        sys.exit(1)
