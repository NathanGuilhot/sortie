import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '..', 'resources', 'models', 'ocr');

// PaddleOCR PP-OCRv4 Chinese+English mobile models, pre-converted to ONNX.
// Chinese recognition covers ~6625 chars (CJK + ASCII + digits + punctuation),
// so this one model handles the bulk of real-world multi-script content.
// Detection is language-agnostic.
//
// The recognition model can be swapped later for japanese / korean / arabic /
// cyrillic / devanagari equivalents without changing the pipeline.
const FILES = [
  {
    name: 'detection.onnx',
    url: 'https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx',
    minBytes: 3_000_000,
  },
  {
    name: 'recognition.onnx',
    url: 'https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx',
    minBytes: 5_000_000,
  },
  {
    name: 'dictionary.txt',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt',
    minBytes: 10_000,
  },
];

fs.mkdirSync(outDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const doRequest = (u, redirects = 0) => {
      if (redirects > 5) return reject(new Error(`Too many redirects: ${url}`));
      https
        .get(u, { headers: { 'User-Agent': 'sortie-fetch-ocr-models' } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            const next = new URL(res.headers.location, u).toString();
            doRequest(next, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', (err) => {
            fs.unlink(dest, () => reject(err));
          });
        })
        .on('error', reject);
    };
    doRequest(url);
  });
}

const results = await Promise.all(
  FILES.map(async ({ name, url, minBytes }) => {
    const dest = path.join(outDir, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
      console.log(`[ocr-models] ${name} already present`);
      return false;
    }
    console.log(`[ocr-models] downloading ${name} …`);
    await download(url, dest);
    const size = fs.statSync(dest).size;
    if (size < minBytes) {
      fs.unlinkSync(dest);
      throw new Error(`${name} downloaded too small (${size} bytes): aborting`);
    }
    console.log(`[ocr-models]   → ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return true;
  }),
);

if (!results.some(Boolean)) {
  console.log('[ocr-models] all files present: nothing to do');
}
