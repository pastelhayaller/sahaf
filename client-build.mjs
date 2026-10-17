import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const assets = [
  ['app.js', 'app.min.js', 'js'],
  ['styles.css', 'styles.min.css', 'css'],
  ['bilgilendirme.css', 'bilgilendirme.min.css', 'css'],
  ['fonts.css', 'fonts.min.css', 'css'],
];

for (const [input, output, loader] of assets) {
  const source = await readFile(input, 'utf8');
  const result = await transform(source, {
    loader,
    minify: true,
    legalComments: 'eof',
  });
  await writeFile(output, result.code);
}
