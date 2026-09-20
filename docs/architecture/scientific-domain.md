# Scientific domain primitives

The scientific profile adds `SciSequence` (uniquely identified item labels in horizontal/vertical cells), `SciRepeat` (a bounded visible stack annotated with its actual repeat count), and configurable abstract matrix rows/columns. Tensor dimensions remain symbolic labels. A repeated stack is one component, not secretly many separately addressable graph nodes. Use ordinary MDP entities when individual copies need connections.

`SciLink` supports `flow`, `association`, `annotation` and `uncertain` relations with explicit `lineStyle` and `endArrowhead` overrides. These control drawing conventions, not causal or clinical validity.

`SciTimeline` retains proportional numeric offsets. New options are `unit`, `originLabel`, `subrowGap`, and item `row` (0..15). An item of kind `censor` draws a vertical terminal mark. Explicit interval closure remains left/right/both/neither. Subrows change only y; event labels near the right edge anchor toward the interior. Captions use a stable minimum height so measured-JSON echo does not repeatedly increase padding.

Supported units are labels for numeric offsets, not a calendar arithmetic system. A month-labelled coordinate is not implicitly converted into a fixed number of days. Missing or uncertain clinical dates must not be invented to make a figure fit. Examples use synthetic data only.

Local validation: eight sequence/repetition/timeline-refinement tests passed, including exact x-coordinate preservation and stable height on echo. Real-resolver and renderer tests are committed and remain CI merge gates.
