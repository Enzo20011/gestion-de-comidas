const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const navMobile = `      <div class="cats" id="catsMobile">
        <button class="cat active" onclick="switchCat('combos',this)">🔥 Combos</button>
        <button class="cat" onclick="switchCat('hamburguesas',this)">🍔 Hamburguesas</button>
        <button class="cat" onclick="switchCat('sandwiches',this)">🥪 Sandwiches</button>
        <button class="cat" onclick="switchCat('milanesas',this)">🔥 Milanesas</button>
        <button class="cat" onclick="switchCat('papas',this)">🍟 Papas Fritas</button>
        <button class="cat" onclick="switchCat('bebidas',this)">🥤 Bebidas</button>
      </div>`;

const navSidebar = `    <nav class="sidebar-nav">
      <button class="sidebar-item active" onclick="switchCat('combos',this)">🔥 Combos</button>
      <button class="sidebar-item" onclick="switchCat('hamburguesas',this)">🍔 Hamburguesas</button>
      <button class="sidebar-item" onclick="switchCat('sandwiches',this)">🥪 Sandwiches</button>
      <button class="sidebar-item" onclick="switchCat('milanesas',this)">🔥 Milanesas</button>
      <button class="sidebar-item" onclick="switchCat('papas',this)">🍟 Papas Fritas</button>
      <button class="sidebar-item" onclick="switchCat('bebidas',this)">🥤 Bebidas</button>
    </nav>`;

const mainContent = `
    <!-- COMBOS -->
    <section id="sec-combos" class="active-sec">
      <div class="promo">
        <div class="promo-badge">★ Favoritos 🔥</div>
        <div class="promo-title">COMBOS <em>WOW</em></div>
        <div class="promo-desc">¡Dejate tentar por nuestras mejores combinaciones!</div>
      </div>
      <div class="sec-title"><h2>Combos 🔥</h2><span>Combos para ahorrar</span></div>
      <div class="products">
        <div class="pcard">
          <img src="assets/combo_profesional.png" class="pimg" alt="Combo 1">
          <div class="pinfo">
            <div class="pname">Combo 1</div>
            <div class="pdesc">Hamburguesa Completa con Papas Fritas 😋 Tomate, lechuga, jamón, queso, huevo y carne de 110g</div>
            <div class="pprice">$10.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('combo-1','Combo 1',10000,'🔥')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/combo_profesional.png" class="pimg" alt="Combo DC">
          <div class="pinfo">
            <div class="pname">Combo DC</div>
            <div class="pdesc">Hamburguesa Doble carne, cheddar con Papas Fritas</div>
            <div class="pprice">$12.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('combo-dc','Combo DC',12000,'🔥')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/combo_profesional.png" class="pimg" alt="Combo 2">
          <div class="pinfo">
            <div class="pname">Combo 2</div>
            <div class="pdesc">Hamburguesas completas x2 con Papas Fritas grandes</div>
            <div class="pprice">$17.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('combo-2','Combo 2',17000,'🔥')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/combo_profesional.png" class="pimg" alt="Combo Cheddar">
          <div class="pinfo">
            <div class="pname">Combo Cheddar</div>
            <div class="pdesc">Hamburguesas cheddar x2 con Papas Fritas grandes</div>
            <div class="pprice">$21.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('combo-ched','Combo Cheddar',21000,'🥓')">+</button>
          </div>
        </div>
      </div>
    </section>

    <!-- HAMBURGUESAS -->
    <section id="sec-hamburguesas" class="hidden-sec">
      <div class="sec-title"><h2>Hamburguesas 🍔</h2><span>100% Carne Casera</span></div>
      <div class="products">
        <div class="pcard">
          <img src="assets/hamburguesa_profesional.png" class="pimg" alt="Hamburguesa Completa">
          <div class="pinfo">
            <div class="pname">Completa</div>
            <div class="pdesc">Tomate, lechuga, jamón, queso, huevo y carne de 110g</div>
            <div class="pprice">$7.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('h-completa','Completa',7000,'🍔')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/hamburguesa_profesional.png" class="pimg" alt="Doble Carne">
          <div class="pinfo">
            <div class="pname">Doble Carne</div>
            <div class="pdesc">Tomate, lechuga, doble carne de 110g, jamón, queso, huevo</div>
            <div class="pprice">$9.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('h-dc','Doble Carne',9000,'🍔')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/hamburguesa_profesional.png" class="pimg" alt="Cheddar">
          <div class="pinfo">
            <div class="pname">Cheddar</div>
            <div class="pdesc">Doble carne de 110g, doble cheddar, bacon...</div>
            <div class="pprice">$10.500</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('h-che','Cheddar',10500,'🧀')">+</button>
          </div>
        </div>
      </div>
    </section>

    <!-- SANDWICHES -->
    <section id="sec-sandwiches" class="hidden-sec">
      <div class="sec-title"><h2>Sandwiches 🥪</h2><span>Los Clásicos</span></div>
      <div class="products">
        <div class="pcard">
          <img src="assets/lomito_profesional.png" class="pimg" alt="Lomito Grande">
          <div class="pinfo">
            <div class="pname">Lomito Grande</div>
            <div class="pdesc">Lomo, lechuga, tomate, jamón, queso, huevo</div>
            <div class="pprice">$12.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('s-lom','Lomito Grande',12000,'🥪')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/lomito_profesional.png" class="pimg" alt="Lomito Gratinado">
          <div class="pinfo">
            <div class="pname">Lomito Gratinado 🧀</div>
            <div class="pdesc">Lomito espectacular + mozzarella fresca fundida</div>
            <div class="pprice">$14.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('s-grat','Lomito Gratinado',14000,'🥪')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/milanesa_profesional.png" class="pimg" alt="Sandwich de Mila">
          <div class="pinfo">
            <div class="pname">Sandwich de Mila</div>
            <div class="pdesc">Pan sanguchero de 20cm, milanesa de carne cortada a cuchillo</div>
            <div class="pprice">$10.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('s-mila','Sándwich de Mila',10000,'🥪')">+</button>
          </div>
        </div>
      </div>
    </section>

    <!-- MILANESAS -->
    <section id="sec-milanesas" class="hidden-sec">
      <div class="sec-title"><h2>Milanesas al Plato 🔥</h2><span>Gigantes y Ricas</span></div>
      <div class="products">
        <div class="pcard">
          <img src="assets/milanesa_profesional.png" class="pimg" alt="Mila Napo">
          <div class="pinfo">
            <div class="pname">Milanesa Napolitana</div>
            <div class="pdesc">Salsa especial, queso, jamón. Riquísima.</div>
            <div class=\"pprice\">$12.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('m-napo','Milanesa Napolitana',12000,'🔥')">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/milanesa_profesional.png" class="pimg" alt="Mila a caballo">
          <div class="pinfo">
            <div class="pname">Milanesa a Caballo</div>
            <div class="pdesc">Con dós súper huevos fritos encima.</div>
            <div class="pprice">$10.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="openCustom('m-cab','Milanesa a Caballo',10000,'🔥')">+</button>
          </div>
        </div>
      </div>
    </section>

    <!-- PAPAS FRITAS -->
    <section id="sec-papas" class="hidden-sec">
      <div class="sec-title"><h2>Cajas de Papas Fritas 🍟</h2><span>Crujientes, Doradas</span></div>
      <div class="products">
        <div class="pcard">
          <img src="assets/papas_profesional.png" class="pimg" alt="Papas Tradicionales">
          <div class="pinfo">
            <div class="pname">Porción Tradicional</div>
            <div class="pdesc">Papas fritas grandes doraditas con sal</div>
            <div class="pprice">$4.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="quickAdd('p-trad','Papas Tradicionales',4000,'🍟',event)">+</button>
          </div>
        </div>
        <div class="pcard">
          <img src="assets/papas_profesional.png" class="pimg" alt="Papas Gratinadas">
          <div class="pinfo">
            <div class="pname">Porción Gratinada</div>
            <div class="pdesc">Papas fritas rebosantes en cheddar y verdeo/bacon</div>
            <div class="pprice">$7.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="quickAdd('p-grat','Papas Gratinadas',7000,'🍟',event)">+</button>
          </div>
        </div>
      </div>
    </section>

    <!-- BEBIDAS -->
    <section id="sec-bebidas" class="hidden-sec">
      <div class="sec-title"><h2>Bebidas 🥤</h2><span>Bien frías</span></div>
      <div class="products">
        <div class="pcard">
          <div class="pemoji">🥤</div>
          <div class="pinfo">
            <div class="pname">Coca Cola 1 Litro</div>
            <div class="pdesc">Línea original</div>
            <div class="pprice">$3.000</div>
          </div>
          <div class="pright">
            <button class="add-btn" onclick="quickAdd('b-coca','Coca Cola 1L',3000,'🥤',event)">+</button>
          </div>
        </div>
      </div>
    </section>
`;

html = html.replace(/<div class="cats" id="catsMobile">[\s\S]*?<\/div>/, navMobile);
html = html.replace(/<nav class="sidebar-nav">[\s\S]*?<\/nav>/, navSidebar);
html = html.replace(/<main class="main-content">[\s\S]*?<\/main>/, '<main class="main-content">\n' + mainContent + '\n  </main>');

fs.writeFileSync('index.html', html);
console.log('Replaced successfully');
