import { Film, Tv, Clapperboard, Sparkles } from "lucide-react";

/* `data.json` names its icons as strings so the data file stays free of any
   dependency on the component library. */
const ICONS = {
  film: Film,
  tv: Tv,
  clapperboard: Clapperboard,
  sparkles: Sparkles,
};

export function TypeIcon({ icon, size = 14 }) {
  const Icon = ICONS[icon] || Film;
  return <Icon size={size} strokeWidth={2} />;
}
