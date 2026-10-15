-- The promo preview's own data (a worktree's local D1, never staging or production): two cards of Popular's first
-- page replaced by palettes the admins liked, in the views they were liked in. The two marked ones leave the order,
-- and each chosen one takes the likes count that lands it in the slot it replaces (44 and 39 around the first, 37 and
-- 34 around the second), so every other card keeps its place.
UPDATE k_palettes SET likes_count = 0 WHERE seed IN ('kcERi8Fyy_zqWO_hlTGb7C9OA3va4rz2CA29A', 'kc_DROeCs-9zAuVDz73lBU_IAAsqql7ZWDE9g');
UPDATE k_palettes SET likes_count = 43, style = 'linearGradient', steps = 6, angle = 345 WHERE seed = 'kY70SMeJm-3mdOrzGrr66E6eWrPS';
UPDATE k_palettes SET likes_count = 35, style = 'linearGradient', steps = 6, angle = 315 WHERE seed = 'kUtmXN5yfCHMZwV4hzmA';
