import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Process an image: Intelligent Crop to target dimensions based on important region and compress.
 * @param {string} inputPath 
 * @param {string} outputPath 
 * @param {number} width 
 * @param {number} height 
 * @param {number} maxSizeKB 
 * @param {object} [importantRegion] - { ymin, xmin, ymax, xmax } in 0-1000 range
 */
export async function processImage(inputPath, outputPath, width = 1440, height = 2340, maxSizeKB = 200, importantRegion = null) {
    try {
        const maxSizeBytes = maxSizeKB * 1024;

        // Get original image metadata
        const metadata = await sharp(inputPath).metadata();
        const originalWidth = metadata.width;
        const originalHeight = metadata.height;

        // Calculate target aspect ratio
        const targetRatio = width / height;
        const sourceRatio = originalWidth / originalHeight;

        // Determine important center (normalized 0-1000 to pixels)
        let centerX = originalWidth / 2;
        let centerY = originalHeight / 2;

        if (importantRegion) {
            const regionX = ((importantRegion.xmin + importantRegion.xmax) / 2) / 1000 * originalWidth;
            const regionY = ((importantRegion.ymin + importantRegion.ymax) / 2) / 1000 * originalHeight;
            centerX = regionX;
            centerY = regionY;
        }

        let cropWidth, cropHeight, cropLeft, cropTop;

        if (sourceRatio > targetRatio) {
            // Source is wider - crop width
            cropHeight = originalHeight;
            cropWidth = Math.round(originalHeight * targetRatio);

            // Adjust cropLeft based on centerX
            cropLeft = Math.round(centerX - cropWidth / 2);
            // Clamp to bounds
            cropLeft = Math.max(0, Math.min(originalWidth - cropWidth, cropLeft));
            cropTop = 0;
        } else {
            // Source is taller - crop height
            cropWidth = originalWidth;
            cropHeight = Math.round(originalWidth / targetRatio);

            // Adjust cropTop based on centerY
            cropTop = Math.round(centerY - cropHeight / 2);
            // Clamp to bounds
            cropTop = Math.max(0, Math.min(originalHeight - cropHeight, cropTop));
            cropLeft = 0;
        }

        let quality = 80;
        let buffer;
        let scale = 1.0;
        let currentWidth = width;
        let currentHeight = height;

        // Compression loop
        while (quality >= 10 && scale >= 0.5) {
            const pipeline = sharp(inputPath)
                .extract({
                    left: cropLeft,
                    top: cropTop,
                    width: cropWidth,
                    height: cropHeight
                })
                .resize({
                    width: Math.round(currentWidth * scale),
                    height: Math.round(currentHeight * scale),
                    fit: 'fill',
                    kernel: sharp.kernel.lanczos3
                })
                .jpeg({ quality, mozjpeg: true });

            buffer = await pipeline.toBuffer();

            if (buffer.length <= maxSizeBytes) {
                break;
            }

            // Strategy: Reduce quality gradually first
            if (quality > 20) {
                quality -= 5;
            } else {
                // If quality is already low, start reducing resolution
                scale -= 0.1;
                quality = 80; // Reset quality for the smaller resolution
            }
        }

        if (buffer.length > maxSizeBytes) {
            console.warn(`Warning: Could not compress image below ${maxSizeKB}KB even after resizing. Current: ${(buffer.length / 1024).toFixed(2)}KB`);
        }

        await fs.writeFile(outputPath, buffer);

        return {
            width: Math.round(currentWidth * scale),
            height: Math.round(currentHeight * scale),
            size: buffer.length,
            path: outputPath
        };
    } catch (error) {
        console.error("Smart Crop failed:", error);
        throw error;
    }
}
