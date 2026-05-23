import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { StyleData } from './qr-types';
import {
  parseHex,
  computePhase,
  renderGradientFrame,
  compositeFrame,
  getEffectiveLoopKind,
} from './qr-export-render';

type Msg = {
  maskBitmap: ImageBitmap;
  style: StyleData;
  format: 'mp4' | 'webm';
  frameCount: number;
  fps: number;
};

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent<Msg>) => {
  const { maskBitmap, style, format, frameCount, fps } = e.data;
  const size = maskBitmap.width;
  const loopKind = getEffectiveLoopKind(style.animationType, style.animationDirection);
  const totalFrames = loopKind === 'alternate' ? frameCount * 2 : frameCount;
  const frameDurationUs = Math.round(1_000_000 / fps);

  const maskCanvas = new OffscreenCanvas(size, size);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  maskCtx.drawImage(maskBitmap, 0, 0);
  const maskData = maskCtx.getImageData(0, 0, size, size).data;

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  const frameCanvas = new OffscreenCanvas(size, size);
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!;

  let muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget>;
  let target: Mp4Target | WebmTarget;

  const codec = format === 'mp4' ? 'avc1.640028' : 'vp09.00.10.08';

  if (format === 'mp4') {
    target = new Mp4Target();
    muxer = new Mp4Muxer({
      target: target as Mp4Target,
      video: {
        codec: 'avc',
        width: size,
        height: size,
      },
      fastStart: 'in-memory',
    });
  } else {
    target = new WebmTarget();
    muxer = new WebmMuxer({
      target: target as WebmTarget,
      video: {
        codec: 'V_VP9',
        width: size,
        height: size,
      },
    });
  }

  const encodedChunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      encodedChunks.push({ chunk, meta });
    },
    error: (err) => {
      ctx.postMessage({ type: 'error', msg: err.message });
    },
  });

  encoder.configure({
    codec,
    width: size,
    height: size,
    bitrate: 8_000_000,
    bitrateMode: 'variable',
    framerate: fps,
    latencyMode: 'quality',
  });

  for (let f = 0; f < totalFrames; f++) {
    const phase = computePhase(
      f,
      totalFrames,
      style.animationType,
      style.animationDirection,
      style.animationTimingFunction,
    );
    const gradData = renderGradientFrame(size, style.animationStops, phase, style.animationType);
    const frameData = compositeFrame(gradData, maskData, bgColor, size);

    const imageData = new ImageData(frameData as Uint8ClampedArray<ArrayBuffer>, size, size);
    frameCtx.putImageData(imageData, 0, 0);

    const videoFrame = new VideoFrame(frameCanvas, {
      timestamp: f * frameDurationUs,
      duration: frameDurationUs,
    });

    const keyFrame = f % 30 === 0;
    encoder.encode(videoFrame, { keyFrame });
    videoFrame.close();

    // Backpressure: yield if encoder queue is building up
    if (encoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 1));
    }

    ctx.postMessage({ type: 'progress', pct: Math.round(((f + 1) / totalFrames) * 90) });
  }

  await encoder.flush();
  encoder.close();

  // Write all chunks to muxer
  for (const { chunk, meta } of encodedChunks) {
    muxer.addVideoChunk(chunk, meta);
  }

  muxer.finalize();

  const result = target.buffer!;
  ctx.postMessage({ type: 'progress', pct: 100 });
  ctx.postMessage({ type: 'done', result }, [result]);
};
