import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { transform } from 'esbuild';

const assets = [
  ['styles.css', 'styles.min.css'],
  ['bilgilendirme.css', 'bilgilendirme.min.css'],
  ['fonts.css', 'fonts.min.css'],
];

const app = await readFile('app.min.js', 'utf8');
await transform(app, { loader: 'js' });
assert.match(app, /\.\/db\.js\?v=024/);
assert.match(app, /\.\/ui-helpers\.js\?v=035/);

for (const [source, minified] of assets) {
  const [sourceStat, minifiedStat] = await Promise.all([stat(source), stat(minified)]);
  assert.ok(minifiedStat.size > 0, `${minified} is empty`);
  assert.ok(minifiedStat.size < sourceStat.size, `${minified} is not smaller`);
}

console.log('Client minification outputs parse, preserve imports, and reduce CSS size.');

// Published artifacts must be rebuilt whenever readable source changes.
for (const [source, output, loader] of [['app.js','app.min.js','js'], ...assets.map(([a,b]) => [a,b,'css'])]) {
  const expected = await transform(await readFile(source, 'utf8'), {loader, minify:true, legalComments:'eof'});
  assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n','\n'), expected.code, output + ' is stale');
}
