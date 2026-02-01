import fs from 'node:fs';
import pako from 'pako';

const file = process.argv[2];
if (!file) process.exit(0);

let content = fs.readFileSync(file, 'utf8');

function toBase64Url(u8) {
  return Buffer.from(u8)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function toMermaidLiveUrl(code) {
  const state = {
    code,
    mermaid: { theme: 'default' }
  };

  const json = JSON.stringify(state);

  // Mermaid Live uses UTF-8 bytes of the JSON string before deflate. 
  const bytes = new TextEncoder().encode(json);

  const compressed = pako.deflate(bytes, { level: 9 });
  const encoded = toBase64Url(compressed);

  return `https://mermaid.live/edit#pako:${encoded}`;
}

let matchCount = 0;

content = content.replace(
  /```mermaid\s*\n([\s\S]*?)\n```[\t ]*\n\n(?:_Edit in Mermaid Live:.*\n\n)?<!-- mermaid-live-link -->/g,
  (fullMatch, diagramBody) => {
    matchCount++;

    const source = diagramBody.trim();
    const url = toMermaidLiveUrl(source);

    return (
      '```mermaid\n' +
      source +
      '\n```\n\n' +
      `_Edit in Mermaid Live: ${url}_\n\n` +
      '<!-- mermaid-live-link -->'
    );
  }
);

fs.writeFileSync(file, content);
console.log('Mermaid blocks updated:', matchCount);
