import { useEffect, useState } from "react";
import ListView from "./ListView.jsx";
import DetailView from "./DetailView.jsx";
import { parseYear, isOutsideTime } from "./dates.js";

/* Release order can't just follow data.json's array position: that position
   is chronological (in-story date), and shows like Agents of S.H.I.E.L.D.
   jump around in-story (time travel, flash-forwards) while still airing in a
   fixed episode order. `predecessors` already encodes that airing order (each
   split entry lists every earlier part of its own show), so a topological
   sort over that graph gives a true release-order tie-breaker. Kahn's
   algorithm always picks the lowest-index ready node, so entries with no
   dependency relationship keep data.json's order. */
function computeReleaseOrder(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const indegree = new Map(entries.map((e) => [e.id, 0]));
  const children = new Map(entries.map((e) => [e.id, []]));

  for (const e of entries) {
    for (const p of e.predecessors) {
      if (!byId.has(p)) continue;
      children.get(p).push(e.id);
      indegree.set(e.id, indegree.get(e.id) + 1);
    }
  }

  const ready = entries.filter((e) => indegree.get(e.id) === 0);
  ready.sort((a, b) => a.index - b.index);

  const order = new Map();
  let i = 0;
  while (ready.length) {
    const node = ready.shift();
    order.set(node.id, i++);
    for (const childId of children.get(node.id)) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        const child = byId.get(childId);
        const pos = ready.findIndex((r) => r.index > child.index);
        if (pos === -1) ready.push(child);
        else ready.splice(pos, 0, child);
      }
    }
  }

  return order;
}

/* `data.json` lives in public/ rather than being imported, so the timeline can
   be edited and reloaded without touching the bundle. */
function prepare(raw) {
  const entries = (raw.entries || []).map((e, index) => ({
    ...e,
    predecessors: e.predecessors || [],
    index,
    outsideTime: isOutsideTime(e.date),
    date: parseYear(e.date),
  }));

  const releaseOrder = computeReleaseOrder(entries);
  for (const e of entries) e.releaseOrder = releaseOrder.get(e.id);

  return {
    universes: raw.universes || {},
    universeGroups: raw.universeGroups || {},
    types: raw.types || {},
    entries,
    byId: Object.fromEntries(entries.map((e) => [e.id, e])),
  };
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((raw) => {
        if (cancelled) return;
        const prepared = prepare(raw);
        setData(prepared);
        setFilters({
          activeUniverses: new Set(Object.keys(prepared.universes)),
          activeTypes: new Set(Object.keys(prepared.types)),
          sortMode: "chronological",
        });
      })
      .catch((err) => !cancelled && setError(err));

    return () => {
      cancelled = true;
    };
  }, []);

  // Jumping between entries should start at the top of the new page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selected]);

  if (error) {
    return (
      <main className="page">
        <h1 className="page-title">Could not load data.json</h1>
        <p className="page-sub">{String(error)}</p>
      </main>
    );
  }

  if (!data || !filters) {
    return (
      <main className="page">
        <p className="page-sub">Loading…</p>
      </main>
    );
  }

  return selected ? (
    <DetailView
      data={data}
      id={selected}
      onBack={() => setSelected(null)}
      onSelect={setSelected}
    />
  ) : (
    <ListView
      data={data}
      filters={filters}
      onFiltersChange={setFilters}
      onSelect={setSelected}
    />
  );
}