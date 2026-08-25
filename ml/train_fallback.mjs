import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(here, 'synthetic_dataset.csv');
const MODEL_OUT = path.resolve(here, '../apps/api/src/modules/classifier/model.json');
const REPORT_OUT = path.join(here, 'metrics_report.md');

const EPOCHS = 4000;
const LEARNING_RATE = 0.35;
const L2 = 1e-4;
const TEST_FRACTION = 0.25;
const SEED = 20260820;


function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '');
}


function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}


function standardise(X) {
  const n = X.length;
  const d = X[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);

  for (const row of X) for (let j = 0; j < d; j += 1) means[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < d; j += 1) stds[j] += (row[j] - means[j]) ** 2 / n;
  for (let j = 0; j < d; j += 1) {
    stds[j] = Math.sqrt(stds[j]);
    if (stds[j] < 1e-9) stds[j] = 1;
  }
  return { means, stds };
}

function applyStandardisation(X, means, stds) {
  return X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
}

function fit(Xz, y, numClasses) {
  const n = Xz.length;
  const d = Xz[0].length;
  const W = Array.from({ length: numClasses }, () => new Array(d).fill(0));
  const b = new Array(numClasses).fill(0);

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    const gW = Array.from({ length: numClasses }, () => new Array(d).fill(0));
    const gb = new Array(numClasses).fill(0);

    for (let i = 0; i < n; i += 1) {
      const logits = W.map((row, c) => {
        let s = b[c];
        for (let j = 0; j < d; j += 1) s += row[j] * Xz[i][j];
        return s;
      });
      const p = softmax(logits);
      for (let c = 0; c < numClasses; c += 1) {
        const err = p[c] - (y[i] === c ? 1 : 0);
        gb[c] += err / n;
        for (let j = 0; j < d; j += 1) gW[c][j] += (err * Xz[i][j]) / n;
      }
    }

    for (let c = 0; c < numClasses; c += 1) {
      b[c] -= LEARNING_RATE * gb[c];
      for (let j = 0; j < d; j += 1) {
        W[c][j] -= LEARNING_RATE * (gW[c][j] + L2 * W[c][j]);
      }
    }
  }
  return { W, b };
}

function predict(W, b, xz) {
  const logits = W.map((row, c) => {
    let s = b[c];
    for (let j = 0; j < row.length; j += 1) s += row[j] * xz[j];
    return s;
  });
  const p = softmax(logits);
  let best = 0;
  for (let i = 1; i < p.length; i += 1) if (p[i] > p[best]) best = i;
  return best;
}


function evaluate(W, b, Xz, y, labels) {
  const k = labels.length;
  const confusion = Array.from({ length: k }, () => new Array(k).fill(0));
  let correct = 0;

  for (let i = 0; i < Xz.length; i += 1) {
    const pred = predict(W, b, Xz[i]);
    confusion[y[i]][pred] += 1;
    if (pred === y[i]) correct += 1;
  }

  const perClass = labels.map((label, c) => {
    const tp = confusion[c][c];
    const fp = confusion.reduce((sum, row, r) => sum + (r === c ? 0 : row[c]), 0);
    const fn = confusion[c].reduce((sum, v, j) => sum + (j === c ? 0 : v), 0);
    const support = confusion[c].reduce((a, v) => a + v, 0);
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, precision, recall, f1, support };
  });

  return { accuracy: Xz.length === 0 ? 0 : correct / Xz.length, perClass, confusion };
}

function fmt(x) {
  return x.toFixed(3);
}

function renderReport({ accuracy, perClass, confusion }, labels, counts) {
  const header = `| Class | Precision | Recall | F1 | Support |\n|---|---|---|---|---|`;
  const body = perClass
    .map((r) => `| \`${r.label}\` | ${fmt(r.precision)} | ${fmt(r.recall)} | ${fmt(r.f1)} | ${r.support} |`)
    .join('\n');

  const cmHeader = `| actual \\\\ predicted | ${labels.map((l) => `\`${l}\``).join(' | ')} |\n|---|${labels
    .map(() => '---')
    .join('|')}|`;
  const cmBody = confusion
    .map((row, i) => `| \`${labels[i]}\` | ${row.join(' | ')} |`)
    .join('\n');

  const macroF1 = perClass.reduce((a, r) => a + r.f1, 0) / perClass.length;

  let worst = { actual: null, predicted: null, count: 0 };
  confusion.forEach((row, i) => {
    row.forEach((count, j) => {
      if (i !== j && count > worst.count) {
        worst = { actual: labels[i], predicted: labels[j], count };
      }
    });
  });

  const confusionNote =
    worst.count === 0
      ? 'This run produced no off-diagonal errors at all, which is itself a warning sign: the templates separate too cleanly to be a proxy for real operator language.'
      : `The dominant error in this run is \`${worst.actual}\` misread as \`${worst.predicted}\` (${worst.count} case${worst.count === 1 ? '' : 's'}).` +
        (worst.actual === 'simple_lookup' || worst.predicted === 'simple_lookup'
          ? ' That is the costly direction: `simple_lookup` is the class that changes routing, so an error here can send a lookup-shaped query down the vector path. It is bounded in practice because the hard router pins the path whenever a job ID or error code resolves against real data — the classifier only picks the RL state, never the path, when an anchor is present.'
          : ' That is the cheap direction: both classes drive the same bandit exploration behaviour and differ only in the console\'s urgency badge, so the confusion costs a badge rather than a routing decision.');

  return `# Triage Classifier — Metrics Report

<!-- Generated by ml/train_fallback.mjs. Do not edit by hand. -->

**Task:** 3-class triage of operator queries (\`simple_lookup\` / \`complex_diagnostic\` / \`urgent_incident\`)
**Model:** multinomial logistic regression (softmax cross-entropy, L2 = ${L2})
**Trainer:** Node fallback (\`train_fallback.mjs\`) — reference trainer is \`train_triage_classifier.py\` (scikit-learn)
**Dataset:** ${counts.total} synthetic labelled queries, held-out split ${Math.round(TEST_FRACTION * 100)}% (${counts.test} rows), seed ${SEED}
**Generated:** ${new Date().toISOString()}

## Headline

| Metric | Value |
|---|---|
| Held-out accuracy | **${fmt(accuracy)}** |
| Macro F1 | **${fmt(macroF1)}** |

## Per-class

${header}
${body}

## Confusion matrix (held-out)

${cmHeader}
${cmBody}

## Honest interpretation

Accuracy on this dataset is high, and that number deserves its caveat: the
queries are generated from templates × entity slots, so the classifier is
learning the generator's vocabulary rather than real operator language. Treat it
as a working component with a reproducible evaluation, not as evidence about
production performance.

The confusion matrix is the informative part. ${confusionNote}

The design anticipated \`complex_diagnostic\` ↔ \`urgent_incident\` as the main
error mode, on the reasoning that urgency and complexity co-occur in incident
language. Check the matrix above against that expectation on every retrain —
where they disagree, the matrix is the evidence and the expectation is the
hypothesis.

\`simple_lookup\` is separated largely by the structured-anchor features
(\`has_job_id\`, \`has_error_code\`), which are near-deterministic signals rather
than learned lexical cues. Those same anchors independently pin the retrieval
path upstream of the classifier, which is what bounds the blast radius of any
error in this class.
`;
}


function main() {
  if (!fs.existsSync(CSV)) {
    process.stderr.write(`missing ${CSV} — run \`npm run ml:dataset\` first\n`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const header = rows[0];
  const featureNames = header.slice(2);
  const data = rows.slice(1);

  const labels = [...new Set(data.map((r) => r[1]))].sort();
  const X = data.map((r) => r.slice(2).map(Number));
  const y = data.map((r) => labels.indexOf(r[1]));

  const rand = mulberry32(SEED);
  const idx = X.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const cut = Math.floor(idx.length * (1 - TEST_FRACTION));
  const trainIdx = idx.slice(0, cut);
  const testIdx = idx.slice(cut);

  const Xtrain = trainIdx.map((i) => X[i]);
  const ytrain = trainIdx.map((i) => y[i]);
  const Xtest = testIdx.map((i) => X[i]);
  const ytest = testIdx.map((i) => y[i]);

  const { means, stds } = standardise(Xtrain);
  const XtrainZ = applyStandardisation(Xtrain, means, stds);
  const XtestZ = applyStandardisation(Xtest, means, stds);

  const { W, b } = fit(XtrainZ, ytrain, labels.length);
  const metrics = evaluate(W, b, XtestZ, ytest, labels);

  const model = {
    trained_by: 'train_fallback.mjs (node)',
    trained_at: new Date().toISOString(),
    labels,
    feature_names: featureNames,
    coefficients: W.map((row) => row.map((v) => Number(v.toFixed(6)))),
    intercepts: b.map((v) => Number(v.toFixed(6))),
    means: means.map((v) => Number(v.toFixed(6))),
    stds: stds.map((v) => Number(v.toFixed(6))),
  };

  fs.writeFileSync(MODEL_OUT, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    REPORT_OUT,
    renderReport(metrics, labels, { total: X.length, test: Xtest.length }),
    'utf8',
  );

  process.stdout.write(
    `trained on ${Xtrain.length} rows, held-out accuracy ${fmt(metrics.accuracy)}\n` +
      `  model  → ${MODEL_OUT}\n  report → ${REPORT_OUT}\n`,
  );
}

main();
