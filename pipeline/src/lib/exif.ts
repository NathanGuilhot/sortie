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

function emptyExif(width: number | null = null, height: number | null = null): ExifData {
  return {
    capturedAt: null,
    latitude: null,
    longitude: null,
    width,
    height,
    cameraMake: null,
    cameraModel: null,
    aperture: null,
    exposureTime: null,
    iso: null,
    focalLength: null,
  };
}

async function readDisplayDimensions(
  imagePath: string,
): Promise<{ width: number | null; height: number | null }> {
  const metadata = await sharp(imagePath).metadata();
  // EXIF orientations 5-8 rotate 90°/270°, swapping width/height. Browsers
  // auto-rotate on display; store dimensions matching what the user sees.
  const needsSwap = metadata.orientation && metadata.orientation >= 5;
  return {
    width: needsSwap ? metadata.height || null : metadata.width || null,
    height: needsSwap ? metadata.width || null : metadata.height || null,
  };
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

    const { width, height } = await readDisplayDimensions(imagePath);

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

    const cameraMake: string | null = exif?.Make || null;
    const cameraModel: string | null = exif?.Model || null;
    const aperture: number | null = exif?.FNumber || exif?.ApertureValue || null;
    const iso: number | null = exif?.ISO || exif?.ISOSpeedRatings || null;

    let exposureTime: string | null = null;
    if (exif?.ExposureTime) {
      if (typeof exif.ExposureTime === 'number') {
        exposureTime =
          exif.ExposureTime < 1 ? `1/${Math.round(1 / exif.ExposureTime)}` : `${exif.ExposureTime}`;
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
      aperture,
      exposureTime,
      iso,
      focalLength,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
  } catch (error) {
    console.warn(`Failed to extract EXIF from ${imagePath}:`, error);
    try {
      const { width, height } = await readDisplayDimensions(imagePath);
      return emptyExif(width, height);
    } catch (sharpError) {
      console.error(`Failed to read image ${imagePath}:`, sharpError);
      return emptyExif();
    }
  }
}
