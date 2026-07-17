-- Convert deprecated 'auroraMesh' style to 'radialGradient' in palettes table
UPDATE `palettes` SET `style` = 'radialGradient' WHERE `style` = 'auroraMesh';

-- Convert deprecated 'auroraMesh' style to 'radialGradient' in likes table
UPDATE `likes` SET `style` = 'radialGradient' WHERE `style` = 'auroraMesh';
