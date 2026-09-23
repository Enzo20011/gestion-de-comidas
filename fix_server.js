const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// The incorrect block starts at line 9 and ends at line 37.
// I will split by lines and manipulate the array.
const lines = content.split('\n');

const startIndex = 8; // Line 9 (0-indexed) "const app = express();"
let endIndex = -1;
for (let i = startIndex; i < lines.length; i++) {
  if (lines[i].includes('app.listen(port')) {
    endIndex = i;
    break;
  }
}

if (endIndex !== -1) {
  const block = lines.splice(startIndex, endIndex - startIndex + 1);
  lines.splice(startIndex, 0, 'const PORT = process.env.PORT || 8765;');
  
  // Find where to append the automation block (right before the last app.listen)
  let listenIndex = lines.length - 1;
  while (listenIndex >= 0 && !lines[listenIndex].includes('app.listen(PORT')) {
    listenIndex--;
  }
  
  if (listenIndex !== -1) {
    // We only need the AUTOMATIZACIONES part, so slice from 2 to end - 2
    // But it's easier to just take the lines between `// ── AUTOMATIZACIONES` and the end of the interval
    const autoStartIndex = block.findIndex(l => l.includes('AUTOMATIZACIONES'));
    const autoEndIndex = block.findIndex(l => l.includes('}, 60000);'));
    
    if (autoStartIndex !== -1 && autoEndIndex !== -1) {
      const autoBlock = block.slice(autoStartIndex, autoEndIndex + 1);
      lines.splice(listenIndex - 1, 0, ...autoBlock, '');
    }
  }
  
  fs.writeFileSync('server.js', lines.join('\n'), 'utf8');
  console.log('Fixed server.js');
} else {
  console.log('Could not find end of block');
}
