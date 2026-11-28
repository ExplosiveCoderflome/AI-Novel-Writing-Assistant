# Saved chapter planning

This module scopes director reads and confirmation writes to saved `VolumeChapterPlan` rows in the current book's usable volume states. Automatic volume planning uses `active`; adopted outlines preserve `chapter_list_partial` or `chapter_list_generated`. Partial-route status may retain either active or generated as its base state.

Archived and other stale volume states are excluded. Callers still validate the exact chapter order, selected volume, and uniqueness; this filter does not choose a first match or infer a missing plan.
