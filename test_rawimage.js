import { RawImage } from '@xenova/transformers';
console.log('RawImage static methods:', Object.keys(RawImage).filter(k => typeof RawImage[k] === 'function'));
console.log('RawImage.from?', 'from' in RawImage);
console.log('RawImage.fromBuffer?', 'fromBuffer' in RawImage);