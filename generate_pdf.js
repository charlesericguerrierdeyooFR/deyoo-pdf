import PDFDocument from 'pdfkit';

const COLORS = {
  black:     '#0f0f0f',
  dark:      '#1c1c1e',
  gray:      '#6e6e73',
  lightGray: '#f2f2f7',
  border:    '#e5e5ea',
};

function parseSections(text) {
  const sections = {};
  const lines = text.split('\n');
  let current = null;
  let buffer = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = line.replace('## ', '').trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

function clean(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
}

function getBoldTitle(line) {
  const m = line.match(/^\*\*(.*?)\*\*/);
  return m ? m[1] : null;
}

export async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const M = 56;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      autoFirstPage: true,
      bufferPages: true,
      info: { Title: 'Analyse deyoo', Author: 'deyoo' },
    });

    const W = doc.page.width - M * 2;
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const sections = parseSections(data.details || '');

    const rawProject = data.project;
    const projectName = (rawProject && rawProject !== 'null' && rawProject !== 'undefined' && rawProject.trim() !== '')
      ? rawProject
      : 'Analyse de projet';

    function resetX() { doc.x = M; }

    function rule(color = COLORS.border, thickness = 0.5) {
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(thickness).stroke(color);
      resetX();
    }

    function sectionTitle(label) {
      doc.moveDown(2);
      resetX();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gray)
        .text(label.toUpperCase(), M, doc.y, { characterSpacing: 1.8, width: W });
      doc.moveDown(0.5);
      rule();
      doc.moveDown(0.8);
      resetX();
    }

    function body(text, opts = {}) {
      resetX();
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.dark)
        .text(clean(text), M, doc.y, { lineGap: 5, width: W, ...opts });
      resetX();
    }

    // ── EN-TÊTE ────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.dark)
      .text('deyoo', M, M, { width: W, align: 'right' });
    resetX();
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.dark)
      .text(projectName, M, doc.y, { align: 'center', width: W });
    resetX();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.gray)
      .text(
        new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        M, doc.y, { align: 'center', width: W }
      );
    resetX();
    doc.moveDown(1.5);
    rule(COLORS.dark, 1.5);

    // ── INTRODUCTION ───────────────────────────────────────────
    if (sections['Introduction']) {
      sectionTitle('Introduction');
      body(sections['Introduction']);
    }

    // ── VERDICT ────────────────────────────────────────────────
    if (sections['Verdict']) {
      sectionTitle('Verdict');
      const vy = doc.y;
      const vh = doc.heightOfString(clean(sections['Verdict']), { width: W - 20 });
      doc.rect(M, vy, 3, vh + 12).fill(COLORS.dark);
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.dark)
        .text(clean(sections['Verdict']), M + 20, vy, { width: W - 20, lineGap: 5 });
      doc.y = vy + vh + 24;
      resetX();
    }

    // ── VARIABLE CLÉ ───────────────────────────────────────────
    const vk = sections['Variable clé et seuils'] || sections['Variable clé'];
    if (vk) {
      sectionTitle('Variable clé et seuils');
      const vkLines = vk.split('\n');
      const seuilLines = vkLines.filter(l => l.includes('Seuil'));
      const intro = vkLines.filter(l => !l.includes('Seuil') && l.trim()).join(' ');
      if (intro) { body(intro); doc.moveDown(1.2); }
      if (seuilLines.length) {
        const bw = (W - 16) / 3;
        const by = doc.y;
        const bh = 80;
        const labels = ['SURVIE', 'VIABILITÉ', 'CONFORT'];
        seuilLines.slice(0, 3).forEach((line, i) => {
          const txt = clean(line.replace(/\*\*Seuil[^:]*\*\*\s*:?\s*/, ''));
          const parts = txt.split('—');
          const amount = parts[0]?.trim() || '';
          const desc = parts[1]?.trim() || '';
          const bx = M + i * (bw + 8);
          doc.rect(bx, by, bw, bh).fill(COLORS.lightGray);
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gray)
            .text(labels[i], bx + 10, by + 12, { width: bw - 20 });
          doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.dark)
            .text(amount, bx + 10, by + 28, { width: bw - 20 });
          doc.font('Helvetica').fontSize(8).fillColor(COLORS.gray)
            .text(desc, bx + 10, by + 50, { width: bw - 20, lineBreak: false });
        });
        doc.y = by + bh + 20;
        resetX();
      }
    }

    // ── LES 5 PILIERS ──────────────────────────────────────────
    const piliers = sections['Les 5 piliers'];
    if (piliers) {
      sectionTitle('Les 5 piliers');
      const lines = piliers.split('\n');
      let title = null;
      let content = [];

      function flushPilier() {
        if (!title) return;
        resetX();
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.dark)
          .text(title, M, doc.y, { width: W });
        resetX();
        doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.dark)
          .text(clean(content.join(' ')), M, doc.y, { lineGap: 5, width: W });
        doc.moveDown(1);
        resetX();
      }

      for (const line of lines) {
        const bt = getBoldTitle(line);
        if (bt) {
          flushPilier();
          title = bt;
          const rest = line.replace(/^\*\*(.*?)\*\*\s*/, '').trim();
          content = rest ? [rest] : [];
        } else if (line.trim()) {
          content.push(line.trim());
        }
      }
      flushPilier();
    }

    // ── ANALYSE ────────────────────────────────────────────────
    if (sections['Analyse']) {
      sectionTitle('Analyse');
      const paras = sections['Analyse'].split(/\n{2,}/).filter(p
