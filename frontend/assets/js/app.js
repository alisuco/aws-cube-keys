// =============================================================
// Cube Keys — front-end da loja headless
// Consome a API serverless (GitHub Pages → API Gateway → Lambda)
// A URL da API vem de assets/js/config.js (CUBE_API_BASE_URL).
// =============================================================

// -------------------------------------------------------------
// UTILITÁRIOS
// -------------------------------------------------------------
const CART_KEY = 'cube_keys_cart';
const API_BASE_URL = (window.CUBE_API_BASE_URL || '').replace(/\/$/, '');

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatPrice = (value) => brl.format(value);
const effectivePrice = (item) => item.discountPrice || item.price;

// Escapa texto vindo da API antes de usar em innerHTML
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chamada à API com tratamento de erro padronizado
async function api(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('CUBE_API_BASE_URL nao configurada em assets/js/config.js');
  }
  const response = await fetch(`${API_BASE_URL}/api${path}`, options);
  if (!response.ok) {
    const error = new Error(`Erro ${response.status} em ${path}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Mensagens na tela (substitui os alert())
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    Object.assign(container.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '1000',
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    background: type === 'error' ? '#ef4444' : '#1e293b',
    color: '#f8fafc',
    border: `1px solid ${type === 'error' ? '#ef4444' : '#00f2fe'}`,
    borderRadius: '8px',
    padding: '12px 18px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    maxWidth: '320px',
  });
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// -------------------------------------------------------------
// CARRINHO (localStorage)
// Guarda só o necessário para exibir. No pedido, só os IDs são
// enviados; o preço real é sempre buscado pelo servidor.
// -------------------------------------------------------------
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().length;
  document.querySelectorAll('#cart-count').forEach((el) => {
    el.textContent = count;
  });
}

function addProductToCart(product) {
  const cart = getCart();
  cart.push({
    id: product.id,
    title: product.title,
    platform: product.platform,
    price: product.price,
    discountPrice: product.discountPrice,
  });
  saveCart(cart);
  showToast(`"${product.title}" foi adicionado ao carrinho!`);
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

  try {
    allProducts = await api('/products');
    renderProducts(allProducts);
  } catch (error) {
    console.error(error);
    productsGrid.innerHTML =
      '<p style="color: #ef4444; grid-column: 1/-1; text-align: center;">Erro ao carregar o catálogo.</p>';
  }

  function renderProducts(products) {
    productsGrid.innerHTML = '';
    if (products.length === 0) {
      productsGrid.innerHTML =
        '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Nenhum jogo encontrado.</p>';
      return;
    }

    products.forEach((product) => {
      const card = document.createElement('div');
      card.className = 'card';
      const pageLink = `pages/produto.html?id=${encodeURIComponent(product.id)}`;

      card.innerHTML = `
        <a href="${pageLink}"><img src="${esc(product.image)}" alt="${esc(product.title)}" loading="lazy"></a>
        <div class="card-content">
          <span class="card-tag">${esc(product.category)} • ${esc(product.platform)}</span>
          <h3><a href="${pageLink}" style="color: inherit; text-decoration: none;">${esc(product.title)}</a></h3>
          <p>${esc(product.description)}</p>
          <div class="card-footer">
            <span class="price">${formatPrice(effectivePrice(product))}</span>
            <button class="btn-buy" data-id="${esc(product.id)}">Adicionar</button>
          </div>
        </div>
      `;
      productsGrid.appendChild(card);
    });
  }

  // Um único listener para todos os botões "Adicionar"
  productsGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-buy');
    if (!button) return;
    const product = allProducts.find((p) => p.id === Number(button.dataset.id));
    if (product) addProductToCart(product);
  });

  function applyFilters() {
    const term = searchInput.value.toLowerCase().trim();
    const cat = categoryFilter.value;
    const filtered = allProducts.filter((p) => {
      const matchTerm =
        p.title.toLowerCase().includes(term) || p.description.toLowerCase().includes(term);
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
  const productId = parseInt(urlParams.get('id'), 10);

  if (!productId) {
    window.location.href = '../index.html';
    return;
  }

  try {
    let product;
    try {
      product = await api(`/products/${productId}`);
    } catch (error) {
      if (error.status === 404) {
        container.innerHTML =
          '<p style="color: var(--text-muted); text-align: center;">Jogo não encontrado.</p>';
        return;
      }
      throw error;
    }

    container.innerHTML = `
      <div class="product-detail-img">
        <img src="${esc(product.image)}" alt="${esc(product.title)}">
      </div>
      <div class="product-detail-info">
        <h2>${esc(product.title)}</h2>
        <div class="tags-box">
          <span class="card-tag">${esc(product.category)}</span>
          <span class="card-tag" style="background-color: #0284c7;">Plataforma: ${esc(product.platform)}</span>
        </div>
        <p class="description">${esc(product.description)}</p>

        <div class="product-detail-price-box">
          <div>
            <span class="price-label">Preço Digital:</span>
            <div class="price-value">${formatPrice(effectivePrice(product))}</div>
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
              src="https://www.youtube.com/embed/${encodeURIComponent(product.trailer)}"
              title="Trailer de ${esc(product.title)}"
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
      addProductToCart(product);
    });
  } catch (error) {
    console.error(error);
    container.innerHTML =
      '<p style="color: #ef4444; text-align: center;">Erro ao carregar detalhes do jogo.</p>';
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
      cartItemsList.innerHTML =
        '<p style="color: var(--text-muted); text-align: center;">Seu carrinho está vazio.</p>';
      cartTotal.textContent = formatPrice(0);
      return;
    }

    let total = 0;
    cart.forEach((item, index) => {
      const price = effectivePrice(item);
      total += price;

      const itemRow = document.createElement('div');
      itemRow.className = 'cart-item-row';
      itemRow.innerHTML = `
        <div>
          <strong>${esc(item.title)}</strong> (${esc(item.platform)})
          <div style="color: var(--price-color); font-weight: bold;">${formatPrice(price)}</div>
        </div>
        <button class="btn-secondary" data-index="${index}">Remover</button>
      `;
      cartItemsList.appendChild(itemRow);
    });

    cartTotal.textContent = formatPrice(total);
  }

  cartItemsList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-index]');
    if (!button) return;
    const cart = getCart();
    cart.splice(Number(button.dataset.index), 1);
    saveCart(cart);
    renderCartPage();
  });

  renderCartPage();
}

// -------------------------------------------------------------
// TELA 3: CHECKOUT (pages/checkout.html)
// Fluxo: POST /api/orders → recebe orderId na hora (PENDING) →
// o back-end processa por eventos → o front consulta
// GET /api/orders/{id} até o pedido ficar COMPLETED.
// -------------------------------------------------------------
function renderOrderStatus(container, order) {
  if (order.status === 'COMPLETED') {
    const keys = (order.items || [])
      .map(
        (item) => `
          <li style="margin: 8px 0;">
            🎮 <strong>${esc(item.title)}</strong> (${esc(item.platform)})<br>
            <code>${esc(item.key)}</code>
          </li>`
      )
      .join('');
    container.innerHTML = `
      <div class="checkout-form-card">
        <h3>Compra finalizada!</h3>
        <p>Pedido <code>${esc(order.orderId)}</code>. Uma cópia das chaves foi enviada para o seu e-mail.</p>
        <ul style="list-style: none; padding: 0;">${keys}</ul>
        <a href="../index.html" class="btn-secondary">← Voltar para a Loja</a>
      </div>`;
    return;
  }

  if (order.status === 'FAILED') {
    container.innerHTML = `
      <div class="checkout-form-card">
        <h3 style="color: #ef4444;">Não foi possível concluir o pedido</h3>
        <p>Pedido <code>${esc(order.orderId)}</code>. Tente novamente em instantes.</p>
        <a href="carrinho.html" class="btn-secondary">← Voltar ao Carrinho</a>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="checkout-form-card">
      <h3>Processando seu pedido...</h3>
      <p>Pedido <code>${esc(order.orderId)}</code>. Estamos gerando as suas chaves.</p>
    </div>`;
}

function pollOrder(orderId, container) {
  const MAX_ATTEMPTS = 20;
  const INTERVAL_MS = 2000;
  let attempts = 0;

  async function check() {
    attempts += 1;
    try {
      const order = await api(`/orders/${encodeURIComponent(orderId)}`);
      renderOrderStatus(container, order);
      if (order.status === 'COMPLETED' || order.status === 'FAILED') return;
    } catch (error) {
      console.error(error);
    }

    if (attempts >= MAX_ATTEMPTS) {
      container.innerHTML = `
        <div class="checkout-form-card">
          <h3>Seu pedido está demorando mais que o normal</h3>
          <p>Guarde o número do pedido <code>${esc(orderId)}</code>. As chaves também serão enviadas por e-mail.</p>
          <a href="../index.html" class="btn-secondary">← Voltar para a Loja</a>
        </div>`;
      return;
    }
    setTimeout(check, INTERVAL_MS);
  }

  check();
}

function initCheckout() {
  const checkoutForm = document.getElementById('checkout-page-form');
  if (!checkoutForm) return;

  const container = checkoutForm.closest('.checkout-container');
  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="checkout-form-card">
        <h3>Seu carrinho está vazio</h3>
        <p>Adicione pelo menos um jogo antes de finalizar a compra.</p>
        <a href="../index.html" class="btn-secondary">← Ir para a Loja</a>
      </div>`;
    return;
  }

  const itemsPreview = document.getElementById('checkout-items-preview');
  const checkoutTotal = document.getElementById('checkout-total');

  let total = 0;
  itemsPreview.innerHTML = '';
  cart.forEach((item) => {
    const price = effectivePrice(item);
    total += price;
    const p = document.createElement('p');
    p.style.margin = '4px 0';
    p.innerHTML = `• ${esc(item.title)} - <span style="color: var(--price-color);">${formatPrice(price)}</span>`;
    itemsPreview.appendChild(p);
  });
  checkoutTotal.textContent = formatPrice(total);

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = checkoutForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando pedido...';

    try {
      const { orderId } = await api('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
          },
          paymentMethod: document.getElementById('payment').value,
          items: cart.map((item) => item.id), // só IDs: o preço é do servidor
        }),
      });

      clearCart();
      renderOrderStatus(container, { orderId, status: 'PENDING' });
      pollOrder(orderId, container);
    } catch (error) {
      console.error(error);
      showToast('Não foi possível criar o pedido. Tente novamente.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = 'Finalizar Compra e Gerar Chaves';
    }
  });
}

// -------------------------------------------------------------
// Inicialização
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initHome();
  initProduto();
  initCarrinho();
  initCheckout();
});