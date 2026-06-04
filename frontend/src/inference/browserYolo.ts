/**
 * Browser-side YOLO inference using ONNX Runtime Web.
 * Handles model loading, preprocessing, inference, and postprocessing.
 */
import * as ort from 'onnxruntime-web';

let session: ort.InferenceSession | null = null;
let modelInfo: { inputName: string; inputShape: number[]; nc: number } | null = null;

export async function loadModel(url: string, numClasses: number): Promise<void> {
  session = await ort.InferenceSession.create(url, {
    executionProviders: ['webgl', 'wasm'],
  });
  const inputName = session.inputNames[0];
  const inputShape = session.inputNames[0]
    ? (session as any).inputNames[0]?.dims || [1, 3, 640, 640]
    : [1, 3, 640, 640];
  modelInfo = { inputName, inputShape: inputShape as number[], nc: numClasses };
}

export function isModelLoaded(): boolean {
  return session !== null;
}

/**
 * Preprocess a video/canvas element to a normalized tensor.
 */
function preprocess(
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  inputSize: number,
): ort.Tensor {
  // Draw to canvas for resizing
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext('2d')!;

  // Letterbox: scale to fit, pad with gray
  const srcW = 'videoWidth' in source ? source.videoWidth : source.width;
  const srcH = 'videoHeight' in source ? source.videoHeight : source.height;
  const scale = Math.min(inputSize / srcW, inputSize / srcH);
  const dw = (inputSize - srcW * scale) / 2;
  const dh = (inputSize - srcH * scale) / 2;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(source, dw, dh, srcW * scale, srcH * scale);

  // Get pixel data and normalize to float32 NCHW
  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const pixels = imageData.data;
  const nchw = new Float32Array(3 * inputSize * inputSize);

  const area = inputSize * inputSize;
  for (let i = 0; i < area; i++) {
    nchw[i] = pixels[i * 4] / 255.0;           // R
    nchw[area + i] = pixels[i * 4 + 1] / 255.0; // G
    nchw[2 * area + i] = pixels[i * 4 + 2] / 255.0; // B
  }

  return new ort.Tensor('float32', nchw, [1, 3, inputSize, inputSize]);
}

export interface Detection {
  class: string;
  class_id: number;
  confidence: number;
  bbox: number[]; // [x1, y1, x2, y2] normalized 0-1
}

/**
 * Run inference and return detections.
 */
export async function runInference(
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<Detection[]> {
  if (!session || !modelInfo) throw new Error('Model not loaded');

  const { inputName, inputShape, nc } = modelInfo;
  const inputSize = inputShape[2] || 640;

  const tensor = preprocess(source, inputSize);
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName] = tensor;

  const results = await session.run(feeds);
  const output = results[session.outputNames[0]]; // shape: [1, 4+nc, anchors]

  return postprocess(output, nc, source.width || inputSize, source.height || inputSize);
}

function postprocess(
  output: ort.Tensor,
  nc: number,
  origW: number,
  origH: number,
): Detection[] {
  const data = output.data as Float32Array;
  const dims = output.dims; // [1, 4+nc, num_anchors]
  const numAnchors = dims[2];
  const stride = 4 + nc;

  const detections: Detection[] = [];

  for (let i = 0; i < numAnchors; i++) {
    const offset = i * stride;
    const x = data[offset];
    const y = data[offset + 1];
    const w = data[offset + 2];
    const h = data[offset + 3];

    // Find max class confidence
    let maxConf = 0;
    let clsIdx = 0;
    for (let c = 0; c < nc; c++) {
      const conf = sigmoid(data[offset + 4 + c]);
      if (conf > maxConf) {
        maxConf = conf;
        clsIdx = c;
      }
    }

    if (maxConf > 0.25) {
      // Convert xywh → xyxy (normalized)
      const x1 = (x - w / 2) / origW;
      const y1 = (y - h / 2) / origH;
      const x2 = (x + w / 2) / origW;
      const y2 = (y + h / 2) / origH;

      detections.push({
        class: `class_${clsIdx}`,
        class_id: clsIdx,
        confidence: maxConf,
        bbox: [x1, y1, x2, y2],
      });
    }
  }

  return nms(detections, 0.45);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function nms(boxes: Detection[], iouThresh: number): Detection[] {
  if (boxes.length === 0) return [];

  // Sort by confidence descending
  boxes.sort((a, b) => b.confidence - a.confidence);

  const keep: Detection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (suppressed.has(j)) continue;
      if (iou(boxes[i].bbox, boxes[j].bbox) > iouThresh) {
        suppressed.add(j);
      }
    }
  }

  return keep;
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  if (x2 <= x1 || y2 <= y1) return 0;

  const inter = (x2 - x1) * (y2 - y1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter);
}

/**
 * Draw detection boxes on a canvas.
 */
export function drawBoxes(
  canvas: HTMLCanvasElement,
  detections: Detection[],
  classNames: string[],
): string {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  for (const d of detections) {
    const [x1, y1, x2, y2] = d.bbox;
    const bx = x1 * w;
    const by = y1 * h;
    const bw = (x2 - x1) * w;
    const bh = (y2 - y1) * h;

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    const label = `${classNames[d.class_id] || d.class} ${(d.confidence * 100).toFixed(0)}%`;
    ctx.fillStyle = '#00FF00';
    ctx.font = '12px monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(bx, by - 16, tw + 6, 16);
    ctx.fillStyle = '#000';
    ctx.fillText(label, bx + 3, by - 4);
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}
