/**
 * Lightweight QR Code SVG Generator
 * Generates a QR-code-like matrix from input data and renders as SVG.
 * Uses a deterministic hash-based pattern generator for visual fidelity.
 */

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMatrix(data, size = 33) {
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const rng = seededRandom(hashCode(data));

  // Finder patterns (3 corners)
  const drawFinder = (row, col) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[row + r][col + c] = 1;
        } else {
          matrix[row + r][col + c] = 0;
        }
      }
    }
  };

  drawFinder(0, 0);              // Top-left
  drawFinder(0, size - 7);       // Top-right
  drawFinder(size - 7, 0);       // Bottom-left

  // Separators (white borders around finders)
  for (let i = 0; i < 8; i++) {
    // Top-left
    if (i < size) { matrix[7][i] = 0; matrix[i][7] = 0; }
    // Top-right
    if (size - 8 + i < size) { matrix[7][size - 8 + i] = 0; matrix[i][size - 8] = 0; }
    // Bottom-left
    if (size - 8 + i < size) { matrix[size - 8][i] = 0; matrix[size - 8 + i][7] = 0; }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment pattern (center-ish)
  const alignPos = size - 9;
  if (alignPos > 8) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[alignPos + r][alignPos + c] = 1;
        } else {
          matrix[alignPos + r][alignPos + c] = 0;
        }
      }
    }
  }

  // Fill remaining with data pattern
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder areas
      if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) continue;
      // Skip timing
      if (r === 6 || c === 6) continue;
      // Skip alignment
      if (alignPos > 8 && Math.abs(r - alignPos) <= 2 && Math.abs(c - alignPos) <= 2) continue;

      matrix[r][c] = rng() > 0.5 ? 1 : 0;
    }
  }

  return matrix;
}

/**
 * Generate QR Code as SVG string
 * @param {string} data - Data to encode
 * @param {number} pixelSize - Size of each module in pixels
 * @param {string} fgColor - Foreground (dark) color
 * @param {string} bgColor - Background (light) color
 * @returns {string} SVG markup
 */
export function generateQRCodeSVG(data, pixelSize = 6, fgColor = '#0f172a', bgColor = '#ffffff') {
  const size = 33;
  const matrix = generateMatrix(data, size);
  const svgSize = size * pixelSize;
  const borderSize = pixelSize * 2;
  const totalSize = svgSize + borderSize * 2;

  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = borderSize + c * pixelSize;
        const y = borderSize + r * pixelSize;
        rects += `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${fgColor}" rx="0.5"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" style="max-width:100%;height:auto;">
    <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" rx="4"/>
    ${rects}
  </svg>`;
}

/**
 * Generate a simulated Pix EMV code
 * @param {object} params
 * @returns {string} Pix code string
 */
export function generatePixCode(params = {}) {
  const { amount = 0, description = '', txId = '' } = params;
  const amountStr = amount.toFixed(2);
  // Simulate EMV Pix format
  return `00020126580014br.gov.bcb.pix0136${txId || crypto.randomUUID?.() || Math.random().toString(36).slice(2)}5204000053039865802BR5913LINKA PAGTO6008TERESINA62070503***6304${Math.floor(Math.random() * 10000).toString(16).toUpperCase().padStart(4, '0')}`;
}
