import PDFDocument from 'pdfkit';

// Palette deyoo — alignée sur l'identité Bubble (cream / serif / terracotta)
const COLORS = {
  bg:         '#F4F0E6',  // crème de fond
  bgSoft:     '#EDE7D7',  // fond des encadrés
  ink:        '#0D1418',  // texte principal
  inkSoft:    '#3A4048',  // texte secondaire
  mute:       '#8A847A',  // texte discret
  accent:     '#D35A2A',  // terracotta (titres de section, accent verdict, point logo)
  accentWarm: '#F2B03D',  // saffron (réservé highlights ponctuels)
  border:     '#B8A98A',  // séparateurs / bordures discrètes
};

// Détecte un scénario "non chiffré" → bascule l'encadré FONDATEUR en mode invitation
const NO_DATA_PATTERN = /(non\s+(calculable|quantifié|évaluable|projeter)|données?\s+insuffisantes?|impossible\s+à\s+(calculer|projeter|évaluer)|nécessite\s+étude\s+de\s+marché|pas\s+(suffisamment|assez)\s+de\s+données)/i;

// Texte d'invitation affiché dans la 3e case quand FONDATEUR est vide
const FONDATEUR_PROMPT = {
  amount: 'À préciser',
  desc:   'indiquer prix moyen, volume cible mensuel, marge brute estimée et coûts fixes pour calculer ce scénario.',
};

const SECTION_MAP = {
  'INTRODUCTION':            'Introduction',
  'VERDICT':                 'Verdict',
  'VARIABLE CLE ET SEUILS':  'Variable cle et seuils',
  'VARIABLE CLÉ ET SEUILS':  'Variable cle et seuils',
  'LES 5 PILIERS':           'Les 5 piliers',
  'PILIERS':                 'Les 5 piliers',
  'ANALYSE':                 'Analyse',
  'CONCLUSION':              'Conclusion',
  'ACTIONS':                 'Actions',
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
      const raw = line.replace('## ', '').trim();
      detected = SECTION_MAP[raw.toUpperCase()] || raw;
    } else {
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
      autoFirstPage: false,   // On ajoute la première page manuellement pour peindre le fond
      bufferPages: true,
      info: { Title: 'Compte-rendu deyoo', Author: 'deyoo' },
    });

    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Peint le fond crème sur chaque nouvelle page
    function paintBackground() {
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg);
      doc.restore();
      doc.fillColor(COLORS.ink);  // restaure la couleur de texte par défaut
    }

    doc.on('pageAdded', paintBackground);
    doc.addPage();  // Déclenche paintBackground pour la 1ère page

    const W = doc.page.width - M * 2;

    const sections = parseSections(data.details || '');

    const rawProject = data.project;
    const projectName = (rawProject && rawProject !== 'null' && rawProject !== 'undefined' && rawProject.trim() !== '')
      ? rawProject
      : 'Compte-rendu de projet';

    // --- HELPERS ---

    function resetX() { doc.x = M; }

    function rule(color = COLORS.border, thickness = 0.5) {
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y)
        .lineWidth(thickness).stroke(color);
      resetX();
    }

    function sectionTitle(label) {
      doc.moveDown(2);
      resetX();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.accent)
        .text(label.toUpperCase(), M, doc.y, { characterSpacing: 1.8, width: W });
      doc.moveDown(0.5);
      rule();
      doc.moveDown(0.8);
      resetX();
    }

    function body(text, opts = {}) {
      resetX();
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
        .text(clean(text), M, doc.y, { lineGap: 5, width: W, ...opts });
      resetX();
    }

    // --- EN-TÊTE : "deyoo" italique + point terracotta (signature de marque) ---
    doc.font('Times-BoldItalic').fontSize(15).fillColor(COLORS.ink);
    const deyooText = 'deyoo';
    const deyooW = doc.widthOfString(deyooText);
    const dotSize = 4;
    const gap = 4;
    const deyooX = M + W - deyooW - gap - dotSize;  // aligné à droite, place réservée pour le point
    doc.text(deyooText, deyooX, M, { lineBreak: false });
    // Point terracotta après "deyoo", aligné sur la baseline
    const dotCenterX = deyooX + deyooW + gap + dotSize / 2;
    const dotCenterY = M + 12;  // ajusté visuellement à la baseline du serif
    doc.circle(dotCenterX, dotCenterY, dotSize / 2).fill(COLORS.accent);
    doc.fillColor(COLORS.ink);

    resetX();
    doc.y = M + 30;
    doc.moveDown(2);

    // --- TITRE PROJET : sérif éditorial, centré ---
    doc.font('Times-Bold').fontSize(28).fillColor(COLORS.ink)
      .text(projectName, M, doc.y, { align: 'center', width: W });
    resetX();
    doc.moveDown(0.4);

    // --- DATE : italique discret ---
    doc.font('Times-Italic').fontSize(10).fillColor(COLORS.mute)
      .text(
        new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        M, doc.y,
        { align: 'center', width: W }
      );
    resetX();
    doc.moveDown(1.5);
    rule(COLORS.border, 1);

    // --- INTRODUCTION ---
    if (sections['Introduction']) {
      sectionTitle('Introduction');
      body(sections['Introduction']);
    }

    // --- VERDICT (avec barre d'accent terracotta) ---
    if (sections['Verdict']) {
      sectionTitle('Verdict');
      const vy = doc.y;
      doc.font('Times-Roman').fontSize(11).fillColor(COLORS.ink)
        .text(clean(sections['Verdict']), M + 20, vy, { width: W - 20, lineGap: 5 });
      const endY = doc.y;
      doc.rect(M, vy, 3, endY - vy + 4).fill(COLORS.accent);
      doc.y = endY + 20;
      resetX();
    }

    // --- VARIABLE CLE ET SEUILS (avec encadré conditionnel pour FONDATEUR vide) ---
    const vk = sections['Variable cle et seuils'] || sections['Variable cle'] || sections['Variable clé et seuils'] || sections['Variable clé'];
    if (vk) {
      sectionTitle('Variable cle et seuils');
      const vkLines = vk.split('\n');

      const SEUIL_LABELS = ['CONSERVATEUR', 'RÉALISTE', 'REALISTE', 'FONDATEUR'];
      const seuilLines = vkLines.filter(l => SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)));
      const intro = vkLines.filter(l => !SEUIL_LABELS.some(sl => l.toUpperCase().includes(sl)) && l.trim()).join(' ');

      if (intro) { body(intro); doc.moveDown(1.2); }

      if (seuilLines.length) {
        const bw = (W - 16) / 3;
        const by = doc.y;
        const labels = ['CONSERVATEUR', 'RÉALISTE', 'FONDATEUR'];

        const boxData = seuilLines.slice(0, 3).map((line, i) => {
          const txt = clean(line.replace(/^[A-ZÉÀ]+\s*[:=]\s*/i, ''));
          const parts = txt.split(/\s*[—–]\s*|\s*--\s*/);
          const amount = parts[0]?.trim() || '';
          const desc = parts.slice(1).join(' — ').trim();
          // L3 : détecte un scénario non quantifié → encart d'invitation pour FONDATEUR uniquement
          const isEmpty = i === 2 && (NO_DATA_PATTERN.test(amount) || NO_DATA_PATTERN.test(desc));
          return { amount, desc, isEmpty };
        });

        const LABEL_Y = 12;
        const AMOUNT_Y = 30;
        const MAX_AMT_SIZE = 13;
        const SMALL_AMT_SIZE = 11;
        const DESC_GAP = 8;
        const BOT_PAD = 16;

        function fitAmtSize(amount, maxSize = MAX_AMT_SIZE) {
          let size = maxSize;
          while (size > 7) {
            const w = doc.font('Helvetica-Bold').fontSize(size).widthOfString(amount || '');
            if (w <= bw - 20) break;
            size--;
          }
          return size;
        }

        // Calcul de la hauteur uniforme
        let maxBH = 0;
        boxData.forEach(({ amount, desc, isEmpty }) => {
          const a = isEmpty ? FONDATEUR_PROMPT.amount : amount;
          const d = isEmpty ? FONDATEUR_PROMPT.desc : desc;
          const amtSize = fitAmtSize(a, isEmpty ? SMALL_AMT_SIZE : MAX_AMT_SIZE);
          const amtFont = isEmpty ? 'Times-Italic' : 'Helvetica-Bold';
          let h = AMOUNT_Y;
          h += doc.font(amtFont).fontSize(amtSize).heightOfString(a || ' ', { width: bw - 20 });
          if (d) {
            h += DESC_GAP;
            h += doc.font('Helvetica').fontSize(8).heightOfString(d, { width: bw - 20 });
          }
          h += BOT_PAD;
          if (h > maxBH) maxBH = h;
        });
        const bh = maxBH;

        // Dessin des trois encadrés
        boxData.forEach(({ amount, desc, isEmpty }, i) => {
          const a = isEmpty ? FONDATEUR_PROMPT.amount : amount;
          const d = isEmpty ? FONDATEUR_PROMPT.desc : desc;
          const bx = M + i * (bw + 8);

          // Fond crème doux ; bordure pointillée pour l'encart d'invitation
          doc.rect(bx, by, bw, bh).fill(COLORS.bgSoft);
          if (isEmpty) {
            doc.save();
            doc.lineWidth(0.8).dash(3, { space: 3 });
            doc.rect(bx + 0.5, by + 0.5, bw - 1, bh - 1).stroke(COLORS.border);
            doc.undash();
            doc.restore();
          }

          // Label CONSERVATEUR / RÉALISTE / FONDATEUR
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.mute)
            .text(labels[i], bx + 10, by + LABEL_Y, { width: bw - 20, characterSpacing: 1 });

          // Montant (ou texte d'invitation si encart vide)
          const amtSize = fitAmtSize(a, isEmpty ? SMALL_AMT_SIZE : MAX_AMT_SIZE);
          const amtFont = isEmpty ? 'Times-Italic' : 'Helvetica-Bold';
          const amtColor = isEmpty ? COLORS.inkSoft : COLORS.ink;
          const amtH = doc.font(amtFont).fontSize(amtSize).heightOfString(a || ' ', { width: bw - 20 });
          doc.font(amtFont).fontSize(amtSize).fillColor(amtColor)
            .text(a || '', bx + 10, by + AMOUNT_Y, { width: bw - 20 });

          // Description (justification du scénario, ou liste de champs à préciser)
          if (d) {
            const descY = by + AMOUNT_Y + amtH + DESC_GAP;
            doc.font('Helvetica').fontSize(8).fillColor(isEmpty ? COLORS.mute : COLORS.inkSoft)
              .text(d, bx + 10, descY, { width: bw - 20 });
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

        const colonIdx = trimmed.indexOf(' : ');
        if (colonIdx > 0 && colonIdx < 70) {
          const t = trimmed.slice(0, colonIdx).trim();
          const d = trimmed.slice(colonIdx + 3).trim();
          resetX();
          doc.font('Times-Bold').fontSize(11.5).fillColor(COLORS.ink)
            .text(t, M, doc.y, { width: W });
          resetX();
          doc.font('Times-Roman').fontSize(11).fillColor(COLORS.inkSoft)
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

    // --- CONCLUSION (italique éditorial) ---
    if (sections['Conclusion']) {
      sectionTitle('Conclusion');
      resetX();
      doc.font('Times-Italic').fontSize(11).fillColor(COLORS.ink)
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
        const numbered = trimmed.match(/^\d+\.\s+(.+)/);
        if (numbered) {
          const rest = numbered[1];
          const colonIdx = rest.indexOf(' : ');
          if (colonIdx > 0 && colonIdx < 70) {
            const title = rest.slice(0, colonIdx).trim();
            const desc = rest.slice(colonIdx + 3).trim();
            resetX();
            doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
              .text(`${n}. ${clean(title)}`, M, doc.y, { width: W });
            resetX();
            doc.font('Times-Roman').fontSize(10.5).fillColor(COLORS.inkSoft)
              .text(clean(desc), M, doc.y, { lineGap: 3, width: W });
          } else {
            resetX();
            doc.font('Times-Bold').fontSize(11).fillColor(COLORS.ink)
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

    // --- FOOTER : signature deyoo (L6) ---
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const savedMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Times-Italic').fontSize(8.5).fillColor(COLORS.mute)
        .text(
          `un compte-rendu deyoo  ·  deyoo.app  ·  page ${i + 1} / ${totalPages}`,
          M, doc.page.height - 36,
          { width: W, align: 'center', lineBreak: false }
        );
      doc.page.margins.bottom = savedMargin;
      doc.y = M;
    }

    doc.end();
  });
}
