/* ---------------------------------------------------------------------- */
/* GRAPH LAYOUT — leveled DAG of an entry's transitive predecessors         */
/* ---------------------------------------------------------------------- */

const COL_GAP = 60;
const ROW_HEIGHT = 64;
const MIN_NODE_WIDTH = 90;
const MAX_LINE_CHARS = 32;
const LINE_HEIGHT = 12;
const BASE_HEIGHT = 32;
const CHAR_WIDTH = 6.4;

/** Wrap a title onto 1-2 lines instead of forcing a single very wide box.
 * Prefers the most evenly-balanced 2-line split at a word boundary; only
 * falls back to plain greedy wrapping (3+ lines) for the rare title too
 * long to balance into two reasonably-sized lines. */
function wrapTitle(title) {
  if (title.length <= MAX_LINE_CHARS) return [title];

  const words = title.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const longest = Math.max(line1.length, line2.length);
    if (!best || longest < best.longest) best = { lines: [line1, line2], longest };
  }
  if (best && best.longest <= MAX_LINE_CHARS + 6) return best.lines;

  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_LINE_CHARS && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Node box sized to fit its (possibly 2-line) title — the graph frame
 * scrolls horizontally, so there's no reason to truncate titles to "...",
 * but a single very long line is uglier than wrapping onto a second one. */
function layoutTitle(title) {
  const lines = wrapTitle(title);
  const width = Math.max(
    MIN_NODE_WIDTH,
    Math.round(Math.max(...lines.map((l) => l.length)) * CHAR_WIDTH) + 24
  );
  const height = BASE_HEIGHT + (lines.length - 1) * LINE_HEIGHT;
  return { lines, width, height };
}

/** "aos-s1-11-16" -> "aos-s1"; ids with no "-s<n>-<episode>" shape (movies,
 * one-shots, single-fragment seasons like "aos-s6") return themselves and
 * never get grouped with anything else at the season level. */
function seasonGroupKey(id) {
  const m = id.match(/^(.+-s\d+)-\d/);
  return m ? m[1] : id;
}

/** "aos-s1" / "aos-s1-11-16" -> "aos"; ids with no season number at all
 * (movies, one-shots) return themselves and never get grouped as a show. */
function showGroupKey(id) {
  const season = seasonGroupKey(id);
  const m = season.match(/^(.+)-s\d+$/);
  return m ? m[1] : season;
}

export function buildAncestorGraph(rootId, byId) {
  // 1. Collect every ancestor of the root (BFS over `predecessors`).
  const ancestorIds = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    const ent = byId[cur];
    if (!ent) continue;
    for (const p of ent.predecessors) {
      if (!ancestorIds.has(p)) {
        ancestorIds.add(p);
        queue.push(p);
      }
    }
  }

  // 2. Ancestor sets on the *original*, ungrouped ids — used below to check
  // whether merging a season's fragments together is actually safe.
  const rawAncestorCache = {};
  function rawAncestorsOf(aid, seen = new Set()) {
    if (rawAncestorCache[aid]) return rawAncestorCache[aid];
    if (seen.has(aid)) return new Set(); // guard against cycles in the source data
    seen.add(aid);
    const result = new Set();
    (byId[aid]?.predecessors || []).forEach((p) => {
      if (!ancestorIds.has(p)) return;
      result.add(p);
      rawAncestorsOf(p, seen).forEach((a) => result.add(a));
    });
    rawAncestorCache[aid] = result;
    return result;
  }
  ancestorIds.forEach((aid) => rawAncestorsOf(aid));

  // 3. Group fellow-season fragments together so a season split into a
  // dozen episode-range entries doesn't turn into a dozen separate nodes,
  // and group a whole other show's seasons together so referencing several
  // of them collapses into one node for that show. The *current*
  // season/show — whichever the root itself belongs to — is left unmerged
  // at that level, since that's the one actually being inspected.
  //
  // Season merges are only made when safe: if some entry outside the group
  // sits *between* two of its members (e.g. the Slingshot special airs
  // between Agents of S.H.I.E.L.D. 4x08 and 4x09 — part of season 4 is its
  // ancestor, and it's an ancestor of the rest of season 4), collapsing the
  // whole season into one node would make that outside entry both an
  // ancestor and a descendant of the group at once, i.e. a cycle. Show
  // merges skip that check — a foreign entry sitting between two of a
  // show's seasons (e.g. Ant-Man and the Wasp: Quantumania releasing
  // between Loki's two seasons) doesn't need to stay pinned to one specific
  // season the way an interleaved same-show special does, so the seasons
  // merge regardless; any resulting two-node cycle is untangled in step 4.
  const rootSeasonKey = seasonGroupKey(rootId);
  const rootShowKey = showGroupKey(rootId);

  const seasonMembers = {};
  const showMembers = {};
  ancestorIds.forEach((aid) => {
    const sk = seasonGroupKey(aid);
    const wk = showGroupKey(aid);
    (seasonMembers[sk] = seasonMembers[sk] || []).push(aid);
    (showMembers[wk] = showMembers[wk] || []).push(aid);
  });

  const mergeableSeasons = new Set();
  Object.entries(seasonMembers).forEach(([g, members]) => {
    if (g === rootSeasonKey || members.length < 2) return;
    const memberSet = new Set(members);
    const externalAncestors = new Set();
    members.forEach((m) => {
      rawAncestorsOf(m).forEach((a) => {
        if (!memberSet.has(a)) externalAncestors.add(a);
      });
    });
    const unsafe = [...externalAncestors].some((x) => {
      const xAncestors = rawAncestorsOf(x);
      return members.some((m) => xAncestors.has(m));
    });
    if (!unsafe) mergeableSeasons.add(g);
  });

  const mergeableShows = new Set();
  Object.entries(showMembers).forEach(([g, members]) => {
    if (g === rootShowKey || members.length < 2) return;
    mergeableShows.add(g);
  });

  const displayIdOf = {};
  ancestorIds.forEach((aid) => {
    const showKey = showGroupKey(aid);
    const seasonKey = seasonGroupKey(aid);
    if (mergeableShows.has(showKey)) displayIdOf[aid] = `show:${showKey}`;
    else if (mergeableSeasons.has(seasonKey)) displayIdOf[aid] = `group:${seasonKey}`;
    else displayIdOf[aid] = aid;
  });

  const nodeIds = new Set(Object.values(displayIdOf));

  const nodesMeta = {};
  ancestorIds.forEach((aid) => {
    const did = displayIdOf[aid];
    if (nodesMeta[did]) return;
    if (did.startsWith("show:") || did.startsWith("group:")) {
      const isShow = did.startsWith("show:");
      const rawMembers = isShow ? showMembers[showGroupKey(aid)] : seasonMembers[seasonGroupKey(aid)];
      // Sorted by release/airing order, not `index` (in-story date order) —
      // a season can air in a fixed order while jumping around in-story
      // (e.g. Agents of S.H.I.E.L.D. season 5 opens with episodes set far in
      // the future), so `index` would pick the wrong "first episode" link.
      const sorted = rawMembers.slice().sort((a, b) => byId[a].releaseOrder - byId[b].releaseOrder);
      const first = byId[sorted[0]];
      let title = first.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (isShow) title = title.replace(/\s+Season\s+\d+\s*$/i, "").trim();
      nodesMeta[did] = {
        title,
        ...layoutTitle(title),
        universe: first.universe,
        isGroup: true,
        representative: sorted[0],
      };
    } else {
      const ent = byId[aid];
      nodesMeta[did] = {
        title: ent.title,
        ...layoutTitle(ent.title),
        universe: ent.universe,
        isGroup: false,
      };
    }
  });

  // 4. Re-derive predecessor edges at the display level, deduping and
  // dropping the self-loops created by grouping (e.g. an episode fragment
  // whose only listed predecessor is another fragment of the same group).
  const predsOf = {};
  nodeIds.forEach((did) => (predsOf[did] = new Set()));
  ancestorIds.forEach((aid) => {
    const to = displayIdOf[aid];
    (byId[aid]?.predecessors || []).forEach((p) => {
      if (!ancestorIds.has(p)) return;
      const from = displayIdOf[p];
      if (from !== to) predsOf[to].add(from);
    });
  });

  // An unchecked show merge can occasionally create a two-node cycle (see
  // step 3) — break any such pair deterministically so the rest of the
  // layout, which assumes a DAG, stays well-defined.
  nodeIds.forEach((a) => {
    predsOf[a].forEach((b) => {
      if (predsOf[b]?.has(a)) {
        if (a < b) predsOf[b].delete(a);
        else predsOf[a].delete(b);
      }
    });
  });

  // 5. Level each node by its longest predecessor chain, for column layout.
  const levelCache = {};
  function levelOf(did, seen = new Set()) {
    if (levelCache[did] !== undefined) return levelCache[did];
    if (seen.has(did)) return 0; // guard against cycles
    seen.add(did);
    const preds = [...predsOf[did]];
    const lvl = preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => levelOf(p, seen)));
    levelCache[did] = lvl;
    return lvl;
  }
  nodeIds.forEach((did) => levelOf(did));

  const rootDisplayId = displayIdOf[rootId];
  const maxLevel = Math.max(...Object.values(levelCache));
  const columns = {};
  nodeIds.forEach((did) => {
    // the root always sits in the rightmost column for readability
    const lvl = did === rootDisplayId ? maxLevel : levelCache[did];
    (columns[lvl] = columns[lvl] || []).push(did);
  });

  function repIndexOf(did) {
    const meta = nodesMeta[did];
    return byId[meta.isGroup ? meta.representative : did].index;
  }

  const succsOf = {};
  nodeIds.forEach((did) => (succsOf[did] = []));
  nodeIds.forEach((did) => predsOf[did].forEach((p) => succsOf[p].push(did)));

  // Row order within each column starts chronological, then gets refined by
  // a barycenter sweep (the standard trick for layered DAG drawings): each
  // column is repeatedly reordered by the average row position of whichever
  // neighboring column was just placed, so a node drifts toward sitting
  // level with the edges it actually connects to instead of criss-crossing
  // the whole frame. Alternating left-to-right (by predecessors) and
  // right-to-left (by successors) sweeps lets both directions pull a node
  // toward a stable, low-crossing position.
  Object.values(columns).forEach((ids) => ids.sort((a, b) => repIndexOf(a) - repIndexOf(b)));

  function currentRowPositions() {
    const pos = {};
    Object.values(columns).forEach((ids) => {
      ids.forEach((did, i) => (pos[did] = ids.length > 1 ? i / (ids.length - 1) : 0.5));
    });
    return pos;
  }

  const levelKeys = Object.keys(columns)
    .map(Number)
    .sort((a, b) => a - b);

  for (let pass = 0; pass < 4; pass++) {
    const forward = pass % 2 === 0;
    const order = forward ? levelKeys : [...levelKeys].reverse();
    order.forEach((lvl, i) => {
      if (i === 0) return; // no already-placed neighbors to anchor the first column of this sweep
      const pos = currentRowPositions();
      const getNeighbors = forward ? (did) => predsOf[did] : (did) => succsOf[did];
      const scored = columns[lvl].map((did) => {
        const ys = [...getNeighbors(did)].map((n) => pos[n]).filter((v) => v !== undefined);
        const score = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : pos[did];
        return { did, score };
      });
      scored.sort((a, b) => a.score - b.score || repIndexOf(a.did) - repIndexOf(b.did));
      columns[lvl] = scored.map((s) => s.did);
    });
  }

  // Columns are only as wide as the widest title they actually contain, so
  // short titles don't waste the horizontal space long ones need.
  const positions = {};
  let x = 40;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const ids = columns[lvl] || [];
    const colWidth = Math.max(...ids.map((did) => nodesMeta[did].width), MIN_NODE_WIDTH);
    ids.forEach((did, i) => {
      positions[did] = {
        x,
        y: 40 + i * ROW_HEIGHT,
        width: nodesMeta[did].width,
        height: nodesMeta[did].height,
      };
    });
    x += colWidth + COL_GAP;
  }
  const totalWidth = x - COL_GAP + 40;

  // 6. Prune edges already implied by another direct predecessor (e.g. Iron
  // Man 3 lists both Iron Man and Iron Man 2 — but Iron Man 2 already
  // requires Iron Man, so only that second edge needs to be drawn). Without
  // this, entries that cumulatively list a whole season's worth of prior
  // episodes turn into a solid mass of overlapping lines.
  const ancestorCache = {};
  function ancestorsOf(did, seen = new Set()) {
    if (ancestorCache[did]) return ancestorCache[did];
    if (seen.has(did)) return new Set(); // guard against cycles
    seen.add(did);
    const result = new Set();
    predsOf[did].forEach((p) => {
      result.add(p);
      ancestorsOf(p, seen).forEach((a) => result.add(a));
    });
    ancestorCache[did] = result;
    return result;
  }
  nodeIds.forEach((did) => ancestorsOf(did));

  const edges = [];
  nodeIds.forEach((did) => {
    const preds = [...predsOf[did]];
    const redundant = new Set();
    preds.forEach((p) => {
      preds.forEach((q) => {
        if (p !== q && ancestorCache[q].has(p)) redundant.add(p);
      });
    });
    preds.forEach((p) => {
      if (!redundant.has(p)) edges.push([p, did]);
    });
  });

  const height = Math.max(...Object.values(columns).map((c) => c.length)) * ROW_HEIGHT + 40;

  // The root only ever lists the predecessors it actually needs mentioned —
  // everything else in the graph is pulled in transitively. DetailView uses
  // this set to fade the transitive-only nodes/edges and keep the root's
  // own list highlighted.
  const directPredecessors = new Set(
    (byId[rootId]?.predecessors || [])
      .filter((p) => ancestorIds.has(p))
      .map((p) => displayIdOf[p])
  );

  return {
    nodeIds: [...nodeIds],
    positions,
    edges,
    width: totalWidth,
    height,
    directPredecessors,
    nodesMeta,
  };
}
