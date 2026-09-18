// Rebuild the browser styles after editing either CSS source file.
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['portfolio-base', 'one-page']) {
 const source = path.join(__dirname, '..', 'css', name + '.css');
 const css = fs.readFileSync(source, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').trim();
 fs.writeFileSync(source.replace('.css', '.min.css'), css);
}
