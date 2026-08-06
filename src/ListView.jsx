import { useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { TypeIcon } from "./icons.jsx";
import { formatYear, groupByEra } from "./dates.js";

// data.json splits a single series into one entry per season (and sometimes
// per episode range) so each can carry its own predecessors. For the entry
// count, those splits should collapse back into one — but distinct shows
// that happen to share a title prefix (Daredevil vs. Daredevil: Born Again,
// AoS vs. AoS: Slingshot) must not. Stripping only the trailing "(1-2)" /
// "(Episode 1)" episode marker and "Season N" suffix keeps those separate,
// since neither has that suffix to strip.
function seriesKey(entry) {
  if (entry.type !== "series") return entry.id;
  return entry.title.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+Season\s+\d+\s*$/i, "");
}

function countTitles(list) {
  return new Set(list.map(seriesKey)).size;
}

function Pill({ active, color, onClick, children }) {
  return (
    <button
      type="button"
      className="pill"
      onClick={onClick}
      style={{
        borderColor: active ? color : undefined,
        background: active ? `${color}22` : undefined,
        color: active ? color : undefined,
      }}
    >
      {children}
    </button>
  );
}

export default function ListView({ data, filters, onFiltersChange, onSelect }) {
  const { universes, types, entries } = data;
  const { activeUniverses, activeTypes, sortMode } = filters;

  function toggle(field, key) {
    const next = new Set(filters[field]);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onFiltersChange({ ...filters, [field]: next });
  }

  // The year an entry is placed by, given the active sort mode.
  const yearOf = useMemo(
    () => (entry) => (sortMode === "chronological" ? entry.date : entry.releaseYear),
    [sortMode]
  );

  // Entries in the same year need a tie-breaker. In-story, that's data.json's
  // own order (the manual tie-breaker for things that happen simultaneously).
  // For release order, array position follows in-story date, which time
  // travel / flash-forwards can scramble relative to airing order — so use
  // the predecessor-derived releaseOrder instead, which tracks each show's
  // actual episode order regardless of what year it's set in.
  const tieBreakOf = useMemo(
    () => (entry) => (sortMode === "chronological" ? entry.index : entry.releaseOrder),
    [sortMode]
  );

  const { visible, eras } = useMemo(() => {
    const list = entries
      .filter((e) => activeUniverses.has(e.universe) && activeTypes.has(e.type))
      .sort((a, b) => yearOf(a) - yearOf(b) || tieBreakOf(a) - tieBreakOf(b));

    return { visible: list, eras: groupByEra(list, yearOf) };
  }, [entries, activeUniverses, activeTypes, yearOf, tieBreakOf]);

  return (
    <main className="page">
      <h1 className="page-title">Marvelaki</h1>
      <p className="page-sub">
        {countTitles(visible)} of {countTitles(entries)} entries · click a title for its viewing
        dependencies
      </p>

      <div className="filters">
        {Object.entries(universes).map(([key, u]) => (
          <Pill
            key={key}
            color={u.color}
            active={activeUniverses.has(key)}
            onClick={() => toggle("activeUniverses", key)}
          >
            {u.label}
          </Pill>
        ))}
      </div>

      <div className="filters filters-row">
        <div className="filters">
          {Object.entries(types).map(([key, t]) => (
            <Pill
              key={key}
              color="#9ca3af"
              active={activeTypes.has(key)}
              onClick={() => toggle("activeTypes", key)}
            >
              <TypeIcon icon={t.icon} /> {t.label}
            </Pill>
          ))}
        </div>

        <button
          type="button"
          className="pill sort-toggle"
          onClick={() =>
            onFiltersChange({
              ...filters,
              sortMode: sortMode === "chronological" ? "release" : "chronological",
            })
          }
        >
          <ArrowUpDown size={13} />
          {sortMode === "chronological" ? "In-story order" : "Release order"}
        </button>
      </div>

      <div className="entry-list">
        {eras.map(({ bucket, entries: rows }) => (
          <div key={bucket.key} className="era">
            <div className="era-header">
              <span className="era-header-label">{bucket.label}</span>
              <span className="era-header-rule" />
            </div>

            {rows.map((e) => {
              const u = universes[e.universe];
              const year = yearOf(e);
              // Show only what the era header does not already say: inside a
              // year group that means the entry's `period` hint (if any),
              // otherwise the year itself — except entries flagged as
              // outside time, whose year is only a list-placement fiction,
              // so they always show `period` instead.
              const label =
                bucket.kind === "year" || e.outsideTime ? e.period || "" : formatYear(year);

              return (
                <button
                  key={e.id}
                  type="button"
                  className="entry-row"
                  onClick={() => onSelect(e.id)}
                >
                  <span className="entry-date" style={{ color: u.color }}>
                    {label}
                  </span>
                  <span className="entry-type-icon" style={{ color: u.color }}>
                    <TypeIcon icon={types[e.type]?.icon} />
                  </span>
                  <span className="entry-title">{e.title}</span>
                  <span
                    className="entry-universe"
                    style={{ color: u.color, background: `${u.color}18` }}
                  >
                    {u.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        {visible.length === 0 && <p className="empty-state">Nothing matches these filters.</p>}
      </div>
    </main>
  );
}
