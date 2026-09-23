const fs = require('fs');
let content = fs.readFileSync('public/script.js', 'utf8');

const replacement = `          \${cat.items.map(item => {
            const isAgotado = typeof item.stock === 'number' && item.stock <= 0;
            return \`
            <div class="pcard" \${isAgotado ? 'style="opacity:0.6; pointer-events:none;"' : ''}>
              <img src="\${item.img}" class="pimg" alt="\${escapeHtml(item.name)}" loading="lazy">
              <div class="pinfo">
                <div class="pname">\${escapeHtml(item.name)}</div>
                <div class="pdesc">\${escapeHtml(item.desc)}</div>
                <div class="pprice">$\${item.price.toLocaleString('es-AR')}</div>
              </div>
              <div class="pright">
                \${isAgotado 
                  ? '<span style="color:var(--red);font-size:12px;font-weight:700;">Agotado</span>' 
                  : \`<button class="add-btn" aria-label="Agregar al pedido" data-add="\${item.id}">+</button>\`}
              </div>
            </div>
            \`
          }).join('')}`;

const targetRegex = /\s*\$\{\s*cat\.items\.map\(item => `[\s\S]*?<div class="pcard">[\s\S]*?<div class="pright">[\s\S]*?<\/div>[\s\S]*?<\/div>\s*`\)\.join\(''\)\s*\}/;

if(targetRegex.test(content)) {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync('public/script.js', content, 'utf8');
  console.log('Fixed script.js');
} else {
  console.log('Regex failed');
}
