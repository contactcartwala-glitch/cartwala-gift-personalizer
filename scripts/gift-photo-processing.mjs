import {removeBackground} from '@imgly/background-removal';

window.CartwalaGiftPhoto = async (file, treatment, report = () => {}) => {
  if (treatment === 'printed') return file;
  report('Removing background…');
  const foreground = await removeBackground(file, {
    model: 'isnet_quint8', device: 'cpu', proxyToWorker: false,
    output: {format: 'image/png', quality: 1},
    progress: (_key, current, total) => report(total ? `Preparing photo… ${Math.round(current / total * 100)}%` : 'Preparing photo…'),
  });
  if (treatment === 'cutout') return new File([foreground], 'customer-cutout.png', {type: 'image/png'});
  const bitmap = await createImageBitmap(foreground);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const original = new Uint8ClampedArray(pixels.data);
  const ink = treatment === 'engraved-dark' ? [72,46,23] : [255,246,211];
  const luminance = i => (original[i] * .2126 + original[i+1] * .7152 + original[i+2] * .0722) / 255;
  for (let i = 0; i < original.length; i += 4) {
    const adjacent = Math.min(original.length - 4, i + 4);
    const edge = Math.abs(luminance(i) - luminance(adjacent));
    const tone = Math.min(1, Math.max(.08, (1 - luminance(i)) * .8 + edge * 1.8));
    pixels.data[i] = ink[0]; pixels.data[i+1] = ink[1]; pixels.data[i+2] = ink[2];
    pixels.data[i+3] = Math.round(original[i+3] * tone);
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The engraved preview could not be prepared.');
  return new File([blob], 'customer-engraved.png', {type: 'image/png'});
};
