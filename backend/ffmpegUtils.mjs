import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function compressAndCompositeVideo(
    videoPath, targetW, targetH, videoRect, bgPath, fgPath, outputPath
) {
    return new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        
        let inputs = 1; // video is 0
        if (bgPath) { command = command.input(bgPath); inputs++; }
        if (fgPath) { command = command.input(fgPath); inputs++; }

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
                '-b:v 1500k',       // Aggressive constraint for 3MB
                '-maxrate 2000k', 
                '-bufsize 4000k',
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
}
