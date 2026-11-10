import { createHash } from 'crypto';
import sharpModule = require('sharp');
import type { SharpConstructor } from 'sharp';
import {
  MAX_SCAN_INPUT_DIMENSION,
  MAX_SCAN_INPUT_PIXELS,
  SCAN_AI_JPEG_QUALITY,
  SCAN_AI_MAX_DIMENSION,
} from './constants';
import { InvalidScanImageError } from './errors';
import type { ProcessedScanImage, ScanImageProcessor } from './types';

const sharp = sharpModule as unknown as SharpConstructor;

export class SharpScanImageProcessor implements ScanImageProcessor {
  async process(buffer: Buffer): Promise<ProcessedScanImage> {
    try {
      const image = sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: MAX_SCAN_INPUT_PIXELS,
      });
      const metadata = await image.metadata();
      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp', 'heif'].includes(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        !isScanImageDimensionsAllowed(metadata.width, metadata.height)
      ) {
        throw new InvalidScanImageError();
      }

      const processed = await image
        .rotate()
        .resize(SCAN_AI_MAX_DIMENSION, SCAN_AI_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: SCAN_AI_JPEG_QUALITY })
        .toBuffer();

      return {
        buffer: processed,
        perceptualHash: await generatePerceptualHash(processed),
      };
    } catch (error) {
      if (error instanceof InvalidScanImageError) throw error;
      throw new InvalidScanImageError();
    }
  }
}

export function isScanImageDimensionsAllowed(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_SCAN_INPUT_DIMENSION &&
    height <= MAX_SCAN_INPUT_DIMENSION &&
    width * height <= MAX_SCAN_INPUT_PIXELS
  );
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function generatePerceptualHash(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  const pixels = Array.from(resized);
  const average = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
  const bits = pixels.map((pixel) => (pixel >= average ? '1' : '0')).join('');
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}
