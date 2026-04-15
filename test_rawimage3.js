import { RawImage } from '@xenova/transformers';
// Create a dummy buffer (1x1 pixel RGBA)
const buffer = new Uint8Array([255, 0, 0, 255]);
console.log('RawImage constructor length:', RawImage.length);
try {
  const img = new RawImage(buffer, 1, 1);
  console.log('Created with buffer:', img);
} catch(e) { console.log('Error with buffer:', e.message); }
// Maybe fromBuffer is a static method after all? Let's log all properties
console.log('All properties:', Object.getOwnPropertyNames(RawImage).filter(k => typeof RawImage[k] === 'function'));