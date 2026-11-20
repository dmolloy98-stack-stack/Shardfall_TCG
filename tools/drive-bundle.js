// Makes the one-file Google Drive backups (see the backup skill).
//   node tools/drive-bundle.js patch <from> <to> <out.txt>   what changed between two commits
//   node tools/drive-bundle.js snapshot <out.txt>            every text file in the project
// A patch lists the commits, the files touched and the exact line changes (git's diff format).
// A snapshot holds each text file in full, one after another, each starting with a line
//   ===== FILE: <path> =====
// so any file can be copied back out by hand. Images and other binary files are listed but left
// out (they can't go through the Drive connector).
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 });
const [mode, ...args] = process.argv.slice(2);

if (mode === 'patch') {
  const [from, to, out] = args;
  if (!out) throw new Error('usage: patch <from> <to> <out>');
  const head = `Shardfall changes ${from}..${to}\n\nCommits:\n${git('log', '--format=  %h %ad %s', '--date=short', `${from}..${to}`)}\nFiles:\n${git('diff', '--stat=200', `${from}..${to}`)}\n`;
  fs.writeFileSync(out, head + '\n' + git('diff', `${from}..${to}`));
  console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
} else if (mode === 'snapshot') {
  const [out] = args;
  if (!out) throw new Error('usage: snapshot <out>');
  const commit = git('log', '-1', '--format=%h %ad %s', '--date=short').trim();
  const files = git('ls-files').split('\n').filter(Boolean);
  const parts = [`Shardfall full snapshot at commit ${commit}\nEach file starts with a line "===== FILE: <path> =====".\n`];
  const skipped = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(root, f));
    if (buf.includes(0)) { skipped.push(f); continue; }   // binary
    parts.push(`===== FILE: ${f} =====\n${buf.toString('utf8')}`);
  }
  if (skipped.length) parts.splice(1, 0, `Binary files not included: ${skipped.join(', ')}\n`);
  fs.writeFileSync(out, parts.join('\n'));
  console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${files.length - skipped.length} files, ${skipped.length} binary skipped`);
} else {
  console.log('usage: node tools/drive-bundle.js patch <from> <to> <out> | snapshot <out>');
}
