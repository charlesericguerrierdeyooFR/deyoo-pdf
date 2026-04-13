import PDFDocument from 'pdfkit';

const COLORS = {
  black:     '#0f0f0f',
  dark:      '#1c1c1e',
  gray:      '#6e6e73',
  lightGray: '#f2f2f7',
  border:    '#e5e5ea',
};

// Maps uppercase section names (as Claude outputs them) to internal keys
const SECTION_MAP = {
  'INTRODUCTION':          'Introduction',
  'VERDICT':               'Verdict',
  'VARIABLE CLE ET SEUILS': 'Variable cle et seuils',
  'VARIABLE CLÉ ET SEUILS': 'Variable cle et seuils',
  'LES 5 PILIERS':         'Les 5 piliers',
  'ANALYSE':               'Analyse',
  'CONCLUSION':            'Conclusion',
  'ACTIONS':               'Actions',
};

function parseSections(text) {
  const sections = {};
  const lines = text.split('\n');
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const trimmed = line.trim();
    let detected = null;
    if (line.startsWith('## ')) {
      // Markdown header (## INTRODUCTION or ## Introduction)
      const raw = line.replace('## ', '').trim();
      detected = SECTION_MAP[raw.toUpperCase()] || raw;
    } else {
      // Plain uppercase section title (no ## prefix)
      detected = SECTION_MAP[trimmed.toUpperCase()] || null;
    }
    if (detected) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = detected;
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

    // Fix: handle null, "null", undefined, empty string from Bubble
    const rawProject = data.project;
    const projectName = (rawProject && rawProject !== 'null' && rawProject !== 'undefined' && rawProject.trim() !== '')
      ? rawProject
      : 'Analyse de projet';

    // --- HELPERS ---

    function resetX() {
      doc.x = M;
    }

    function rule(color = COLORS.border, thickness = 0.5) {
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y)
        .lineWidth(thickness).stroke(color);
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

    // --- EN-TETE ---
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
        M, doc.y,
        { align: 'center', width: W }
      );
    resetX();
    doc.moveDown(1.5);
    rule(COLORS.dark, 1.5);

    // --- INTRODUCTION ---
    if (sections['Introduction']) {
      sectionTitle('Introduction');
      body(sections['Introduction']);
    }

    // --- VERDICT ---
    if (sections['Verdict']) {
      sectionTitle('Verdict');
      const vy = doc.y;
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.dark)
        .text(clean(sections['Verdict']), M + 20, vy, { width: W - 20, lineGap: 5 });
      const endY = doc.y;
      doc.rect(M, vy, 3, endY - vy + 4).fill(COLORS.dark);
      doc.y = endY + 20;
      resetX();
    }

    // --- VARIABLE CLE ---
    const vk = sections['Variable cle et seuils'] || sections['Variable cle'] || sections['Variable clé et seuils'] || sections['Variable clé'];
    if (vk) {
      sectionTitle('Variable cle et seuils');
      const vkLines = vk.split('\n');

      // Detect scenario lines: CONSERVATEUR / RÉALISTE / REALISTE / FONDATEUR
      const SEUIL_LABELS = ['CONSERVATEUR', 'RÉALISTE', 'REALISTE', 'FONDATEUR'];
      const seuilLines = vkLines.filter(l => SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)));
      const intro = vkLines.filter(l => !SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)) && l.trim()).join(' ');

      if (intro) { body(intro); doc.moveDown(1.2); }

      if (seuilLines.length) {
        const bw = (W - 16) / 3;
        const by = doc.y;
        const labels = ['CONSERVATEUR', 'RÉALISTE', 'FONDATEUR'];

        // Parse each scenario line: "LABEL : amount — desc" or "LABEL = amount — desc"
        const boxData = seuilLines.slice(0, 3).map(line => {
          const txt = clean(line.replace(/^[A-ZÉÀ]+\s*[:=]\s*/i, ''));
          const parts = txt.split(/\s*[—–]\s*|\s*--\s*/);
          return { amount: parts[0]?.trim() || '', desc: parts.slice(1).join(' — ').trim() };
        });

        // Calculate box height
        const LABEL_Y = 12;
        const AMOUNT_Y = 30;
        const MAX_AMT_SIZE = 13;
        const DESC_GAP = 8;
        const BOT_PAD = 16;

        function fitAmtSize(amount) {
          let size = MAX_AMT_SIZE;
          while (size > 7) {
            const w = doc.font('Helvetica-Bold').fontSize(size).widthOfString(amount || '');
            if (w <= bw - 20) break;
            size--;
          }
          return size;
        }

        let maxBH = 0;
        boxData.forEach(({ amount, desc }) => {
          const amtSize = fitAmtSize(amount);
          let h = AMOUNT_Y;
          h += doc.font('Helvetica-Bold').fontSize(amtSize).heightOfString(amount || ' ', { width: bw - 20, lineBreak: false });
          if (desc) {
            h += DESC_GAP;
            h += doc.font('Helvetica').fontSize(8).heightOfString(desc, { width: bw - 20 });
          }
          h += BOT_PAD;
          if (h > maxBH) maxBH = h;
        });
        const bh = maxBH;

        // Draw boxes
        boxData.forEach(({ amount, desc }, i) => {
          const bx = M + i * (bw + 8);
          doc.rect(bx, by, bw, bh).fill(COLORS.lightGray);

          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gray)
            .text(labels[i], bx + 10, by + LABEL_Y, { width: bw - 20 });

          const amtSize = fitAmtSize(amount);
          const amtH = doc.font('Helvetica-Bold').fontSize(amtSize).heightOfString(amount || ' ', { width: bw - 20, lineBreak: false });
          doc.font('Helvetica-Bold').fontSize(amtSize).fillColor(COLORS.dark)
            .text(amount || '', bx + 10, by + AMOUNT_Y, { width: bw - 20, lineBreak: false });

          if (desc) {
            const descY = by + AMOUNT_Y + amtH + DESC_GAP;
            doc.font('Helvetica').fontSize(8).fillColor(COLORS.gray)
              .text(desc, bx + 10, descY, { width: bw - 20 });
          }
        });
        doc.y = by + bh + 20;
        resetX();
      }
    }

    // --- LES 5 PILIERS ---
    const piliers = sections['Les 5 piliers'];
    if (piliers) {
      sectionTitle('Les 5 piliers');
      const lines = piliers.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Format strict : "Nom du pilier : description en 1 phrase."
        const colonIdx = trimmed.indexOf(' : ');
        if (colonIdx > 0 && colonIdx < 70) {
          const t = trimmed.slice(0, colonIdx).trim();
          const d = trimmed.slice(colonIdx + 3).trim();
          resetX();
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.dark)
            .text(t, M, doc.y, { width: W });
          resetX();
          doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.dark)
            .text(clean(d), M, doc.y, { lineGap: 5, width: W });
          doc.moveDown(1);
          resetX();
        } else {
          body(trimmed);
          doc.moveDown(0.5);
        }
      }
    }

    // --- ANALYSE ---
    if (sections['Analyse']) {
      sectionTitle('Analyse');
      const paras = sections['Analyse'].split(/\n{2,}/).filter(p => p.trim());
      paras.forEach((p, i) => {
        body(p);
        if (i < paras.length - 1) doc.moveDown(0.8);
      });
    }

    // --- CONCLUSION ---
    if (sections['Conclusion']) {
      sectionTitle('Conclusion');
      resetX();
      doc.font('Helvetica-Oblique').fontSize(10.5).fillColor(COLORS.dark)
        .text(clean(sections['Conclusion']), M, doc.y, { lineGap: 5, width: W });
      resetX();
    }

    // --- ACTIONS ---
    if (sections['Actions']) {
      sectionTitle('Actions');
      const alines = sections['Actions'].split('\n').filter(l => l.trim());
      let n = 1;
      alines.forEach(line => {
        const trimmed = line.trim();
        // Numbered list format: "1. Action : description" or "1. Action"
        const numbered = trimmed.match(/^\d+\.\s+(.+)/);
        if (numbered) {
          const rest = numbered[1];
          const colonIdx = rest.indexOf(' : ');
          if (colonIdx > 0 && colonIdx < 70) {
            const title = rest.slice(0, colonIdx).trim();
            const desc = rest.slice(colonIdx + 3).trim();
            resetX();
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.dark)
              .text(`${n}. ${clean(title)}`, M, doc.y, { width: W });
            resetX();
            doc.font('Helvetica').fontSize(10).fillColor(COLORS.gray)
              .text(clean(desc), M, doc.y, { lineGap: 3, width: W });
          } else {
            resetX();
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.dark)
              .text(`${n}. ${clean(rest)}`, M, doc.y, { width: W });
          }
          doc.moveDown(0.7);
          n++;
        } else if (trimmed) {
          body(trimmed);
          doc.moveDown(0.5);
        }
      });
    }

    // --- FOOTER sur chaque page ---
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const savedMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.gray)
        .text(
          `deyoo  -  Analyse confidentielle  -  Page ${i + 1} / ${totalPages}`,
          M, doc.page.height - 36,
          { width: W, align: 'center', lineBreak: false }
        );
      doc.page.margins.bottom = savedMargin;
      doc.y = M;
    }

    doc.end();
  });
}
