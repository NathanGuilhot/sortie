import { CLIP_INPUT_SIZE, normalizeVector } from 'shared';
import sharp from 'sharp';
import { dynamicImport } from './dynamic-import';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const FETCH_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${ms}ms (check network connectivity to huggingface.co)`,
          ),
        ),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export class ClipEmbedder {
  /* eslint-disable @typescript-eslint/no-explicit-any -- dynamic import from @xenova/transformers */
  private visionModel: any = null;
  private textModel: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private transformersModule: any = null;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly cacheDir?: string) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.doInitialize().catch((err) => {
      this.initializePromise = null;
      throw err;
    });
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    const transformers =
      await dynamicImport<typeof import('@xenova/transformers')>('@xenova/transformers');
    this.transformersModule = transformers;

    if (this.cacheDir) {
      transformers.env.cacheDir = this.cacheDir;
    }

    const {
      AutoProcessor,
      CLIPVisionModelWithProjection,
      CLIPTextModelWithProjection,
      AutoTokenizer,
    } = transformers;

    this.tokenizer = await withTimeout(
      AutoTokenizer.from_pretrained(MODEL_ID),
      FETCH_TIMEOUT_MS,
      'CLIP tokenizer load',
    );
    this.processor = await withTimeout(
      AutoProcessor.from_pretrained(MODEL_ID),
      FETCH_TIMEOUT_MS,
      'CLIP processor load',
    );
    this.visionModel = await withTimeout(
      CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { quantized: true }),
      FETCH_TIMEOUT_MS,
      'CLIP vision model load',
    );
    this.textModel = await withTimeout(
      CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { quantized: true }),
      FETCH_TIMEOUT_MS,
      'CLIP text model load',
    );

    this.isInitialized = true;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  private async preprocessImage(input: string | Buffer): Promise<unknown> {
    const image = await sharp(input)
      .resize(CLIP_INPUT_SIZE, CLIP_INPUT_SIZE, { fit: 'cover' })
      .toFormat('png')
      .toBuffer();
    const { RawImage } = this.transformersModule;
    return await RawImage.fromBlob(new Blob([Uint8Array.from(image)], { type: 'image/png' }));
  }

  async embedImage(input: string | Buffer): Promise<number[]> {
    await this.initialize();
    try {
      const image = await this.preprocessImage(input);
      const imageInputs = await this.processor(image);
      const { image_embeds } = await this.visionModel(imageInputs);
      const embedding = Array.from(image_embeds.data as Float32Array);
      return normalizeVector(embedding);
    } catch (error) {
      const label = typeof input === 'string' ? input : `<${input.byteLength} bytes>`;
      throw new Error(
        `Image embedding failed for ${label}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
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
      throw new Error(
        `Text embedding failed for "${text}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}
