import * as transformers from '@xenova/transformers';
console.log('RawImage' in transformers ? transformers.RawImage : 'none');
console.log('Object.keys(transformers):', Object.keys(transformers));
// Check if RawImage is a property of pipeline maybe?
// Let's see if we can create a pipeline and inspect
const pipeline = await transformers.pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
console.log('pipeline created');