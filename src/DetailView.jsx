import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { TypeIcon } from "./icons.jsx";
import { formatYear } from "./dates.js";
import { buildAncestorGraph } from "./graph.js";

export default function DetailView({ data, id, onBack, onSelect }) {
  const { universes, types, byId } = data;

  const entry = byId[id];
  const graph = useMemo(() => buildAncestorGraph(id, byId), [id, byId]);

  // The root is always laid out in the rightmost column, so a freshly
  // opened (or wide) graph should start scrolled there instead of at the
  // unrelated far-past ancestors on the left.
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [graph]);

  if (!entry) return null;

  const universe = universes[entry.universe];
  const type = types[entry.type] || { label: entry.type };
  const note = (entry.note || "").trim();
  const hasGroupNodes = graph.nodeIds.some((nid) => graph.nodesMeta[nid].isGroup);

  return (
    <main className="page">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={15} /> Back to list
      </button>

      <div className="detail-kicker" style={{ color: universe.color }}>
        <TypeIcon icon={type.icon} size={15} />
        <span>{type.label}</span>
      </div>

      <h1 className="page-title">{entry.title}</h1>

      <div className="detail-meta">
        <span>
          set in {formatYear(entry.date)}
          {entry.period ? ` (${entry.period})` : ""}
        </span>
        <span>released {entry.releaseYear}</span>
      </div>

      <div
        className="universe-card"
        style={{ background: `${universe.color}14`, borderColor: `${universe.color}40` }}
      >
        <span className="universe-card-label" style={{ color: universe.color }}>
          {universe.label}
        </span>
        {universe.earth && <span className="universe-card-earth"> · {universe.earth}</span>}
        <span className="universe-card-caption"> — {universe.caption}</span>
      </div>

      {note && (
        <p className="note-card" style={{ borderLeftColor: `${universe.color}66` }}>
          {note}
        </p>
      )}

      <h2 className="section-title">Required viewing</h2>
      <p className="section-sub">
        {entry.predecessors.length === 0
          ? "No prior entries needed — this is a starting point."
          : "Everything below feeds into this entry. Click a node to jump to it."}
        {hasGroupNodes &&
          " Dashed nodes stand in for a whole other season or show, collapsed into one box — click to jump to its first episode."}
      </p>

      {entry.predecessors.length > 0 && (
        <div className="graph-frame" ref={scrollRef}>
          <svg
            width={graph.width}
            height={graph.height}
            style={{ display: "block", minWidth: graph.width }}
          >
            {graph.edges.map(([from, to], i) => {
              const a = graph.positions[from];
              const b = graph.positions[to];
              const midX = (a.x + b.x) / 2;
              const ay = a.y + a.height / 2;
              const by = b.y + b.height / 2;
              // An edge is "featured" only when both ends are the root or one
              // of its explicitly listed predecessors — everything pulled in
              // transitively (a predecessor's own predecessors, and so on)
              // fades into the background instead of being hidden outright.
              const featured =
                (from === id || graph.directPredecessors.has(from)) &&
                (to === id || graph.directPredecessors.has(to));
              return (
                <path
                  key={i}
                  d={`M ${a.x + a.width} ${ay} C ${midX} ${ay}, ${midX} ${by}, ${b.x} ${by}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={1.5}
                  opacity={featured ? 1 : 0.25}
                />
              );
            })}

            {graph.nodeIds.map((nid) => {
              const meta = graph.nodesMeta[nid];
              const pos = graph.positions[nid];
              const u = universes[meta.universe];
              const isRoot = nid === id;
              const featured = isRoot || graph.directPredecessors.has(nid);
              return (
                <g
                  key={nid}
                  className={isRoot ? "graph-node-root" : "graph-node"}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => !isRoot && onSelect(meta.isGroup ? meta.representative : nid)}
                  opacity={featured ? 1 : 0.35}
                >
                  {/* Edges are drawn before nodes so nodes sit on top, but a
                      merely-tinted fill still lets them show through — this
                      opaque backing actually occludes whatever passes behind. */}
                  {!isRoot && (
                    <rect width={pos.width} height={pos.height} rx={7} style={{ fill: "var(--bg)" }} />
                  )}
                  <rect
                    width={pos.width}
                    height={pos.height}
                    rx={7}
                    fill={isRoot ? u.color : `${u.color}22`}
                    stroke={u.color}
                    strokeWidth={isRoot ? 0 : 1.3}
                    strokeDasharray={meta.isGroup ? "3 2" : undefined}
                  />
                  <text
                    x={pos.width / 2}
                    y={pos.height / 2 - ((meta.lines.length - 1) * 12) / 2 + 4}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontFamily="Inter, sans-serif"
                    fontWeight={isRoot ? 700 : 500}
                    fill={isRoot ? "#0b0d12" : "#e5e7eb"}
                  >
                    {meta.lines.map((line, li) => (
                      <tspan key={li} x={pos.width / 2} dy={li === 0 ? 0 : 12}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </main>
  );
}
