/**
 * 壁纸处理工具：压缩 + 裁切适应横屏竖屏
 */

/** 目标 DPI（压缩后约 200 DPI 级别） */
const TARGET_MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.75;

/**
 * 将上传的图片文件处理为压缩后的 base64 data URI。
 * - 自动缩放到最大 1920px（长边）
 * - JPEG 压缩 quality 0.75
 * - 适配横屏和竖屏（cover 模式由 CSS background-size 处理）
 */
export function processWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请上传图片文件'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // 缩放到最大尺寸
        if (width > TARGET_MAX_DIMENSION || height > TARGET_MAX_DIMENSION) {
          const ratio = Math.min(TARGET_MAX_DIMENSION / width, TARGET_MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 不可用'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
