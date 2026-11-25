function getCart() {
  return JSON.parse(localStorage.getItem('cube_keys_cart')) || [];
}

function saveCart(cart) {
  localStorage.setItem('cube_keys_cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const cart = getCart();
  const cartCountElements = document.querySelectorAll('#cart-count');
  cartCountElements.forEach(el => {
    el.textContent = cart.length;
  });
}

// -------------------------------------------------------------
// TELA 1: HOME (index.html)
// -------------------------------------------------------------
async function initHome() {
  const productsGrid = document.getElementById('products-grid');
  if (!productsGrid) return;

  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  let allProducts = [];

  const jsonPath = window.location.pathname.includes('/pages/') ? '../data/products.json' : 'data/products.json';

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) throw new Error('Erro ao buscar catálogo');
    allProducts = await response.json();
    renderProducts(allProducts);
  } catch (error) {
    console.error(error);
    productsGrid.innerHTML = `<p style="color: #ef4444; grid-column: 1/-1; text-align: center;">Erro ao carregar o catálogo.</p>`;
  }

  function renderProducts(products) {
    productsGrid.innerHTML = '';
    if (products.length === 0) {
      productsGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Nenhum jogo encontrado.</p>`;
      return;
    }

    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'card';
      const price = product.discountPrice || product.price;
      const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

      const pageLink = `pages/produto.html?id=${product.id}`;

      card.innerHTML = `
        <a href="${pageLink}"><img src="${product.image}" alt="${product.title}" loading="lazy"></a>
        <div class="card-content">
          <span class="card-tag">${product.category} • ${product.platform}</span>
          <h3><a href="${pageLink}" style="color: inherit; text-decoration: none;">${product.title}</a></h3>
          <p>${product.description}</p>
          <div class="card-footer">
            <span class="price">${formattedPrice}</span>
            <button class="btn-buy" onclick="addToCart(${product.id})">Adicionar</button>
          </div>
        </div>
      `;
      productsGrid.appendChild(card);
    });
  }

  window.addToCart = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (product) {
      const cart = getCart();
      cart.push(product);
      saveCart(cart);
      alert(`" ${product.title} " foi adicionado ao seu carrinho!`);
    }
  };

  function applyFilters() {
    const term = searchInput.value.toLowerCase().trim();
    const cat = categoryFilter.value;
    const filtered = allProducts.filter(p => {
      const matchTerm = p.title.toLowerCase().includes(term) || p.description.toLowerCase().includes(term);
      const matchCat = cat === 'todos' || p.category === cat;
      return matchTerm && matchCat;
    });
    renderProducts(filtered);
  }

  searchInput.addEventListener('input', applyFilters);
  categoryFilter.addEventListener('change', applyFilters);
}

// -------------------------------------------------------------
// DETALHES DO PRODUTO (pages/produto.html)
// -------------------------------------------------------------
async function initProduto() {
  const container = document.getElementById('product-detail-container');
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const productId = parseInt(urlParams.get('id'));

  if (!productId) {
    window.location.href = '../index.html';
    return;
  }

  try {
    const response = await fetch('../data/products.json');
    if (!response.ok) throw new Error('Erro ao carregar produto');
    const products = await response.json();
    const product = products.find(p => p.id === productId);

    if (!product) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center;">Jogo não encontrado.</p>`;
      return;
    }

    const price = product.discountPrice || product.price;
    const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

    container.innerHTML = `
      <div class="product-detail-img">
        <img src="${product.image}" alt="${product.title}">
      </div>
      <div class="product-detail-info">
        <h2>${product.title}</h2>
        <div class="tags-box">
          <span class="card-tag">${product.category}</span>
          <span class="card-tag" style="background-color: #0284c7;">Plataforma: ${product.platform}</span>
        </div>
        <p class="description">${product.description}</p>
        
        <div class="product-detail-price-box">
          <div>
            <span class="price-label">Preço Digital:</span>
            <div class="price-value">${formattedPrice}</div>
          </div>
          <button id="add-detail-btn" class="btn-primary" style="padding: 12px 24px; font-size: 1.1rem;">
            Adicionar ao Carrinho
          </button>
        </div>

        <a href="../index.html" class="btn-secondary">← Voltar para a Loja</a>
      </div>

      ${product.trailer ? `
        <div class="product-trailer-box">
          <h3 class="product-trailer-title">Trailer Oficial</h3>
          <div class="product-trailer-frame">
            <iframe
              src="https://www.youtube.com/embed/${product.trailer}"
              title="Trailer de ${product.title}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              loading="lazy"
            ></iframe>
          </div>
        </div>
      ` : ''}
    `;

    document.getElementById('add-detail-btn').addEventListener('click', () => {
      const cart = getCart();
      cart.push(product);
      saveCart(cart);
      alert(`" ${product.title} " foi adicionado ao seu carrinho!`);
    });

  } catch (error) {
    console.error(error);
    container.innerHTML = `<p style="color: #ef4444; text-align: center;">Erro ao carregar detalhes do jogo.</p>`;
  }
}

// -------------------------------------------------------------
// TELA 2: CARRINHO (pages/carrinho.html)
// -------------------------------------------------------------
function initCarrinho() {
  const cartItemsList = document.getElementById('cart-items');
  if (!cartItemsList) return;

  const cartTotal = document.getElementById('cart-total');

  function renderCartPage() {
    const cart = getCart();
    cartItemsList.innerHTML = '';

    if (cart.length === 0) {
      cartItemsList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Seu carrinho está vazio.</p>';
      cartTotal.textContent = 'R$ 0,00';
      return;
    }

    let total = 0;
    cart.forEach((item, index) => {
      const price = item.discountPrice || item.price;
      total += price;
      const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

      const itemRow = document.createElement('div');
      itemRow.className = 'cart-item-row';
      itemRow.innerHTML = `
        <div>
          <strong>${item.title}</strong> (${item.platform})
          <div style="color: var(--price-color); font-weight: bold;">${formattedPrice}</div>
        </div>
        <button class="btn-secondary" onclick="removeFromCartPage(${index})">Remover</button>
      `;
      cartItemsList.appendChild(itemRow);
    });

    cartTotal.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
  }

  window.removeFromCartPage = function(index) {
    const cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
    renderCartPage();
  };

  renderCartPage();
}

// -------------------------------------------------------------
// TELA 3: CHECKOUT (pages/checkout.html)
// -------------------------------------------------------------
function initCheckout() {
  const checkoutForm = document.getElementById('checkout-page-form');
  if (!checkoutForm) return;

  const cart = getCart();

  if (cart.length === 0) {
    alert('Seu carrinho está vazio. Adicione pelo menos um jogo antes de finalizar a compra!');
    window.location.href = '../index.html';
    return;
  }

  const itemsPreview = document.getElementById('checkout-items-preview');
  const checkoutTotal = document.getElementById('checkout-total');

  let total = 0;
  itemsPreview.innerHTML = '';
  cart.forEach(item => {
    const price = item.discountPrice || item.price;
    total += price;
    const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
    
    const p = document.createElement('p');
    p.style.margin = '4px 0';
    p.innerHTML = `• ${item.title} - <span style="color: var(--price-color);">${formattedPrice}</span>`;
    itemsPreview.appendChild(p);
  });

  checkoutTotal.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);

  checkoutForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;

    let keysList = cart.map(item => {
      const key = Math.random().toString(36).substring(2, 7).toUpperCase() + '-' +
                  Math.random().toString(36).substring(2, 7).toUpperCase() + '-' +
                  Math.random().toString(36).substring(2, 7).toUpperCase();
      return `🎮 ${item.title}: ${key}`;
    }).join('\n');

    alert(`Sucesso! Compra Finalizada!\n\nObrigado, ${name}.\nAs chaves foram geradas e enviadas para: ${email}\n\nChaves Adquiridas:\n${keysList}`);

    localStorage.removeItem('cube_keys_cart');
    updateCartCount();
    window.location.href = '../index.html';
  });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initHome();
  initProduto();
  initCarrinho();
  initCheckout();
});