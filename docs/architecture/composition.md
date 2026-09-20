# Measured composition

Scientific Group, Panel and Region containers accept `layout: {type: "row" | "column" | "grid" | "stack" | "overlay", gap, padding, header, align, columns, offsetX, offsetY}`. Direct children still use ordinary `containerId`. Omit both x/y to request flow positioning, or use `layoutItem: "flow"` to explicitly retain flow ownership when coordinates are present. Explicit x/y are pinned by default. Pinned children do not consume automatic cells.

The browser measures real component bodies first, composes inside-out, translates outside-in, updates only declared frame geometry, and then invokes the existing router. Text is not scaled to fit an enlarged container. There is no global graph placement or constraint solver. Frame dimensions remain minimums, and intentionally overlapping stack/overlay arrangements are supported.

A flow-positioned container cannot contain absolute descendants because their scene-space ownership would be ambiguous. Use flow throughout that subtree or pin the container. Invalid spacing, cycles, missing parents, partial coordinates, excessive depth and missing frame handles fail explicitly.

Measured JSON adds `layoutItem: "flow"` only for generated positions. Source input is not mutated; normalized paint, sanitized content and derived library values remain absent from the saved document. Reentering measured JSON therefore does not silently turn automatic children into fixed ones.

Expected browser layout errors return standard Issue fields with `code: "E_SCHEMA"` plus a specific `stageCode` such as `E_COMPOSITION` or `E_UNKNOWN_PORT`. The JSON pointer identifies the source element/property. Programming errors still propagate. The page is returned to its pool after either outcome.

Validation performed locally: 12 pure composition tests and 11 assertions against the actual Chromium composition adapter, including frame growth without font scaling. Full repository integration remains a merge gate.
