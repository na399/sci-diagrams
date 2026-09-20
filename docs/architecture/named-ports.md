# Named perimeter ports

An opt-in scientific entity can define `ports: [{id: "signal", x: 1, y: 0.25}]`; a connection selects it with `fromPort: "signal"`. `from` and `to` remain entity IDs. Existing `top/right/bottom/left` endpoint values retain their original meaning. Named identifiers cannot use these reserved names. Coordinates are normalized to the measured routable body and snap to the router's existing whole-pixel grid. Corners accept an explicit `side`.

The original routing bridge is retained byte-for-byte in `routeBase.ts`. Its wrapper refines only selected named-port routes using the existing corridor engine with other incumbents pinned. This is not a new router. Explicit straight paths retain their interior waypoints while named terminals update. An unsatisfied terminal or a corridor fallback fails; it does not export a misleading connection.

The first version supports named ports on rectangular routable bodies. Curved/nonrectangular outlines retain side-port attachment. Unknown names and malformed unused definitions fail explicitly. Full workspace and real-router regression tests remain release gates.
