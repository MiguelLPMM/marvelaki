/* ---------------------------------------------------------------------- */
/* YEARS                                                                    */
/*                                                                          */
/* An entry's `date` is a plain year string, e.g. "1943" or "-1260" for     */
/* 1260 BC. Ordering within a year is decided by list position in           */
/* data.json (see `index` in App.jsx) — there's no invented sub-year        */
/* precision. An entry's optional `period` is a short free-text hint        */
/* ("Spring", "Christmas", "concurrent w/ Ragnarok") shown alongside it      */
/* when nothing more specific is known.                                     */
/*                                                                          */
/* A trailing "*" on `date` (e.g. "1602*") marks a story that happens       */
/* outside time — the year is only there to place it in the list, not a    */
/* real in-story date. Those entries always show their `period` instead of */
/* the year, even outside the 2000–2049 range where a real date would      */
/* normally be spelled out (see bucketFor below).                          */
/* ---------------------------------------------------------------------- */

export function parseYear(raw) {
  return Number(String(raw).replace(/\*$/, ""));
}

export function isOutsideTime(raw) {
  return String(raw).endsWith("*");
}

/** "1260 BC" for negative years, otherwise the year itself. */
export function formatYear(year) {
  return year < 0 ? `${-year} BC` : String(year);
}

/* ---------------------------------------------------------------------- */
/* ERA BUCKETS                                                              */
/*   >= 2050     grouped by decade   "2090s" (far future, e.g. AoS S5)      */
/*   2000–2049   grouped by year     "2016"                                 */
/*   1900–1999   grouped by decade   "1960s"                                */
/*   0–1899      grouped by century  "1800s"                                */
/*   < 0 (BC)    grouped by century  "1300s BC"                             */
/* ---------------------------------------------------------------------- */

export function bucketFor(year) {
  if (year < 0) {
    const century = Math.ceil(-year / 100);
    const hi = century * 100;
    return { key: `bc${century}`, label: `${hi}s BC`, kind: "century-bc" };
  }

  if (year >= 2050) {
    const decade = Math.floor(year / 10) * 10;
    return { key: `d${decade}`, label: `${decade}s`, kind: "decade" };
  }

  if (year >= 2000) return { key: `y${year}`, label: String(year), kind: "year" };

  if (year >= 1900) {
    const decade = Math.floor(year / 10) * 10;
    return { key: `d${decade}`, label: `${decade}s`, kind: "decade" };
  }

  const century = Math.floor(year / 100) * 100;
  return { key: `c${century}`, label: `${century}s`, kind: "century" };
}

/** Slice an already-sorted list into consecutive era runs. */
export function groupByEra(entries, yearOf) {
  const groups = [];
  for (const entry of entries) {
    const bucket = bucketFor(yearOf(entry));
    const last = groups[groups.length - 1];
    if (last && last.bucket.key === bucket.key) last.entries.push(entry);
    else groups.push({ bucket, entries: [entry] });
  }
  return groups;
}
