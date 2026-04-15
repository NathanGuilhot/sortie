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
  // TODO: implement with exifr and sharp
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