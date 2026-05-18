import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function compressAndCompositeVideo(
    videoPath, targetW, targetH, videoRect, bgPath, fgPath, outputPath, options = {}
) {
    const maxSizeBytes = options.maxSizeMB ? options.maxSizeMB * 1024 * 1024 : null;
    const bitrateSteps = maxSizeBytes
        ? [1500, 1200, 900, 700, 500, 350, 250, 180, 120]
        : [1500];

    const encode = (videoBitrateKbps) => new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        
        if (bgPath) command = command.input(bgPath);
        if (fgPath) command = command.input(fgPath);

        let filters = [];
        
        // 1. Scale output video rect
        const rw = Math.round(videoRect.w);
        const rh = Math.round(videoRect.h);
        const rx = Math.round(videoRect.x);
        const ry = Math.round(videoRect.y);
        
        // Use fit=cover style cropping
        filters.push(`[0:v]scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh}:(in_w-${rw})/2:(in_h-${rh})/2[v_scaled]`);

        let bgIndex = bgPath ? 1 : null;
        let fgIndex = fgPath ? (bgPath ? 2 : 1) : null;
        let lastOutput = 'v_scaled';

        // 2. Add video onto a solid transparent base (or bg image)
        if (bgPath) {
            filters.push(`[${bgIndex}:v]format=rgba[bg]`);
            filters.push(`[bg][${lastOutput}]overlay=${rx}:${ry}[with_bg]`);
            lastOutput = 'with_bg';
        } else {
            // Need a solid canvas if no bg image but we need targetW x targetH
            filters.push(`color=c=black@0:s=${targetW}x${targetH}[base]`);
            filters.push(`[base][${lastOutput}]overlay=${rx}:${ry}[with_bg]`);
            lastOutput = 'with_bg';
        }

        // 3. Add foreground
        if (fgPath) {
            filters.push(`[${fgIndex}:v]format=rgba[fg]`);
            filters.push(`[${lastOutput}][fg]overlay=0:0[final]`);
            lastOutput = 'final';
        }

        command.complexFilter(filters, lastOutput)
            .outputOptions([
                '-c:v libx264',
                `-b:v ${videoBitrateKbps}k`,
                `-maxrate ${Math.round(videoBitrateKbps * 1.35)}k`,
                `-bufsize ${Math.round(videoBitrateKbps * 2.7)}k`,
                '-preset slow',     // Better quality per bit
                '-c:a aac',
                '-b:a 64k',
                '-movflags +faststart',
                '-pix_fmt yuv420p'
            ])
            .save(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    for (const bitrate of bitrateSteps) {
        await fs.rm(outputPath, { force: true });
        await encode(bitrate);

        if (!maxSizeBytes) return;

        const stats = await fs.stat(outputPath);
        if (stats.size <= maxSizeBytes) {
            console.log(`[VideoComposite] Compressed under ${options.maxSizeMB}MB at ${bitrate}k: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
            return;
        }

        console.log(`[VideoComposite] Output ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${options.maxSizeMB}MB at ${bitrate}k, retrying...`);
    }

    const finalStats = await fs.stat(outputPath);
    if (maxSizeBytes && finalStats.size > maxSizeBytes) {
        throw new Error(`视频压缩后仍超过 ${options.maxSizeMB}MB，请使用更短的视频素材`);
    }
}
