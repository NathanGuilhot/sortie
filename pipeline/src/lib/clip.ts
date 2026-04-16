import { CLIP_INPUT_SIZE, normalizeVector } from 'shared';
import sharp from 'sharp';

export class ClipEmbedder {
  private visionModel: any = null;
  private textModel: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private transformersModule: any = null;
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as
        <T = unknown>(specifier: string) => Promise<T>;
      const transformers = await dynamicImport<typeof import('@xenova/transformers')>(
        '@xenova/transformers',
      );
      this.transformersModule = transformers;
      const { AutoProcessor, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, AutoTokenizer } = transformers;

      this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32');
      this.processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
      this.visionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', {
        quantized: true,
      });
      this.textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', {
        quantized: true,
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to load CLIP model:', error);
      throw error;
    }
  }

  private async preprocessImage(imagePath: string): Promise<any> {
    const image = await sharp(imagePath)
      .resize(CLIP_INPUT_SIZE, CLIP_INPUT_SIZE, { fit: 'cover' })
      .toFormat('png')
      .toBuffer();
    const { RawImage } = this.transformersModule;
    return await RawImage.fromBlob(new Blob([Uint8Array.from(image)], { type: 'image/png' }));
  }

  async embedImage(imagePath: string): Promise<number[]> {
    await this.initialize();
    try {
      const image = await this.preprocessImage(imagePath);
      const imageInputs = await this.processor(image);
      const { image_embeds } = await this.visionModel(imageInputs);
      const embedding = Array.from(image_embeds.data as Float32Array);
      return normalizeVector(embedding);
    } catch (error) {
      console.error(`Failed to embed image ${imagePath}:`, error);
      throw new Error(`Image embedding failed for ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async embedText(text: string): Promise<number[]> {
    await this.initialize();
    try {
      const prompt = `a photo of ${text}`;
      const textInputs = this.tokenizer(prompt, { padding: true, truncation: true });
      const { text_embeds } = await this.textModel(textInputs);
      const embedding = Array.from(text_embeds.data as Float32Array);
      return normalizeVector(embedding);
    } catch (error) {
      console.error(`Failed to embed text "${text}":`, error);
      throw new Error(`Text embedding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async embedImagesBatch(imagePaths: string[]): Promise<number[][]> {
    await this.initialize();
    const embeddings: number[][] = [];
    for (const path of imagePaths) {
      const embedding = await this.embedImage(path);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}
