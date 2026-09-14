/**
 * วุ่นวายโภชนา V2.0 - Noodle Recipe Ideas Logic
 */

let activeCountryFilter = 'all';
let recipeSearchQuery = '';

function renderRecipes() {
  const recipes = window.NOODLE_RECIPES || [];
  const container = document.getElementById('recipeGrid');
  const countEl = document.getElementById('recipeTotalCount');
  if (!container) return;

  if (countEl) countEl.textContent = `${recipes.length} เมนู`;

  // Filter
  let filtered = recipes.filter(r => {
    const [name, country, ingredients, steps] = r;
    const matchCountry = activeCountryFilter === 'all' || (country && country.includes(activeCountryFilter));
    const matchSearch = !recipeSearchQuery || 
      name.toLowerCase().includes(recipeSearchQuery) || 
      ingredients.toLowerCase().includes(recipeSearchQuery) ||
      (country && country.toLowerCase().includes(recipeSearchQuery));
    return matchCountry && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1;text-align:center;padding:30px;color:var(--text-dim);">ไม่พบเมนูที่ตรงกับการค้นหา</div>';
    return;
  }

  // If viewing 'all' and no search, display random 12 or first 24
  const displayItems = recipeSearchQuery ? filtered : filtered.slice(0, 24);

  container.innerHTML = displayItems.map((r, idx) => {
    const [name, country, ingredients, steps] = r;
    return `
      <div class="recipe-card" onclick="openRecipeDetail('${escapeHtml(name)}')">
        <div>
          <h3>🍜 ${escapeHtml(name)}</h3>
          <p><strong>เครื่องปรุง:</strong> ${escapeHtml(ingredients)}</p>
        </div>
        <div>
          <span class="recipe-tag">🌏 ${escapeHtml(country)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function randomizeRecipes() {
  const recipes = window.NOODLE_RECIPES || [];
  const container = document.getElementById('recipeGrid');
  if (!container || recipes.length === 0) return;

  // Shuffle and pick 8
  const shuffled = [...recipes].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, 8);

  container.innerHTML = picks.map(r => {
    const [name, country, ingredients, steps] = r;
    return `
      <div class="recipe-card" onclick="openRecipeDetail('${escapeHtml(name)}')">
        <div>
          <h3>🍜 ${escapeHtml(name)}</h3>
          <p><strong>เครื่องปรุง:</strong> ${escapeHtml(ingredients)}</p>
        </div>
        <div>
          <span class="recipe-tag">🌏 ${escapeHtml(country)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function openRecipeDetail(name) {
  const recipes = window.NOODLE_RECIPES || [];
  const item = recipes.find(r => r[0] === name);
  if (!item) return;

  const [recipeName, country, ingredients, steps] = item;
  const modal = document.getElementById('recipeModal');
  const title = document.getElementById('modalRecipeName');
  const countryEl = document.getElementById('modalRecipeCountry');
  const ingList = document.getElementById('modalRecipeIngredients');
  const stepsList = document.getElementById('modalRecipeSteps');

  if (!modal) return;

  if (title) title.textContent = recipeName;
  if (countryEl) countryEl.textContent = `ต้นตำรับ: ${country}`;

  if (ingList) {
    const ingArray = ingredients.split(',').map(s => s.trim()).filter(Boolean);
    ingList.innerHTML = ingArray.map(ing => `<li style="margin: 4px 0; color: var(--text-muted);">${escapeHtml(ing)}</li>`).join('');
  }

  if (stepsList) {
    const stepArray = steps.split('|').map(s => s.trim()).filter(Boolean);
    stepsList.innerHTML = stepArray.map(st => `<li style="margin: 8px 0; line-height: 1.5;">${escapeHtml(st)}</li>`).join('');
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
});

window.renderRecipes = renderRecipes;
window.randomizeRecipes = randomizeRecipes;
window.openRecipeDetail = openRecipeDetail;
window.closeRecipeModal = closeRecipeModal;
