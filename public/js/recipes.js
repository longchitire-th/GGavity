/**
 * วุ่นวายโภชนา V2.0 - Noodle Recipe Ideas Logic
 * Handles both Object and Array recipe data structures cleanly
 */

let activeCountryFilter = 'all';
let recipeSearchQuery = '';

// Helper to normalize any recipe item
function normalizeRecipe(r, index) {
  if (!r) return null;
  if (Array.isArray(r)) {
    const ing = Array.isArray(r[2]) ? r[2] : (typeof r[2] === 'string' ? r[2].split(',').map(s => s.trim()) : []);
    const st = Array.isArray(r[3]) ? r[3] : (typeof r[3] === 'string' ? r[3].split('|').map(s => s.trim()) : []);
    return {
      id: index + 1,
      name: r[0] || 'ไม่มีชื่อเมนู',
      country: r[1] || 'นานาชาติ',
      ingredients: ing,
      steps: st
    };
  }
  return {
    id: r.id !== undefined ? r.id : (index + 1),
    name: r.name || 'ไม่มีชื่อเมนู',
    country: r.country || 'นานาชาติ',
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : (typeof r.ingredients === 'string' ? r.ingredients.split(',').map(s => s.trim()) : []),
    steps: Array.isArray(r.steps) ? r.steps : (typeof r.steps === 'string' ? r.steps.split('|').map(s => s.trim()) : [])
  };
}

function getNormalizedRecipes() {
  const raw = window.NOODLE_RECIPES || [];
  return raw.map((r, i) => normalizeRecipe(r, i)).filter(Boolean);
}

function renderRecipes() {
  const recipes = getNormalizedRecipes();
  const container = document.getElementById('recipeGrid');
  const countEl = document.getElementById('recipeTotalCount');
  if (!container) return;

  if (countEl) countEl.textContent = `${recipes.length} เมนู`;

  // Filter
  const filtered = recipes.filter(r => {
    const matchCountry = activeCountryFilter === 'all' || (r.country && r.country.includes(activeCountryFilter));
    const searchTarget = `${r.name} ${r.country} ${r.ingredients.join(' ')}`.toLowerCase();
    const matchSearch = !recipeSearchQuery || searchTarget.includes(recipeSearchQuery);
    return matchCountry && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1;text-align:center;padding:30px;color:var(--text-dim);">ไม่พบเมนูที่ตรงกับการค้นหา</div>';
    return;
  }

  // Display top 24 or filtered
  const displayItems = recipeSearchQuery ? filtered : filtered.slice(0, 24);

  container.innerHTML = displayItems.map(r => {
    const ingText = r.ingredients.join(', ');
    return `
      <div class="recipe-card" onclick="openRecipeById(${r.id})">
        <div>
          <h3>🍜 ${window.escapeHtml(r.name)}</h3>
          <p><strong>เครื่องปรุง:</strong> ${window.escapeHtml(ingText)}</p>
        </div>
        <div>
          <span class="recipe-tag">🌏 ${window.escapeHtml(r.country)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function randomizeRecipes() {
  const recipes = getNormalizedRecipes();
  const container = document.getElementById('recipeGrid');
  if (!container || recipes.length === 0) return;

  // Shuffle and pick 8
  const shuffled = [...recipes].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, 8);

  container.innerHTML = picks.map(r => {
    const ingText = r.ingredients.join(', ');
    return `
      <div class="recipe-card" onclick="openRecipeById(${r.id})">
        <div>
          <h3>🍜 ${window.escapeHtml(r.name)}</h3>
          <p><strong>เครื่องปรุง:</strong> ${window.escapeHtml(ingText)}</p>
        </div>
        <div>
          <span class="recipe-tag">🌏 ${window.escapeHtml(r.country)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function openRecipeById(id) {
  const recipes = getNormalizedRecipes();
  const item = recipes.find(r => r.id === id);
  if (!item) return;

  const modal = document.getElementById('recipeModal');
  const title = document.getElementById('modalRecipeName');
  const countryEl = document.getElementById('modalRecipeCountry');
  const ingList = document.getElementById('modalRecipeIngredients');
  const stepsList = document.getElementById('modalRecipeSteps');

  if (!modal) return;

  if (title) title.textContent = item.name;
  if (countryEl) countryEl.textContent = `ต้นตำรับ: ${item.country}`;

  if (ingList) {
    ingList.innerHTML = item.ingredients.map(ing => 
      `<li style="margin: 4px 0; color: var(--text-muted);">${window.escapeHtml(ing)}</li>`
    ).join('');
  }

  if (stepsList) {
    stepsList.innerHTML = item.steps.map(st => 
      `<li style="margin: 8px 0; line-height: 1.5;">${window.escapeHtml(st)}</li>`
    ).join('');
  }

  modal.classList.add('open');
}

function closeRecipeModal() {
  const modal = document.getElementById('recipeModal');
  if (modal) modal.classList.remove('open');
}

// Setup listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('recipeSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      recipeSearchQuery = e.target.value.trim().toLowerCase();
      renderRecipes();
    });
  }

  // Country buttons
  document.querySelectorAll('.country-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCountryFilter = btn.getAttribute('data-country') || 'all';
      renderRecipes();
    });
  });

  // Render initially
  renderRecipes();
});

window.renderRecipes = renderRecipes;
window.randomizeRecipes = randomizeRecipes;
window.openRecipeById = openRecipeById;
window.openRecipeDetail = openRecipeById;
window.closeRecipeModal = closeRecipeModal;
