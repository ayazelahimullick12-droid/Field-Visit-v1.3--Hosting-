import React, { useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";
import divisions from "./bd-divisions.geojson.json";

// Decorative Bangladesh outline (the 8 division boundaries), drawn in with a
// stroke animation. Optional `pins` are [lng, lat] points that pop in with a
// pulsing ring. Used on the sign-in page and in the dashboard hero.
const W = 400, H = 480;

export default function BdOutline({ className, pins = [] }) {
  const { paths, project } = useMemo(() => {
    const proj = geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], divisions);
    const gen = geoPath(proj);
    return { paths: divisions.features.map((f) => gen(f)), project: proj };
  }, []);
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {paths.map((d, i) => <path key={i} d={d} className="shape" />)}
      {pins.map(([lng, lat], i) => {
        const p = project([lng, lat]);
        if (!p) return null;
        return (
          <g key={i}>
            <circle className="pin-ring" cx={p[0]} cy={p[1]} r="4" style={{ animationDelay: `${i * 0.45}s` }} />
            <circle className="pin" cx={p[0]} cy={p[1]} r="2.8" style={{ animationDelay: `${0.9 + i * 0.12}s` }} />
          </g>
        );
      })}
    </svg>
  );
}
