/**
 * In-browser Chroma-Key (#FF00FF) remover & 4x4 Sprite Sheet Importer.
 * Lets users upload any 4x4 magenta sprite sheet generated in ChatGPT Plus / Gemini
 * and immediately turn it into a playable fighter in Street Brawl!
 */
export function removeMagentaChromaKey(img, targetSize = 768) {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetSize, targetSize);

  const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const magentaScore = Math.min(r, b) - g;

    if (r > 150 && b > 150 && g < 120 && magentaScore > 75) {
      data[i + 3] = 0;
    } else if (r > 120 && b > 120 && g < 140 && magentaScore > 35) {
      const factor = Math.min(1, Math.max(0, (magentaScore - 35) / 55));
      data[i + 3] = Math.round(data[i + 3] * (1 - factor));
      data[i] = Math.min(r, g + 20);
      data[i + 2] = Math.min(b, g + 20);
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Extract portrait from cell (0,0)
  const portCanvas = document.createElement('canvas');
  portCanvas.width = 160;
  portCanvas.height = 160;
  const pctx = portCanvas.getContext('2d');
  pctx.fillStyle = '#1c1230';
  pctx.fillRect(0, 0, 160, 160);
  const cell = targetSize / 4;
  pctx.drawImage(canvas, cell * 0.08, cell * 0.02, cell * 0.84, cell * 0.84, 2, 4, 156, 156);

  return {
    sheetDataUrl: canvas.toDataURL('image/webp', 0.86),
    portraitDataUrl: portCanvas.toDataURL('image/webp', 0.88),
  };
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
