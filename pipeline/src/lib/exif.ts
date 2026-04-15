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
    // Extract EXIF metadata using exifr
    const exif = await exifr.parse(imagePath, {
      // Request specific fields we need
      tiff: true,
      exif: true,
      gps: true,
      interop: false,
      translateValues: true,
    });

    // Get image dimensions using sharp
    const metadata = await sharp(imagePath).metadata();
    
    // Parse GPS coordinates if available
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (exif?.latitude && exif?.longitude) {
      latitude = exif.latitude;
      longitude = exif.longitude;
    } else if (exif?.GPSLatitude && exif?.GPSLongitude) {
      // Some formats store GPS differently
      latitude = exif.GPSLatitude;
      longitude = exif.GPSLongitude;
    }

    // Parse capture date
    let capturedAt: Date | null = null;
    if (exif?.DateTimeOriginal) {
      capturedAt = new Date(exif.DateTimeOriginal);
    } else if (exif?.CreateDate) {
      capturedAt = new Date(exif.CreateDate);
    } else if (exif?.ModifyDate) {
      capturedAt = new Date(exif.ModifyDate);
    }

    // Parse camera info
    const cameraMake = exif?.Make || exif?.make || null;
    const cameraModel = exif?.Model || exif?.model || null;
    
    // Parse exposure settings
    const aperture = exif?.FNumber || exif?.ApertureValue || exif?.fNumber || null;
    const iso = exif?.ISO || exif?.ISOSpeedRatings || null;
    
    // Parse exposure time (could be fraction or decimal)
    let exposureTime: string | null = null;
    if (exif?.ExposureTime) {
      if (typeof exif.ExposureTime === 'number') {
        if (exif.ExposureTime < 1) {
          exposureTime = `1/${Math.round(1 / exif.ExposureTime)}`;
        } else {
          exposureTime = `${exif.ExposureTime}`;
        }
      } else {
        exposureTime = exif.ExposureTime.toString();
      }
    } else if (exif?.ShutterSpeedValue) {
      exposureTime = exif.ShutterSpeedValue.toString();
    }
    
    // Parse focal length (could be string with "mm" or number)
    let focalLength: number | null = null;
    if (exif?.FocalLength) {
      if (typeof exif.FocalLength === 'string') {
        const match = exif.FocalLength.match(/(\d+(?:\.\d+)?)/);
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
      width: metadata.width || null,
      height: metadata.height || null,
      cameraMake,
      cameraModel,
      aperture: aperture ? parseFloat(aperture.toString()) : null,
      exposureTime,
      iso,
      focalLength,
    };
  } catch (error) {
    console.warn(`Failed to extract EXIF from ${imagePath}:`, error);
    // Fallback to just getting dimensions
    try {
      const metadata = await sharp(imagePath).metadata();
      return {
        capturedAt: null,
        latitude: null,
        longitude: null,
        width: metadata.width || null,
        height: metadata.height || null,
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