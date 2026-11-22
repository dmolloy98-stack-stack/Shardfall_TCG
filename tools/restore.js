// Rebuilds the whole game from the Google Drive backups, then proves it works by running every test.
//   node tools/restore.js <empty folder> <snapshot.txt> [<patch.txt> ...] [--compare]
// <snapshot.txt> is a monthly "Shardfall snapshot YYYY-MM-DD.txt" from the Versions folder in Drive,
// and each <patch.txt> a "PR-N changes.txt" made after it, oldest first (see the backup skill).
// Download them with the Google Drive connector (download_file_content saves each to a file).
// --compare also checks the result against this checkout, file by file (for testing the backups).
//
// Images and other binary files are not in the backups (the Drive connector can't carry them):
// the tool lists them, and they come back from GitHub or a copy of the images.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const compare = process.argv.includes('--compare');
const [outDir, snapshot, ...patches] = args;
if (!outDir || !snapshot) { console.log('Usage: node tools/restore.js <empty folder> <snapshot.txt> [<patch.txt> ...] [--compare]'); process.exit(1); }
const out = path.resolve(outDir);
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.log(`${out} is not empty. Give an empty or new folder, so nothing is overwritten.`); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// 1. Unpack the snapshot: each file starts with a line "===== FILE: <path> =====", and files are
//    joined with one newline (tools/drive-bundle.js).
const text = fs.readFileSync(snapshot, 'utf8');
const header = text.match(/^Shardfall full snapshot at commit (.+)$/m);
if (!header) { console.log(`${snapshot} doesn't look like a Shardfall snapshot.`); process.exit(1); }
console.log(`Snapshot: commit ${header[1]}`);
const marks = [...text.matchAll(/^===== FILE: (.+) =====\n/gm)];
const missing = new Set((text.match(/^Binary files not included: (.+)$/m)?.[1] || '').split(', ').filter(Boolean));
marks.forEach((m, i) => {
  const start = m.index + m[0].length;
  const end = i + 1 < marks.length ? marks[i + 1].index - 1 : text.length;   // drop the joining newline
  const f = path.join(out, m[1]);
  if (!f.startsWith(out)) throw new Error(`Unsafe path in the snapshot: ${m[1]}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text.slice(start, end));
});
console.log(`  ${marks.length} files unpacked`);

// 2. Apply each patch in order. Binary changes can't be applied from text and are listed instead.
for (const p of patches) {
  const t = fs.readFileSync(p, 'utf8');
  const name = t.match(/^Shardfall changes (.+)$/m)?.[1] || path.basename(p);
  const diffAt = t.search(/^diff --git /m);
  if (diffAt < 0) { console.log(`Patch ${name}: no changes in it`); continue; }
  const sections = t.slice(diffAt).split(/^(?=diff --git )/m);
  const kept = [];
  for (const s of sections) {
    if (/^Binary files .* differ$/m.test(s) || /^GIT binary patch$/m.test(s)) {
      const f = s.match(/^diff --git a\/(.+?) b\//)?.[1];
      if (f) missing.add(f);
    } else kept.push(s);
  }
  const tmp = path.join(out, '.restore-patch.diff');
  fs.writeFileSync(tmp, kept.join(''));
  try {
    execFileSync('git', ['apply', '--whitespace=nowarn', tmp], { cwd: out, stdio: 'pipe' });
    console.log(`Patch ${name}: applied`);
  } catch (e) {
    console.log(`Patch ${name}: could NOT be applied. Is it the next one after the snapshot, and are the patches in order?\n${String(e.stderr || e.message).trim()}`);
    fs.unlinkSync(tmp);
    process.exit(1);
  }
  fs.unlinkSync(tmp);
}

// 3. Images and other binary files that the backups don't hold.
const stillMissing = [...missing].filter(f => !fs.existsSync(path.join(out, f)));
if (stillMissing.length) console.log(`\nNot in the backups (images and other binary files; copy them from GitHub): ${stillMissing.join(', ')}`);

// 4. Prove it: every test must pass in the restored folder.
console.log('\nRunning every test in the restored game...');
let ok = true;
try {
  const r = execFileSync(process.execPath, ['tools/test-all.js'], { cwd: out, encoding: 'utf8', maxBuffer: 64 << 20 });
  console.log(r.trim().split('\n').slice(-1)[0]);
} catch (e) {
  ok = false;
  console.log(String(e.stdout || '').trim().split('\n').filter(l => /FAIL/.test(l)).join('\n') || e.message);
}

// 5. Optionally, compare with this checkout file by file.
if (compare) {
  const here = path.join(__dirname, '..');
  const files = execFileSync('git', ['ls-files'], { cwd: here, encoding: 'utf8' }).split('\n').filter(Boolean);
  const diff = [];
  for (const f of files) {
    if (stillMissing.includes(f)) continue;
    const a = path.join(here, f), b = path.join(out, f);
    if (!fs.existsSync(b)) diff.push(`missing: ${f}`);
    else if (!fs.readFileSync(a).equals(fs.readFileSync(b))) diff.push(`different: ${f}`);
  }
  console.log(diff.length ? `\nCompared with this checkout: ${diff.length} difference(s)\n  ${diff.join('\n  ')}` : '\nCompared with this checkout: every file is identical');
  if (diff.length) ok = false;
}
console.log(ok ? '\nRESTORE WORKED' : '\nRESTORE HAS PROBLEMS (see above)');
process.exit(ok ? 0 : 1);
