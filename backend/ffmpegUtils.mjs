import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const settleOnce = (resolve, reject, timeoutRef, fn, value) => {
    if (timeoutRef.settled) return;
    timeoutRef.settled = true;
    if (timeoutRef.timer) clearTimeout(timeoutRef.timer);
    fn === 'resolve' ? resolve(value) : reject(value);
};

export async function compressAndCompositeVideo(
    videoPath, targetW, targetH, videoRect, bgPath, fgPath, outputPath, options = {}
) {
    const maxSizeBytes = options.maxSizeMB ? options.maxSizeMB * 1024 * 1024 : null;
    const bitrateSteps = maxSizeBytes
        ? [null, 1500, 1200, 900, 700, 500, 350, 250, 180, 120]
        : [null];

    const encode = (videoBitrateKbps) => new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        if (options.maxDurationSec) command = command.duration(options.maxDurationSec);
        
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

        const outputOptions = [
                '-c:v libx264',
                '-preset slow',     // Better quality per bit
                '-c:a aac',
                '-b:a 128k',
                '-movflags +faststart',
                '-pix_fmt yuv420p'
        ];

        if (videoBitrateKbps) {
            outputOptions.splice(
                2,
                0,
                `-b:v ${videoBitrateKbps}k`,
                `-maxrate ${Math.round(videoBitrateKbps * 1.35)}k`,
                `-bufsize ${Math.round(videoBitrateKbps * 2.7)}k`
            );
        } else {
            // No max-size target means "compose only": avoid forced low-bitrate compression.
            outputOptions.splice(2, 0, '-crf 18');
        }

        command.complexFilter(filters, lastOutput)
            .outputOptions(outputOptions)
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
            console.log(`[VideoComposite] Output under ${options.maxSizeMB}MB${bitrate ? ` at ${bitrate}k` : " with high-quality encode"}: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
            return;
        }

        console.log(`[VideoComposite] Output ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds ${options.maxSizeMB}MB${bitrate ? ` at ${bitrate}k` : " with high-quality encode"}, retrying...`);
    }

    const finalStats = await fs.stat(outputPath);
    if (maxSizeBytes && finalStats.size > maxSizeBytes) {
        throw new Error(`视频压缩后仍超过 ${options.maxSizeMB}MB，请使用更短的视频素材`);
    }
}

export async function resizeVideoToDimensions(videoPath, targetW, targetH, outputPath, options = {}) {
    const duration = Number(options.maxDurationSec) > 0 ? Number(options.maxDurationSec) : null;
    const fps = Number(options.fps) > 0 ? Math.round(Number(options.fps)) : null;
    const crf = Number(options.crf) > 0 ? Math.round(Number(options.crf)) : 18;
    const preset = typeof options.preset === 'string' ? options.preset : 'medium';
    const timeoutMs = Number(options.timeoutMs) > 0 ? Math.round(Number(options.timeoutMs)) : 0;
    const outputOptions = [
        '-c:v libx264',
        `-crf ${crf}`,
        `-preset ${preset}`,
        '-movflags +faststart',
        '-pix_fmt yuv420p'
    ];

    if (options.videoBitrate) {
        outputOptions.push(`-b:v ${options.videoBitrate}`);
    }

    if (options.keepAudio) {
        outputOptions.push('-c:a aac', '-b:a 128k');
    } else {
        outputOptions.push('-an');
    }

    return new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        if (duration) command = command.duration(duration);

        const filters = [
                `scale=${Math.round(targetW)}:${Math.round(targetH)}:force_original_aspect_ratio=increase`,
                `crop=${Math.round(targetW)}:${Math.round(targetH)}:(in_w-${Math.round(targetW)})/2:(in_h-${Math.round(targetH)})/2`
        ];
        if (fps) filters.push(`fps=${fps}`);

        const timeoutRef = { timer: null, settled: false };
        if (timeoutMs) {
            timeoutRef.timer = setTimeout(() => {
                try {
                    command.kill('SIGKILL');
                } catch (_) { }
                settleOnce(resolve, reject, timeoutRef, 'reject', new Error(`视频导出超时，请使用更短的视频或稍后重试`));
            }, timeoutMs);
        }

        command
            .videoFilters(filters)
            .outputOptions(outputOptions)
            .save(outputPath)
            .on('end', () => settleOnce(resolve, reject, timeoutRef, 'resolve'))
            .on('error', (err) => settleOnce(resolve, reject, timeoutRef, 'reject', err));
    });
}

export async function resizeVideoToMaxSide(videoPath, maxSide, outputPath, options = {}) {
    const duration = Number(options.maxDurationSec) > 0 ? Number(options.maxDurationSec) : null;
    const fps = Number(options.fps) > 0 ? Math.round(Number(options.fps)) : null;
    const side = Math.max(16, Math.round(maxSide || 1024));
    const outputOptions = [
        '-c:v libx264',
        '-crf 18',
        '-preset medium',
        '-an',
        '-movflags +faststart',
        '-pix_fmt yuv420p'
    ];

    return new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        if (duration) command = command.duration(duration);

        const filters = [
            `scale=min(iw\\,${side}):min(ih\\,${side}):force_original_aspect_ratio=decrease`,
            `scale=max(16\\,trunc(iw/16)*16):max(16\\,trunc(ih/16)*16)`
        ];
        if (fps) filters.push(`fps=${fps}`);

        command
            .videoFilters(filters)
            .outputOptions(outputOptions)
            .save(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}

export async function removeWhiteBackgroundFromVideo(videoPath, outputPath, options = {}) {
    const duration = Number(options.maxDurationSec) > 0 ? Number(options.maxDurationSec) : null;
    const similarity = Number.isFinite(Number(options.similarity)) ? Number(options.similarity) : 0.16;
    const blend = Number.isFinite(Number(options.blend)) ? Number(options.blend) : 0.06;
    const fps = Number(options.fps) > 0 ? Math.round(Number(options.fps)) : null;
    const maxWidth = Number(options.maxWidth) > 0 ? Math.round(Number(options.maxWidth)) : null;
    const maxHeight = Number(options.maxHeight) > 0 ? Math.round(Number(options.maxHeight)) : null;

    return new Promise((resolve, reject) => {
        let command = ffmpeg(videoPath);
        if (duration) command = command.duration(duration);

        const filters = [];
        if (maxWidth || maxHeight) {
            const scaleWidth = maxWidth || -2;
            const scaleHeight = maxHeight || -2;
            filters.push(`scale=${scaleWidth}:${scaleHeight}:force_original_aspect_ratio=decrease`);
        }
        if (fps) filters.push(`fps=${fps}`);
        filters.push(`colorkey=0xFFFFFF:${similarity}:${blend}`);
        filters.push('format=yuva420p');

        command
            .videoFilters(filters)
            .outputOptions([
                '-c:v libvpx-vp9',
                '-pix_fmt yuva420p',
                '-auto-alt-ref 0',
                '-b:v 0',
                '-crf 30',
                '-an',
                '-movflags +faststart'
            ])
            .save(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
}
