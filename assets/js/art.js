// Procedurally drawn "product shots" for the resource preview (no image files needed).
// Each card is 1600x1000 and is used as a texture by the distortion shader.

export const CARD_W = 1600;
export const CARD_H = 1000;

const SPECS = [
  { en: 'TENT', zh: '帳篷', unit: '系學會 · 社團', c1: '#ff5a1f', c2: '#2a0a02', icon: 'tent' },
  { en: 'SOUND', zh: '音響設備', unit: '學生會 · 科辦', c1: '#4f86ff', c2: '#050c24', icon: 'speaker' },
  { en: 'TABLES', zh: '活動桌椅', unit: '各系學會', c1: '#ffb02e', c2: '#241400', icon: 'table' },
  { en: 'BOOKS', zh: '專業書籍', unit: '師生閒置', c1: '#38d996', c2: '#03201a', icon: 'books' },
];

export async function drawResourceTextures() {
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('700 200px "Inter Tight"'),
      document.fonts.load('500 60px "Noto Sans TC"'),
      document.fonts.load('400 24px "JetBrains Mono"'),
    ]);
  } catch (_) {
    /* fall back to system fonts */
  }
  return SPECS.map((spec, i) => drawCard(spec, i));
}

function drawCard(spec, index) {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d');

  // base
  g.fillStyle = spec.c2;
  g.fillRect(0, 0, CARD_W, CARD_H);
  const glow = g.createRadialGradient(CARD_W * 0.72, CARD_H * 0.38, 40, CARD_W * 0.72, CARD_H * 0.38, CARD_W * 0.72);
  glow.addColorStop(0, hexA(spec.c1, 0.95));
  glow.addColorStop(0.45, hexA(spec.c1, 0.35));
  glow.addColorStop(1, hexA(spec.c1, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, CARD_W, CARD_H);

  // concentric arcs echo the hero ribbons
  g.save();
  g.translate(CARD_W * 0.78, CARD_H * 1.05);
  for (let r = 0; r < 9; r++) {
    g.beginPath();
    g.arc(0, 0, 300 + r * 92, Math.PI * 1.02, Math.PI * 1.78);
    g.lineWidth = 2 + (r % 3) * 5;
    g.strokeStyle = r % 2 ? 'rgba(255,255,255,0.55)' : hexA(spec.c1, 0.75);
    g.stroke();
  }
  g.restore();

  // fine grid
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let x = 0; x < CARD_W; x += 40) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, CARD_H);
    g.stroke();
  }

  drawIcon(g, spec.icon, CARD_W * 0.73, CARD_H * 0.42);

  // outlined display word
  g.textBaseline = 'alphabetic';
  g.font = '700 330px "Inter Tight", "Noto Sans TC", sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.strokeText(spec.en, 80, CARD_H - 190);
  const wordGrad = g.createLinearGradient(0, CARD_H - 480, 0, CARD_H - 170);
  wordGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
  wordGrad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = wordGrad;
  g.fillText(spec.en, 80, CARD_H - 190);

  // captions
  g.fillStyle = '#ffffff';
  g.font = '500 72px "Noto Sans TC", "Inter Tight", sans-serif';
  g.fillText(spec.zh, 86, CARD_H - 96);
  g.fillStyle = 'rgba(255,255,255,0.65)';
  g.font = '400 28px "JetBrains Mono", monospace';
  g.fillText(`${spec.unit}  ·  RE·BO  ${String(index + 1).padStart(2, '0')} / 04`, 90, CARD_H - 48);

  grain(g);
  return c;
}

function drawIcon(g, kind, cx, cy) {
  g.save();
  g.translate(cx, cy);
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.fillStyle = 'rgba(0,0,0,0.22)';
  if (kind === 'tent') {
    g.beginPath();
    g.moveTo(-250, 170);
    g.lineTo(0, -190);
    g.lineTo(250, 170);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-70, 170);
    g.lineTo(0, 10);
    g.lineTo(70, 170);
    g.stroke();
    g.beginPath();
    g.moveTo(-330, 170);
    g.lineTo(330, 170);
    g.stroke();
  } else if (kind === 'speaker') {
    roundRect(g, -150, -230, 300, 460, 36);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, 85, 88, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 85, 32, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, -100, 40, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'table') {
    roundRect(g, -270, -50, 540, 46, 10);
    g.fill();
    g.stroke();
    [[-210, 4, -250, 200], [210, 4, 250, 200], [-90, 4, -110, 200], [90, 4, 110, 200]].forEach(([x1, y1, x2, y2]) => {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    });
    g.beginPath();
    g.moveTo(-330, 200);
    g.lineTo(330, 200);
    g.stroke();
  } else if (kind === 'books') {
    const books = [[-210, 70, 70, 280], [-130, 40, 80, 310], [-40, 90, 68, 260], [40, 30, 86, 320]];
    books.forEach(([x, y, w, h]) => {
      roundRect(g, x, y - h + 160, w, h, 8);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(x + 14, y - h + 200);
      g.lineTo(x + w - 14, y - h + 200);
      g.stroke();
    });
    g.save();
    g.translate(190, 110);
    g.rotate(0.32);
    roundRect(g, -40, -150, 80, 300, 8);
    g.fill();
    g.stroke();
    g.restore();
    g.beginPath();
    g.moveTo(-290, 160);
    g.lineTo(320, 160);
    g.stroke();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function grain(g) {
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * CARD_W;
    const y = Math.random() * CARD_H;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(x, y, 2, 2);
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
