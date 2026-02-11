import { AdAsset, AdConfig } from '../types';
import { ASSETS_URL } from '../services/api';
import { getDerivedGradientColor, hexToRgb } from './colorUtils';

/**
 * Helper to load image with cache-busting
 */
const loadImg = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const isDataUrl = src.startsWith('data:');
        const separator = src.includes('?') ? '&' : '?';
        img.src = isDataUrl ? src : `${src}${separator}t=${Date.now()}`;
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
};

/**
 * Helper: Draw image with object-fit: cover
 */
const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let sx, sy, sw, sh;
    if (imgRatio > targetRatio) {
        sh = img.naturalHeight;
        sw = sh * targetRatio;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
    } else {
        sw = img.naturalWidth;
        sh = sw / targetRatio;
        sy = (img.naturalHeight - sh) / 2;
        sx = 0;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

/**
 * Helper: Draw image with object-fit: contain
 */
const drawImageContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, align: 'center' | 'top' = 'center') => {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let dw, dh, dx, dy;
    if (imgRatio > targetRatio) {
        dw = w;
        dh = w / imgRatio;
        dx = x;
        dy = align === 'top' ? y : y + (h - dh) / 2;
    } else {
        dh = h;
        dw = h * imgRatio;
        dx = x + (w - dw) / 2;
        dy = y;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
};

/**
 * Intelligent asset compositor that replicates the PreviewGrid download logic.
 * Returns a Blob (JPEG/MP4) of the composited result.
 */
export async function compositeAsset(asset: AdAsset, config: AdConfig): Promise<Blob> {
    // If it's a video, just return the raw video
    // (We don't support compositing on top of videos in client-side yet)
    if (asset.type.startsWith('video')) {
        const resp = await fetch(asset.url);
        return await resp.blob();
    }

    const isHotRecommend = asset.id.includes('mt-ib-1');
    const isTopicBg = asset.id.includes('mt-ib-3');
    const isStandardFocal = asset.category === '焦点视窗' && !isHotRecommend && !isTopicBg;
    const isImmersiveFocal = asset.templateName.includes('沉浸式');

    // Check if we need compositing (usually when mask is shown or badge is enabled)
    const showMask = config.showMask;
    const showBadge = true; // Use badge if available in batch

    const needsComposite = showMask ||
        (asset.category === '焦点视窗' && showBadge && asset.badgeOverlayUrl) ||
        (isHotRecommend && showBadge && asset.badgeOverlayUrl) ||
        (isTopicBg && showBadge && asset.badgeOverlayUrl);

    if (!needsComposite) {
        const resp = await fetch(asset.url);
        return await resp.blob();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    if (asset.category === '焦点视窗') {
        const focalAssetsDir = isImmersiveFocal ? 'focal-window-immersive' : 'focal-window';

        const loadList = [
            loadImg(asset.url),
            loadImg(`/${focalAssetsDir}/fixed_bg_1.png?v=${config.assetsVersion}`),
            loadImg(`/${focalAssetsDir}/fixed_bg_2.png?v=${config.assetsVersion}`),
            loadImg(`/${focalAssetsDir}/icon_bg.png?v=${config.assetsVersion}`)
        ];

        if (showBadge && asset.badgeOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`));
        }

        const loadedImages = await Promise.all(loadList);
        const mainImg = loadedImages[0];
        const bg1 = loadedImages[1];
        const bg2 = loadedImages[2];
        const iconMask = loadedImages[3];
        const badgeImg = loadedImages[4];

        // Correct target dimensions
        const targetW = (showMask || !isImmersiveFocal) ? 1126 : 1440;
        const targetH = showMask ? 2436 : (isImmersiveFocal ? 2340 : 900);

        canvas.width = targetW;
        canvas.height = targetH;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (showMask) {
            const dw = targetW;
            const dh = (mainImg.naturalHeight / mainImg.naturalWidth) * targetW;
            const baseColor = asset.aiExtractedColor || '#FF00FF';
            const finalGradientColor = asset.gradientColor || getDerivedGradientColor(baseColor);

            if (isImmersiveFocal) {
                ctx.drawImage(mainImg, 0, 0, dw, dh);
                ctx.drawImage(bg2, 0, 0, targetW, targetH);

                // Gradient at 1600px
                ctx.save();
                const barHeight = (500 / 1126) * targetW;
                const barY = (1600 / 1126) * targetW;
                const grad = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
                const rgb = hexToRgb(finalGradientColor);
                const colorStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}`;
                grad.addColorStop(0, `${colorStr}, 0)`);
                grad.addColorStop(0.1, `${colorStr}, 1)`);
                grad.addColorStop(0.3, `${colorStr}, 1)`);
                grad.addColorStop(1, `${colorStr}, 0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, barY, targetW, barHeight);
                ctx.restore();

                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = targetW;
                iconCanvas.height = targetH;
                const iconCtx = iconCanvas.getContext('2d')!;
                iconCtx.fillStyle = baseColor;
                iconCtx.fillRect(0, 0, targetW, targetH);
                iconCtx.globalCompositeOperation = 'destination-in';
                iconCtx.drawImage(iconMask, 0, 0, targetW, targetH);
                ctx.drawImage(iconCanvas, 0, 0);

                ctx.drawImage(bg1, 0, 0, targetW, targetH);
            } else {
                ctx.drawImage(mainImg, 0, 0, dw, dh);
                ctx.drawImage(bg2, 0, 0, targetW, targetH);

                // Gradient at 750px
                ctx.save();
                const barHeight = (500 / 1126) * targetW;
                const barY = (750 / 1126) * targetW;
                const grad = ctx.createLinearGradient(0, barY, 0, barY + barHeight);
                const rgb = hexToRgb(finalGradientColor);
                const colorStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}`;
                grad.addColorStop(0, `${colorStr}, 0)`);
                grad.addColorStop(0.1, `${colorStr}, 1)`);
                grad.addColorStop(0.3, `${colorStr}, 1)`);
                grad.addColorStop(1, `${colorStr}, 0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, barY, targetW, barHeight);
                ctx.restore();

                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = targetW;
                iconCanvas.height = targetH;
                const iconCtx = iconCanvas.getContext('2d')!;
                iconCtx.fillStyle = baseColor;
                iconCtx.fillRect(0, 0, targetW, targetH);
                iconCtx.globalCompositeOperation = 'destination-in';
                iconCtx.drawImage(iconMask, 0, 0, targetW, targetH);
                ctx.drawImage(iconCanvas, 0, 0);

                ctx.drawImage(bg1, 0, 0, targetW, targetH);
            }
        } else {
            ctx.drawImage(mainImg, 0, 0, targetW, targetH);
        }

        if (showBadge && badgeImg) {
            const bH = (showMask && isImmersiveFocal) ? 2436 : (showMask ? 900 : targetH);
            drawImageContain(ctx, badgeImg, 0, 0, targetW, bH, 'top');
        }

    } else if (isHotRecommend || isTopicBg) {
        // Hot Recommend / Topic Background logic
        const loadList = [loadImg(asset.url)];
        if (showMask && asset.maskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.maskUrl}`));
        } else {
            loadList.push(Promise.resolve(null as any));
        }
        if (showBadge && asset.badgeOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`));
        } else {
            loadList.push(Promise.resolve(null as any));
        }

        const [mainImg, maskImg, badgeImg] = await Promise.all(loadList);
        const targetW = showMask ? 1126 : (isHotRecommend ? 720 : 1126);
        const targetH = showMask ? 2436 : (isHotRecommend ? 960 : 640);
        canvas.width = targetW;
        canvas.height = targetH;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);

        if (showMask && maskImg) {
            if (isHotRecommend) {
                ctx.drawImage(maskImg, 0, 0, targetW, targetH);
                drawImageCover(ctx, mainImg, 708, 1779, 288, 384);
                if (showBadge && badgeImg) {
                    drawImageContain(ctx, badgeImg, 708, 1779, 288, 384, 'top');
                }
            } else {
                // Topic Background: Image -> Badge -> Mask
                drawImageCover(ctx, mainImg, 0, 0, 1126, 640);
                if (showBadge && badgeImg) {
                    drawImageContain(ctx, badgeImg, 0, 0, 1126, 640, 'top');
                }
                ctx.drawImage(maskImg, 0, 0, targetW, targetH);
            }
        } else {
            drawImageCover(ctx, mainImg, 0, 0, targetW, targetH);
            if (showBadge && badgeImg) {
                drawImageContain(ctx, badgeImg, 0, 0, targetW, targetH);
            }
        }

    } else if (asset.category === '开屏') {
        const isNonFullscreenSplash = asset.templateName === '非全屏';
        // Load main image, mask, and potential crop overlay
        const loadList = [loadImg(asset.url)];

        if (showMask && asset.maskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.maskUrl}`));
        } else {
            loadList.push(Promise.resolve(null as any));
        }

        if (config.showCrop && asset.cropOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.cropOverlayUrl}`));
        } else {
            loadList.push(Promise.resolve(null as any));
        }

        const [mainImg, maskImg, cropImg] = await Promise.all(loadList);
        const targetW = 1440;
        // Match preview aspectRatio: 2340 if mask is on, otherwise template default
        const targetH = showMask ? 2340 : (isNonFullscreenSplash ? 1938 : 2340);
        canvas.width = targetW;
        canvas.height = targetH;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);

        // Drawing alignment: object-top if mask is on, middle if mask is off
        const scale = Math.min(targetW / mainImg.naturalWidth, targetH / mainImg.naturalHeight);
        const dw = mainImg.naturalWidth * scale;
        const dh = mainImg.naturalHeight * scale;
        const dx = (targetW - dw) / 2;
        const dy = showMask ? 0 : (targetH - dh) / 2;
        ctx.drawImage(mainImg, dx, dy, dw, dh);

        // Draw Mask or Crop on TOP if they exist
        if (maskImg) {
            ctx.drawImage(maskImg, 0, 0, targetW, targetH);
        }
        if (cropImg) {
            // Replicate object-contain rendering for crop overlay
            const cScale = Math.min(targetW / cropImg.naturalWidth, targetH / cropImg.naturalHeight);
            const cdw = cropImg.naturalWidth * cScale;
            const cdh = cropImg.naturalHeight * cScale;
            const cdx = (targetW - cdw) / 2;
            const cdy = (targetH - cdh) / 2;
            ctx.drawImage(cropImg, cdx, cdy, cdw, cdh);
        }

        if (showMask) {
            const isUpDownSliding = asset.templateName === '上下滑动开屏';
            const fontSize = (isUpDownSliding || isNonFullscreenSplash) ? 58 : 42;
            const bottomOffset = isNonFullscreenSplash ? 610 : (isUpDownSliding ? 285 : targetH * 0.0897);

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = `${0.1 * fontSize}px`; }
            ctx.font = `bold ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
            ctx.fillText(asset.splashText || config.splashText, targetW / 2, targetH - bottomOffset);
        }
    } else {
        const img = await loadImg(asset.url);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
    }

    const targetSizeBytes = 200 * 1024;
    return new Promise((resolve, reject) => {
        let quality = 0.9;

        async function attempt() {
            canvas.toBlob(async (blob) => {
                if (!blob) return reject(new Error('Failed to create blob'));

                if (blob.size <= targetSizeBytes || quality <= 0.1) {
                    resolve(blob);
                } else {
                    quality -= 0.1;
                    attempt();
                }
            }, 'image/jpeg', quality);
        }

        attempt();
    });
}
