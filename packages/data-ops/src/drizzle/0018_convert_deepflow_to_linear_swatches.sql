-- Convert deprecated 'deepFlow' style to 'linearSwatches' in palettes table
UPDATE `palettes` SET `style` = 'linearSwatches' WHERE `style` = 'deepFlow';

-- Convert deprecated 'deepFlow' style to 'linearSwatches' in likes table
UPDATE `likes` SET `style` = 'linearSwatches' WHERE `style` = 'deepFlow';
