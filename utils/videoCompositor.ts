import { AdAsset, AdConfig } from '../types';
import { ASSETS_URL } from '../services/api';
import { getDerivedGradientColor, hexToRgb } from './colorUtils';

const loadImg = (src: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        const isLocalUrl = src.startsWith('data:') || src.startsWith('blob:');
        if (!isLocalUrl) img.crossOrigin = "anonymous";
        const separator = src.includes('?') ? '&' : '?';
        img.src = `${isLocalUrl ? src : src + separator + 't=' + Date.now()}`;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
    });
};

const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let sx, sy, sw, sh;
    if (imgRatio > targetRatio) {
        sh = img.naturalHeight; sw = sh * targetRatio;
        sx = (img.naturalWidth - sw) / 2; sy = 0;
    } else {
        sw = img.naturalWidth; sh = sw / targetRatio;
        sy = (img.naturalHeight - sh) / 2; sx = 0;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

const drawImageContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, align: 'center' | 'top' = 'center') => {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = w / h;
    let dw, dh, dx, dy;
    if (imgRatio > targetRatio) {
        dw = w; dh = w / imgRatio;
        dx = x; dy = align === 'top' ? y : y + (h - dh) / 2;
    } else {
        dh = h; dw = h * imgRatio;
        dx = x + (w - dw) / 2; dy = y;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
};

export async function exportVideoElements(asset: AdAsset, config: AdConfig, videoDimensions: {w: number, h: number}) {
    const isHotRecommend = asset.id.includes('mt-ib-1');
    const isHotSearch = asset.id.includes('mt-ib-2');
    const isTopicBg = asset.id.includes('mt-ib-3');
    const isTopicBanner = asset.id.includes('mt-ib-4');
    const isPopup = asset.category === '弹窗';
    const isScorePopup = isPopup && asset.id.includes('mt-p-1');
    const isHomePopup = isPopup && (asset.id.includes('mt-p-2') || asset.id.includes('mt-p-3'));
    const isImmersiveFocal = asset.templateName.includes('沉浸式');
    const isRecipeContent = asset.id.includes('mt-fe-1');
    
    const isWink = asset.app === 'wink';
    const showMask = config.showMask;
    const showBadge = (config as any).showBadge !== undefined ? (config as any).showBadge : (asset.showBadge ?? false);

    const bgCanvas = document.createElement('canvas');
    const fgCanvas = document.createElement('canvas');
    const bgCtx = bgCanvas.getContext('2d')!;
    const fgCtx = fgCanvas.getContext('2d')!;

    let targetW = 1126; let targetH = 2436;
    let videoRect = {x:0, y:0, w:0, h:0};

    // Calculate dimensions
    if (asset.category === '焦点视窗') {
        const isMeiyan = asset.app === '美颜';
        targetW = showMask ? 1126 : (isImmersiveFocal ? 1440 : (isMeiyan ? 1284 : 1126));
        targetH = showMask ? (isWink ? 2438 : 2436) : (isImmersiveFocal ? 2340 : (isWink ? 1410 : (isMeiyan ? 1128 : 900)));
    } else if (isHotRecommend && !showMask) {
        targetW = 720; targetH = 960;
    } else if (asset.category === '开屏') {
        const isNonFullscreenSplash = asset.id.includes('mt-s-5');
        targetW = 1440; targetH = showMask ? 2340 : (isNonFullscreenSplash ? 1938 : 2340);
    }

    bgCanvas.width = fgCanvas.width = targetW;
    bgCanvas.height = fgCanvas.height = targetH;
    
    const loadList: Promise<HTMLImageElement | null>[] = [
        asset.maskUrl ? loadImg(`${ASSETS_URL}${asset.maskUrl}`) : Promise.resolve(null),
        asset.badgeOverlayUrl ? loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`) : Promise.resolve(null),
        asset.cropOverlayUrl ? loadImg(`${ASSETS_URL}${asset.cropOverlayUrl}`) : Promise.resolve(null)
    ];

    if (asset.category === '焦点视窗') {
        const focalAssetsDir = isImmersiveFocal ? 'focal-window-immersive' : 'focal-window';
        loadList.push(loadImg(`/${focalAssetsDir}/fixed_bg_1.png?v=${config.assetsVersion}`));
        loadList.push(loadImg(`/${focalAssetsDir}/fixed_bg_2.png?v=${config.assetsVersion}`));
        loadList.push(loadImg(`/${focalAssetsDir}/icon_bg.png?v=${config.assetsVersion}`));
    }

    const loaded = await Promise.all(loadList);
    const maskImg = loaded[0];
    const badgeImg = loaded[1];
    const cropImg = loaded[2];

    const vw = videoDimensions.w;
    const vh = videoDimensions.h;

    // Helper functions to draw on FG or BG
    if (asset.category === '焦点视窗') {
        const bg1 = loaded[3]; const bg2 = loaded[4]; const iconMask = loaded[5];
        if (showMask) {
            videoRect = {x:0, y:0, w:targetW, h: (vh / vw) * targetW};
            const isMeiyan = asset.app === '美颜';
            // Focal window draws BG, then video, then more BG? Wait, video is bottom!
            if ((isWink || isMeiyan) && maskImg) {
                // Meiyan & Wink Focal Window: Draw mask on FG layer (on top of video)
                fgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
            } else if (isImmersiveFocal && bg1 && bg2 && iconMask) {
                // Video is at 0, 0, w: targetW, h: dh
                const baseColor = asset.aiExtractedColor || '#FF00FF';
                const finalGradientColor = asset.gradientColor || getDerivedGradientColor(baseColor);
                
                fgCtx.drawImage(bg2, 0, 0, targetW, targetH);

                const barHeight = (500 / 1126) * targetW;
                const barY = (1600 / 1126) * targetW;
                const grad = fgCtx.createLinearGradient(0, barY, 0, barY + barHeight);
                const rgb = hexToRgb(finalGradientColor);
                const colorStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}`;
                grad.addColorStop(0, `${colorStr}, 0)`);
                grad.addColorStop(0.1, `${colorStr}, 1)`);
                grad.addColorStop(0.3, `${colorStr}, 1)`);
                grad.addColorStop(1, `${colorStr}, 0)`);
                fgCtx.fillStyle = grad;
                fgCtx.fillRect(0, barY, targetW, barHeight);

                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = targetW; iconCanvas.height = targetH;
                const iconCtx = iconCanvas.getContext('2d')!;
                iconCtx.fillStyle = baseColor; iconCtx.fillRect(0, 0, targetW, targetH);
                iconCtx.globalCompositeOperation = 'destination-in';
                iconCtx.drawImage(iconMask, 0, 0, targetW, targetH);
                fgCtx.drawImage(iconCanvas, 0, 0);

                fgCtx.drawImage(bg1, 0, 0, targetW, targetH);
            } else {
                fgCtx.drawImage(bg2, 0, 0, targetW, targetH);
                const baseColor = asset.aiExtractedColor || '#FF00FF';
                const finalGradientColor = asset.gradientColor || getDerivedGradientColor(baseColor);
                
                const barHeight = (500 / 1126) * targetW;
                const barY = (750 / 1126) * targetW;
                const grad = fgCtx.createLinearGradient(0, barY, 0, barY + barHeight);
                const rgb = hexToRgb(finalGradientColor);
                const colorStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}`;
                grad.addColorStop(0, `${colorStr}, 0)`);
                grad.addColorStop(0.1, `${colorStr}, 1)`);
                grad.addColorStop(0.3, `${colorStr}, 1)`);
                grad.addColorStop(1, `${colorStr}, 0)`);
                fgCtx.fillStyle = grad;
                fgCtx.fillRect(0, barY, targetW, barHeight);

                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = targetW; iconCanvas.height = targetH;
                const iconCtx = iconCanvas.getContext('2d')!;
                iconCtx.fillStyle = baseColor; iconCtx.fillRect(0, 0, targetW, targetH);
                iconCtx.globalCompositeOperation = 'destination-in';
                iconCtx.drawImage(iconMask, 0, 0, targetW, targetH);
                fgCtx.drawImage(iconCanvas, 0, 0);

                fgCtx.drawImage(bg1, 0, 0, targetW, targetH);
            }
        } else {
            videoRect = {x:0, y:0, w:targetW, h:targetH};
        }
        if (showBadge && badgeImg) {
            const bH = (showMask && isImmersiveFocal) ? 2436 : ((showMask && !isWink) ? 900 : targetH);
            drawImageContain(fgCtx, badgeImg, 0, 0, targetW, bH, 'top');
        }

    } else if (isHotRecommend) {
        if (showMask) {
            if (maskImg) bgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
            videoRect = { x: Math.round(0.6287 * targetW), y: Math.round(0.7302 * targetH), w: Math.round(0.2557 * targetW), h: Math.round(0.1576 * targetH) };
            if (showBadge && badgeImg) fgCtx.drawImage(badgeImg, videoRect.x, videoRect.y, videoRect.w, videoRect.h);
        } else {
            videoRect = {x:0, y:0, w:720, h:960};
            if (showBadge && badgeImg) drawImageContain(fgCtx, badgeImg, 0, 0, targetW, targetH, 'top');
        }

    } else if (asset.category === '开屏') {
        const scale = Math.min(targetW / vw, targetH / vh);
        videoRect = { w: vw * scale, h: vh * scale, x: 0, y: 0 };
        videoRect.x = (targetW - videoRect.w) / 2;
        videoRect.y = showMask ? 0 : (targetH - videoRect.h) / 2;

        if (maskImg) fgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
        if (cropImg) {
            const cScale = Math.min(targetW / cropImg.naturalWidth, targetH / cropImg.naturalHeight);
            const cdw = cropImg.naturalWidth * cScale; const cdh = cropImg.naturalHeight * cScale;
            fgCtx.drawImage(cropImg, (targetW - cdw) / 2, (targetH - cdh) / 2, cdw, cdh);
        }

        if (showMask) {
            const isUpDownSliding = asset.templateName === '上下滑动开屏';
            const isTwistOpening = asset.templateName === '扭动开屏';
            const isNonFullscreenSplash = asset.templateName.includes('非全屏');
            let fontSize = 42;
            if (isUpDownSliding || isNonFullscreenSplash) fontSize = 58; else if (isTwistOpening) fontSize = 36;
            let bottomOffset = targetH * 0.0897;
            if (isNonFullscreenSplash) bottomOffset = 610; else if (isUpDownSliding) bottomOffset = 285; else if (isTwistOpening) bottomOffset = 292;
            
            if (asset.id.includes('mt-s-2')) bottomOffset += 2;
            else if (asset.id.includes('mt-s-1') || asset.id.includes('mt-s-3') || asset.id.includes('mt-s-4')) bottomOffset -= 2;

            fgCtx.fillStyle = '#FFFFFF';
            fgCtx.textAlign = 'center'; fgCtx.textBaseline = 'bottom';
            if ('letterSpacing' in fgCtx) { (fgCtx as any).letterSpacing = `${0.1 * fontSize}px`; }
            fgCtx.font = `bold ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
            fgCtx.fillText(asset.splashText || config.splashText, targetW / 2, targetH - bottomOffset);
        }
    } else if (isHotSearch || isTopicBg || isTopicBanner || isPopup) {
        if (showMask && maskImg) {
            if (isTopicBg) {
                videoRect = { x: 0, y: 0, w: 1126, h: 640 };
                if (showBadge && badgeImg) drawImageContain(fgCtx, badgeImg, videoRect.x, videoRect.y, videoRect.w, videoRect.h, 'top');
                fgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
            } else if (isHomePopup || isScorePopup) {
                bgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
                if (isScorePopup) videoRect = { x: 83, y: 498, w: 960, h: 1440 };
                else videoRect = { x: 83, y: 738, w: 960, h: 960 };
            } else {
                bgCtx.drawImage(maskImg, 0, 0, targetW, targetH);
                videoRect = { x: 0, y: 0, w: targetW, h: targetH };
                if (isHotSearch) videoRect = { x: 168, y: 1293, w: 156, h: 156 };
                if (showBadge && badgeImg) drawImageContain(fgCtx, badgeImg, videoRect.x, videoRect.y, videoRect.w, videoRect.h, 'top');
            }

            if (isScorePopup && asset.splashText) {
                fgCtx.save();
                fgCtx.fillStyle = '#FFFFFF';
                fgCtx.textAlign = 'center'; fgCtx.textBaseline = 'bottom';
                fgCtx.font = `normal 40px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
                fgCtx.fillText(asset.splashText, targetW / 2, targetH - 188);
                fgCtx.restore();
            }
            const splashText = asset.splashText || config.splashText;
            if (isHotSearch && splashText) {
                fgCtx.save();
                fgCtx.fillStyle = '#000000';
                fgCtx.textAlign = 'left'; fgCtx.textBaseline = 'top';
                fgCtx.font = `500 40px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif`;
                fgCtx.fillText(splashText, Math.round(targetW * 0.3108), Math.round(targetH * 0.5419));
                fgCtx.restore();
            }
        } else {
            videoRect = { x: 0, y: 0, w: targetW, h: targetH };
            if (showBadge && badgeImg) drawImageContain(fgCtx, badgeImg, videoRect.x, videoRect.y, videoRect.w, videoRect.h, 'top');
        }
    } else if (isRecipeContent) {
        if (maskImg) bgCtx.drawImage(maskImg, 0, 0, 1126, 2436);
        videoRect = { x: 46, y: 1489, w: 506, h: 675 };
        if (badgeImg && showBadge) fgCtx.drawImage(badgeImg, videoRect.x, videoRect.y, videoRect.w, videoRect.h);
    } else {
        videoRect = { x:0, y:0, w: vw, h: vh };
        targetW = vw; targetH = vh;
    }

    const toBlob = (c: HTMLCanvasElement): Promise<Blob|null> => new Promise(res => {
        // If entirely empty (or practically we just send PNG regardless to Backend, transparent handles it)
        c.toBlob(blob => res(blob), 'image/png');
    });

    const bgBlob = await toBlob(bgCanvas);
    const fgBlob = await toBlob(fgCanvas);

    return { bgBlob, fgBlob, videoRect, targetW, targetH };
}
