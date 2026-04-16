import exifr from 'exifr';
import sharp from 'sharp';

export interface ExifData {
  capturedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  aperture: number | null;
  exposureTime: string | null;
  iso: number | null;
  focalLength: number | null;
}

export async function extractExif(imagePath: string): Promise<ExifData> {
  try {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
    const exif = await exifr.parse(imagePath, {
      tiff: true,
      exif: true,
      gps: true,
      interop: false,
      translateValues: true,
    });

    const metadata = await sharp(imagePath).metadata();

    // EXIF orientations 5-8 involve a 90°/270° rotation, swapping width/height.
    // sharp returns raw pixel dimensions, but browsers auto-rotate based on EXIF,
    // so we store the display dimensions to match what the browser will render.
    const needsSwap = metadata.orientation && metadata.orientation >= 5;
    const width = needsSwap ? metadata.height || null : metadata.width || null;
    const height = needsSwap ? metadata.width || null : metadata.height || null;

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (exif?.latitude && exif?.longitude) {
      latitude = exif.latitude;
      longitude = exif.longitude;
    } else if (exif?.GPSLatitude && exif?.GPSLongitude) {
      latitude = exif.GPSLatitude;
      longitude = exif.GPSLongitude;
    }

    let capturedAt: Date | null = null;
    if (exif?.DateTimeOriginal) {
      capturedAt = new Date(exif.DateTimeOriginal);
    } else if (exif?.CreateDate) {
      capturedAt = new Date(exif.CreateDate);
    } else if (exif?.ModifyDate) {
      capturedAt = new Date(exif.ModifyDate);
    }

    const cameraMake: string | null = exif?.Make || exif?.make || null;
    const cameraModel: string | null = exif?.Model || exif?.model || null;

    const aperture: number | null = exif?.FNumber || exif?.ApertureValue || exif?.fNumber || null;
    const iso: number | null = exif?.ISO || exif?.ISOSpeedRatings || null;

    let exposureTime: string | null = null;
    if (exif?.ExposureTime) {
      if (typeof exif.ExposureTime === 'number') {
        if (exif.ExposureTime < 1) {
          exposureTime = `1/${Math.round(1 / exif.ExposureTime)}`;
        } else {
          exposureTime = `${exif.ExposureTime}`;
        }
      } else {
        exposureTime = String(exif.ExposureTime);
      }
    } else if (exif?.ShutterSpeedValue) {
      exposureTime = String(exif.ShutterSpeedValue);
    }

    let focalLength: number | null = null;
    if (exif?.FocalLength) {
      if (typeof exif.FocalLength === 'string') {
        const match = (exif.FocalLength as string).match(/(\d+(?:\.\d+)?)/);
        focalLength = match ? parseFloat(match[1]) : null;
      } else if (typeof exif.FocalLength === 'number') {
        focalLength = exif.FocalLength;
      }
    } else if (exif?.FocalLengthIn35mmFilm) {
      focalLength = exif.FocalLengthIn35mmFilm;
    }

    return {
      capturedAt,
      latitude,
      longitude,
      width,
      height,
      cameraMake,
      cameraModel,
      aperture: aperture ? parseFloat(String(aperture)) : null,
      exposureTime,
      iso,
      focalLength,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
  } catch (error) {
    console.warn(`Failed to extract EXIF from ${imagePath}:`, error);
    try {
      const metadata = await sharp(imagePath).metadata();
      const needsSwap = metadata.orientation && metadata.orientation >= 5;
      return {
        capturedAt: null,
        latitude: null,
        longitude: null,
        width: needsSwap ? metadata.height || null : metadata.width || null,
        height: needsSwap ? metadata.width || null : metadata.height || null,
        cameraMake: null,
        cameraModel: null,
        aperture: null,
        exposureTime: null,
        iso: null,
        focalLength: null,
      };
    } catch (sharpError) {
      console.error(`Failed to read image ${imagePath}:`, sharpError);
      return {
        capturedAt: null,
        latitude: null,
        longitude: null,
        width: null,
        height: null,
        cameraMake: null,
        cameraModel: null,
        aperture: null,
        exposureTime: null,
        iso: null,
        focalLength: null,
      };
    }
  }
}
