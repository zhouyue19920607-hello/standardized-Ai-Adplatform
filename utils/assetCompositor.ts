import { AdAsset, AdConfig } from '../types';
import { ASSETS_URL, compositeVideo } from '../services/api';
import { getDerivedGradientColor, hexToRgb } from './colorUtils';
import { exportVideoElements } from './videoCompositor';

/**
 * Helper to load image with cache-busting
 */
const loadImg = (src: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        // NOTE: blob: 和 data: URL 不需要 crossOrigin，设置后浏览器反而会拒绝加载（无 CORS 头）
        // 只对远程 HTTP URL 设置 crossOrigin=anonymous 以允许 canvas 导出
        const isLocalUrl = src.startsWith('data:') || src.startsWith('blob:');
        if (!isLocalUrl) {
            img.crossOrigin = "anonymous";
        }
        const separator = src.includes('?') ? '&' : '?';
        const finalSrc = isLocalUrl ? src : `${src}${separator}t=${Date.now()}`;
        img.src = finalSrc;
        img.onload = () => resolve(img);
        // NOTE: 加载失败时返回 null 而非 reject，防止单图失败中断整个合成流程
        img.onerror = (e) => {
            console.error('[Compositor] Image load failed:', finalSrc, e);
            resolve(null);
        };
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

const drawImageRounded = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius: number, fit: 'cover' | 'contain' = 'cover', align: 'center' | 'top' = 'center') => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.clip();
    if (fit === 'cover') {
        drawImageCover(ctx, img, x, y, w, h);
    } else {
        drawImageContain(ctx, img, x, y, w, h, align);
    }
    ctx.restore();
};

const getImageTargetSizeBytes = (asset: AdAsset): number => {
    if (asset.category === '开屏') return 300 * 1024;
    if (asset.category === '焦点视窗' && asset.app === '美图秀秀') return 250 * 1024;
    if (asset.category === '焦点视窗') return 250 * 1024;
    return 500 * 1024;
};

const getVideoLimitMB = (asset: AdAsset): number | undefined => {
    if (asset.category === '焦点视窗') return 10;
    if (asset.category === '开屏') return 4;
    if (asset.id.includes('mt-p-1') || asset.id.includes('mt-ib-1')) return 4;
    return undefined;
};

const getVideoDimensions = (asset: AdAsset) => {
    const dimensions = { w: 1080, h: 1920 };
    const match = asset.dimensions?.match(/(\d+)\s*x\s*(\d+)/i);
    if (match) {
        dimensions.w = parseInt(match[1], 10);
        dimensions.h = parseInt(match[2], 10);
    }
    return dimensions;
};

const hasVideoOverlay = (asset: AdAsset, config: AdConfig): boolean => {
    const showBadge = (config as any).showBadge !== undefined ? Boolean((config as any).showBadge) : Boolean(asset.showBadge);
    return Boolean(config.showMask) ||
        Boolean((config as any).showCrop && asset.cropOverlayUrl) ||
        Boolean(showBadge && asset.badgeOverlayUrl) ||
        Boolean(asset.category === '开屏' && config.showMask && (asset.splashText || config.splashText)) ||
        Boolean(asset.id.includes('mt-p-1') && asset.splashText);
};

/**
 * Intelligent asset compositor that replicates the PreviewGrid download logic.
 * Returns a Blob (JPEG/MP4) of the composited result.
 */
export async function compositeAsset(asset: AdAsset, config: AdConfig): Promise<Blob> {
    if (asset.type.startsWith('video')) {
        const resp = await fetch(asset.url);
        const videoBlob = await resp.blob();
        const maxSizeMB = getVideoLimitMB(asset);
        const maxSizeBytes = maxSizeMB ? maxSizeMB * 1024 * 1024 : undefined;
        const needsVideoComposite = hasVideoOverlay(asset, config);

        if (!needsVideoComposite && (!maxSizeBytes || videoBlob.size <= maxSizeBytes)) {
            return videoBlob;
        }

        const params = await exportVideoElements(asset, config, getVideoDimensions(asset));
        const result = await compositeVideo(videoBlob, params.bgBlob, params.fgBlob, {
            targetW: params.targetW,
            targetH: params.targetH,
            videoRect: params.videoRect,
            ...(maxSizeMB ? { maxSizeMB } : {}),
            ...(asset.id.includes('mt-p-1') ? { maxDurationSec: 5 } : {})
        });

        if (!result.ok || !result.url) {
            throw new Error(result.error || 'Video composition failed');
        }

        const outputResp = await fetch(`${ASSETS_URL}${result.url}`);
        if (!outputResp.ok) {
            throw new Error(`视频结果下载失败：${outputResp.status}`);
        }
        const outputBlob = await outputResp.blob();
        if (maxSizeBytes && outputBlob.size > maxSizeBytes) {
            throw new Error(`视频导出后仍超过 ${maxSizeMB}MB，请使用更短的视频素材`);
        }
        return outputBlob;
    }

    const isHotRecommend = asset.id.includes('mt-ib-1');
    const isHotSearch = asset.id.includes('mt-ib-2');
    const isTopicBg = asset.id.includes('mt-ib-3');
    const isTopicBanner = asset.id.includes('mt-ib-4');
    const isPopup = asset.category === '弹窗';
    const isScorePopup = isPopup && asset.id.includes('mt-p-1');
    const isHomePopup = isPopup && (asset.id.includes('mt-p-2') || asset.id.includes('mt-p-3'));
    const isStandardFocal = asset.category === '焦点视窗' && !isHotRecommend && !isTopicBg;
    const isImmersiveFocal = asset.templateName.includes('沉浸式');
    // NOTE: 一键配方图文：图片 -> 蒙版 -> 角标 层序
    const isRecipeContent = asset.id.includes('mt-fe-1');
    const isMts1 = asset.id.includes('mt-s-1');

    // Check if we need compositing (usually when mask is shown or badge is enabled)
    const showMask = config.showMask;
    // NOTE: Priority: explicit config (from individual download) > asset state (from batch) > default false
    const showBadge = (config as any).showBadge !== undefined ? (config as any).showBadge : (asset.showBadge ?? false);

    const needsComposite = showMask ||
        (asset.category === '焦点视窗' && showBadge && asset.badgeOverlayUrl) ||
        (isHotRecommend && showBadge && asset.badgeOverlayUrl) ||
        (isHotSearch && showBadge && asset.badgeOverlayUrl) ||
        (isTopicBg && showBadge && asset.badgeOverlayUrl) ||
        (isTopicBanner && showBadge && asset.badgeOverlayUrl) ||
        (isPopup && showBadge && asset.badgeOverlayUrl) ||
        (isRecipeContent && showBadge && asset.badgeOverlayUrl);

    // DEBUG: 打印关键变量帮助排查
    console.log(`[Compositor] id=${asset.id} category=${asset.category} isPopup=${isPopup} isScorePopup=${isScorePopup} showMask=${showMask} needsComposite=${needsComposite} maskUrl=${asset.maskUrl} url.slice0-20=${asset.url?.slice(0, 20)}`);

    // NOTE: 开屏/焦点视窗静态图需要控制导出体积；若原图已达标且没有叠层，则直接下载原图，不再压缩。
    const shouldForceSizeLimit = asset.category === '开屏' || asset.category === '焦点视窗';
    // NOTE: mt-ib-1 always goes through compositor to guarantee 720×960 canvas output
    if (!needsComposite && !isMts1 && !isHotRecommend && !shouldForceSizeLimit) {
        console.log('[Compositor] EARLY RETURN - fetching asset.url directly');
        const resp = await fetch(asset.url);
        return await resp.blob();
    }
    if (!needsComposite && !isMts1 && !isHotRecommend && shouldForceSizeLimit) {
        const resp = await fetch(asset.url);
        const blob = await resp.blob();
        const targetSizeBytes = getImageTargetSizeBytes(asset);
        if (blob.size <= targetSizeBytes) {
            console.log(`[Compositor] EARLY RETURN - original ${asset.category} image under ${(targetSizeBytes / 1024).toFixed(0)}KB`);
            return blob;
        }
    }

    const categoryRequiresJpeg = isMts1 || asset.category === '开屏' || asset.category === '焦点视窗';
    const isPng = categoryRequiresJpeg ? false : (asset.type === 'image/png' || asset.url.toLowerCase().endsWith('.png'));
    const outputMime = isPng ? 'image/png' : 'image/jpeg';

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

        if (showMask && asset.maskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.maskUrl}`));
        } else {
            loadList.push(Promise.resolve(null));
        }

        if (showBadge && asset.badgeOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`));
        }

        const loadedImages = await Promise.all(loadList);
        const mainImg = loadedImages[0];
        const bg1 = loadedImages[1];
        const bg2 = loadedImages[2];
        const iconMask = loadedImages[3];
        const maskImg = loadedImages[4];
        const badgeImg = loadedImages.length > 5 ? loadedImages[5] : null;

        const isWink = asset.app === 'wink';
        const isMeiyan = asset.app === '美颜';
        // Correct target dimensions
        const targetW = showMask ? 1126 : (isImmersiveFocal ? 1440 : (isMeiyan ? 1284 : 1126));
        const targetH = showMask ? ((isWink || isMeiyan) ? 2438 : 2436) : (isImmersiveFocal ? 2340 : (isWink ? 1410 : (isMeiyan ? 1128 : 900)));

        canvas.width = targetW;
        canvas.height = targetH;

        if (!isPng) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        let focalContentRect = { x: 0, y: 0, w: targetW, h: targetH };

        if (showMask) {
            const dw = targetW;
            const dh = (mainImg.naturalHeight / mainImg.naturalWidth) * targetW;
            const baseColor = asset.aiExtractedColor || '#FF00FF';
            const finalGradientColor = asset.gradientColor || getDerivedGradientColor(baseColor);
            const contentY = isMeiyan ? -97 : 0;
            focalContentRect = { x: 0, y: contentY, w: dw, h: dh };

            if ((isWink || isMeiyan) && maskImg) {
                // Meiyan & Wink Focal Window: Image FIRST, then Mask (on top)
                ctx.drawImage(mainImg, 0, contentY, dw, dh);
                ctx.drawImage(maskImg, 0, 0, targetW, targetH);
            } else if (isImmersiveFocal) {
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
            if (showMask && isMeiyan && maskImg) {
                ctx.drawImage(badgeImg, focalContentRect.x, focalContentRect.y, focalContentRect.w, focalContentRect.h);
            } else if (showMask && isImmersiveFocal) {
                // 对于沉浸式，角标应与主图对齐 (主图是 dw, dh 绘制)
                // 沉浸式焦点视窗的角标是 object-cover object-top
                drawImageCover(ctx, badgeImg, 0, 0, targetW, (badgeImg.naturalHeight / badgeImg.naturalWidth) * targetW);
            } else {
                const bH = (showMask && isImmersiveFocal) ? 2436 : ((showMask && !isWink) ? 900 : targetH);
                drawImageContain(ctx, badgeImg, 0, 0, targetW, bH, 'top');
            }
        }

    } else if (isHotRecommend) {
        // NOTE: mt-ib-1 热推第三位 - 双模式合成：
        //   - showMask=true  → 1126×2436 全屏，主图放到小格子位置，叠全屏遮罩
        //   - showMask=false → 720×960 主图铺满（纯素材导出）
        const loadList: Promise<HTMLImageElement | null>[] = [loadImg(asset.url)];
        if (showMask && asset.maskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.maskUrl}`));
        } else {
            loadList.push(Promise.resolve(null));
        }
        if (showBadge && asset.badgeOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`));
        } else {
            loadList.push(Promise.resolve(null));
        }

        const [mainImg, maskImg, badgeImg] = await Promise.all(loadList);

        if (showMask && maskImg) {
            // NOTE: 开遮罩 → 1126×2436 全屏合成
            // 图片区域位置与 PreviewGrid 中完全一致：
            //   left: 62.87%, top: 73.02%, width: 25.57%, height: 15.76%
            const fullW = 1126;
            const fullH = 2436;
            canvas.width = fullW;
            canvas.height = fullH;

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, fullW, fullH);

            // 计算主图在全屏中的像素坐标
            const imgX = Math.round(0.6287 * fullW);                // ≈ 708px
            const imgY = Math.round(0.7302 * fullH);                // ≈ 1779px
            const imgW = Math.round(0.2557 * fullW);                // ≈ 288px
            const imgH = Math.round(0.1576 * fullH);                // ≈ 384px

            // NOTE: For Zoom templates like mt-ib-1, mask is the background (z-0 in preview)
            // and the ad image is the foreground (z-10 in preview).
            // So we MUST draw mask FIRST, then image on top.
            ctx.drawImage(maskImg, 0, 0, fullW, fullH);

            // 主图按 cover + 10px 圆角绘制到对应格子
            drawImageRounded(ctx, mainImg!, imgX, imgY, imgW, imgH, 10, 'cover');

            // 角标（可选，同样按照全屏坐标叠加）
            if (showBadge && badgeImg) {
                ctx.drawImage(badgeImg, imgX, imgY, imgW, imgH);
            }
        } else {
            // NOTE: 不开遮罩 → 720×960 主图铺满（纯素材导出）
            const targetW = 720;
            const targetH = 960;
            canvas.width = targetW;
            canvas.height = targetH;

            if (!isPng) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetW, targetH);
            }

            drawImageRounded(ctx, mainImg!, 0, 0, targetW, targetH, 10, 'cover');

            if (showBadge && badgeImg) {
                drawImageContain(ctx, badgeImg, 0, 0, targetW, targetH, 'top');
            }
        }

    } else if (isHotSearch || isTopicBg || isTopicBanner || isPopup) {
        // Shared logic for standard 1126x2436 background based templates
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

        // NOTE: 若主图加载失败，直接返回后端原图（保证能下载）
        if (!mainImg) {
            console.warn('[Compositor] mainImg failed to load, falling back to original asset URL');
            const resp = await fetch(asset.url);
            return await resp.blob();
        }

        const targetW = 1126;
        const targetH = 2436;
        canvas.width = targetW;
        canvas.height = targetH;

        if (!isPng) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
        }

        // Define region
        let rect = { x: 0, y: 0, w: targetW, h: targetH, r: 0, fit: 'cover' as 'cover' | 'contain' };
        if (isHotSearch) rect = { x: 168, y: 1293, w: 156, h: 156, r: 10, fit: 'cover' };
        else if (isScorePopup) rect = { x: 83, y: 498, w: 960, h: 1440, r: 10, fit: 'cover' };
        else if (isHomePopup) rect = { x: 83, y: 738, w: 960, h: 960, r: 0, fit: 'contain' };
        else if (isTopicBanner) rect = { x: 48, y: 980, w: 1030, h: 288, r: 5, fit: 'cover' };
        else if (isTopicBg) rect = { x: 0, y: 0, w: 1126, h: 640, r: 0, fit: 'cover' };

        // Even if maskImg failed to load, we maintain the canvas size for these templates
        if (showMask) {
            if (maskImg) {
                if (isTopicBg) {
                    // Topic Background: Image -> Badge -> Mask
                    if (rect.r > 0) drawImageRounded(ctx, mainImg, rect.x, rect.y, rect.w, rect.h, rect.r, rect.fit);
                    else if (rect.fit === 'cover') drawImageCover(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                    else drawImageContain(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);

                    if (showBadge && badgeImg) drawImageContain(ctx, badgeImg, rect.x, rect.y, rect.w, rect.h, 'top');
                    ctx.drawImage(maskImg, 0, 0, targetW, targetH);
                } else if (isHomePopup || isScorePopup) {
                    // NOTE: Popup Templates: Draw full-screen Mask as background first, then overlay Image on top
                    ctx.drawImage(maskImg, 0, 0, targetW, targetH);
                    if (rect.r > 0) drawImageRounded(ctx, mainImg, rect.x, rect.y, rect.w, rect.h, rect.r, rect.fit);
                    else if (rect.fit === 'cover') drawImageCover(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                    else drawImageContain(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                } else {
                    // Normal: Mask → Image → Badge
                    ctx.drawImage(maskImg, 0, 0, targetW, targetH);
                    if (rect.r > 0) drawImageRounded(ctx, mainImg, rect.x, rect.y, rect.w, rect.h, rect.r, rect.fit);
                    else if (rect.fit === 'cover') drawImageCover(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                    else drawImageContain(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                    if (showBadge && badgeImg) drawImageContain(ctx, badgeImg, rect.x, rect.y, rect.w, rect.h, 'top');
                }
            } else {
                // maskImg is null (failed to load), but we still draw the main image in the correct constrained region!
                console.warn('[Compositor] maskImg was null, drawing fallback structure for', asset.id);
                if (rect.r > 0) drawImageRounded(ctx, mainImg, rect.x, rect.y, rect.w, rect.h, rect.r, rect.fit);
                else if (rect.fit === 'cover') drawImageCover(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                else drawImageContain(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
                if (showBadge && badgeImg) drawImageContain(ctx, badgeImg, rect.x, rect.y, rect.w, rect.h, 'top');
            }

            // Add Score Popup Text (mt-p-1)
            if (isScorePopup && asset.splashText) {
                ctx.save();
                ctx.fillStyle = '#FFFFFF';
                // Use a visible color if the mask background failed to load (since it would otherwise be white on white)
                if (!maskImg && !isPng) ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const fontSize = 40; // 30pt is approx 40px
                ctx.font = `normal ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
                ctx.fillText(asset.splashText, targetW / 2, targetH - 188);
                ctx.restore();
            }

            // Add Hot Search Text (mt-ib-2)
            const splashText = asset.splashText || config.splashText;
            if (isHotSearch && splashText) {
                ctx.save();
                // 对应 PreviewGrid 中的 left: '31.08%', top: '54.19%', fontSize: '1.64cqh' (≈ 40px)
                const textX = Math.round(targetW * 0.3108);
                const textY = Math.round(targetH * 0.5419);
                const textFontSize = 40;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = `500 ${textFontSize}px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif`;
                ctx.fillText(splashText, textX, textY);
                ctx.restore();
            }
        } else {
            // No mask requested for this template (though needsComposite shouldn't really bring us here)
            if (rect.r > 0) drawImageRounded(ctx, mainImg, rect.x, rect.y, rect.w, rect.h, rect.r, rect.fit);
            else if (rect.fit === 'cover') drawImageCover(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
            else drawImageContain(ctx, mainImg, rect.x, rect.y, rect.w, rect.h);
            if (showBadge && badgeImg) drawImageContain(ctx, badgeImg, rect.x, rect.y, rect.w, rect.h, 'top');
        }

    } else if (asset.category === '开屏') {
        const isNonFullscreenSplash = asset.id.includes('mt-s-5') || asset.id.includes('mt-s-6') || asset.templateName.includes('非全屏');
        // NOTE: 三平台开屏 — 根据用户选中的样式选择对应平台蒙版
        const activePlatform = asset.activeSplashStyle ?? 'meitu';
        const platformMaskUrl = asset.splashPlatformMasks
            ? (asset.splashPlatformMasks[activePlatform] ?? asset.maskUrl)
            : asset.maskUrl;

        // Load main image, mask, and potential crop overlay
        const loadList = [loadImg(asset.url)];

        if (showMask && platformMaskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${platformMaskUrl}`));
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

        if (!isPng) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
        }

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
            const isUpDownSliding = asset.templateName.includes('上下滑动') && !asset.templateName.includes('非全屏');
            const isTwistOpening = asset.templateName === '扭动全屏';

            let fontSize = 42;
            if (isUpDownSliding || isNonFullscreenSplash) fontSize = 58;
            else if (isTwistOpening) fontSize = 36; // 1.54% of 2340

            let bottomOffset = targetH * 0.0897; // 209.898
            if (isNonFullscreenSplash) bottomOffset = 610;
            else if (isUpDownSliding) bottomOffset = 285;
            else if (isTwistOpening) bottomOffset = 292; // 12.48% of 2340

            if (asset.id.includes('mt-s-2')) {
                bottomOffset += 2; // 向上移动
            } else if (asset.id.includes('mt-s-1') || asset.id.includes('mt-s-3') || asset.id.includes('mt-s-4')) {
                bottomOffset -= 2; // 向下移动
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = `${0.1 * fontSize}px`; }
            ctx.font = `bold ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
            ctx.fillText(asset.splashText || config.splashText, targetW / 2, targetH - bottomOffset);
        }
    } else if (isRecipeContent) {
        // 一键配方图文: 图片 -> 蒙版 -> 角标
        const loadList: Promise<HTMLImageElement | null>[] = [loadImg(asset.url)];
        if (showMask && asset.maskUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.maskUrl}`));
        } else {
            loadList.push(Promise.resolve(null));
        }
        if (showBadge && asset.badgeOverlayUrl) {
            loadList.push(loadImg(`${ASSETS_URL}${asset.badgeOverlayUrl}`));
        } else {
            loadList.push(Promise.resolve(null));
        }

        const [mainImg, maskImg, badgeImg] = await Promise.all(loadList);
        canvas.width = 1126;
        canvas.height = 2436;

        if (!isPng) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // 计算定位 (基于 1126x2436)
        const dw = 506; // 1034 * 0.49
        const dh = 675; // 1378 * 0.49
        const dx = 46;
        const dy = 1489; // 2436 - 675 - 272

        if (maskImg) {
            ctx.drawImage(maskImg, 0, 0, 1126, 2436);
        }

        // Layer 2: 用户图片（盖在蒙版上方）带 10px 圆角
        drawImageRounded(ctx, mainImg!, dx, dy, dw, dh, 10, 'cover');

        // Layer 3: 角标（最上层）
        if (badgeImg) {
            ctx.drawImage(badgeImg, dx, dy, dw, dh);
        }

    } else {
        const img = await loadImg(asset.url);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
    }

    // 动态调整目标大小：开屏 300KB；焦点视窗 250KB；其他 500KB。
    const targetSizeBytes = getImageTargetSizeBytes(asset);
    return new Promise((resolve, reject) => {
        let quality = 0.9;

        async function attempt() {
            canvas.toBlob(async (blob) => {
                if (!blob) return reject(new Error('Failed to create blob'));

                if (isPng || blob.size <= targetSizeBytes || quality <= 0.05) {
                    if (!isPng && blob.size > targetSizeBytes) {
                        console.warn(`[Compositor] Warning: Could not compress ${asset.category} under ${targetSizeBytes / 1024}KB. Final size: ${(blob.size / 1024).toFixed(1)}KB`);
                    }
                    resolve(blob);
                } else {
                    quality -= 0.2; // 进一步加快压缩步长
                    attempt();
                }
            }, outputMime, isPng ? undefined : quality);
        }

        attempt();
    });
}
