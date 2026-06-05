const state = {
  recipes: [],
  selectedId: null,
  mode: "browse",
  previewImages: new Map(),
  activeMedia: {
    view: "source",
    edit: "source",
  },
  rotations: new Map(),
  browseMenuOpen: true,
};

const els = {
  browseView: document.querySelector("#browseView"),
  manageView: document.querySelector("#manageView"),
  browseMode: document.querySelector("#browseMode"),
  manageMode: document.querySelector("#manageMode"),
  cards: document.querySelector("#recipeCards"),
  editCards: document.querySelector("#editCards"),
  cardTemplate: document.querySelector("#cardTemplate"),
  imageTemplate: document.querySelector("#imageTemplate"),
  imagePicker: document.querySelector("#imagePicker"),
  selectedImages: document.querySelector("#selectedImages"),
  search: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  totalCount: document.querySelector("#totalCount"),
  imageCount: document.querySelector("#imageCount"),
  toggleBrowseMenu: document.querySelector("#toggleBrowseMenu"),
  form: document.querySelector("#recipeForm"),
  displayActiveImage: document.querySelector("#displayActiveImage"),
  displayMediaEmpty: document.querySelector("#displayMediaEmpty"),
  viewActiveImage: document.querySelector("#viewActiveImage"),
  viewMediaEmpty: document.querySelector("#viewMediaEmpty"),
  viewSourceTab: document.querySelector("#viewSourceTab"),
  viewGeneratedTab: document.querySelector("#viewGeneratedTab"),
  editSourceTab: document.querySelector("#editSourceTab"),
  editGeneratedTab: document.querySelector("#editGeneratedTab"),
  viewRotateLeft: document.querySelector("#viewRotateLeft"),
  viewRotateRight: document.querySelector("#viewRotateRight"),
  editRotateLeft: document.querySelector("#editRotateLeft"),
  editRotateRight: document.querySelector("#editRotateRight"),
  viewTitle: document.querySelector("#viewTitle"),
  viewCategory: document.querySelector("#viewCategory"),
  viewTags: document.querySelector("#viewTags"),
  viewIngredients: document.querySelector("#viewIngredients"),
  viewSteps: document.querySelector("#viewSteps"),
  viewNotes: document.querySelector("#viewNotes"),
  fields: {
    title: document.querySelector("#title"),
    category: document.querySelector("#category"),
    status: document.querySelector("#status"),
    tags: document.querySelector("#tags"),
    sourceImage: document.querySelector("#sourceImage"),
    generatedImage: document.querySelector("#generatedImage"),
    ingredients: document.querySelector("#ingredients"),
    steps: document.querySelector("#steps"),
    notes: document.querySelector("#notes"),
  },
};

async function loadRecipes() {
  let serverRecipes = [];
  try {
    const res = await fetch("data/recipes.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    serverRecipes = Array.isArray(data.recipes) ? data.recipes : [];
  } catch {
    serverRecipes = [];
  }

  let draftRecipes = [];
  const draft = localStorage.getItem("recipe-manager-draft");
  if (draft) {
    try {
      const data = JSON.parse(draft);
      draftRecipes = Array.isArray(data.recipes) ? data.recipes : [];
    } catch {
      draftRecipes = [];
    }
  }

  state.recipes = serverRecipes.length ? serverRecipes : draftRecipes;
  if (!state.recipes.length) {
    state.recipes = [createRecipe({ title: "サンプルレシピ", category: "未分類", notes: "画像読み取り後に置き換えてください。" })];
  }

  state.selectedId = state.recipes[0]?.id ?? null;
  render();
}

function createRecipe(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: "",
    category: "",
    status: "draft",
    tags: [],
    sourceImage: "",
    generatedImage: "",
    ingredients: [],
    steps: [],
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function normalizeText(value) {
  return Array.isArray(value) ? value.join("\n") : value || "";
}

function splitLines(value) {
  return value
    .split(/\n|、/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPageImagePath(path) {
  if (!path || path.startsWith("blob:") || path.startsWith("data:")) return path;
  const match = path.match(/^assets\/processed-images\/(.+)\.HEIC\.png$/);
  if (!match) return path;
  return `assets/page-images/${match[1]}.jpg`;
}

function getImagePath(recipe) {
  return toPageImagePath(state.previewImages.get(recipe.id) || recipe.generatedImage || recipe.sourceImage || "");
}

function getSourceImagePath(recipe) {
  return toPageImagePath(state.previewImages.get(recipe.id) || recipe.sourceImage || "");
}

function renderImage(img, empty, path) {
  img.src = path;
  img.hidden = !path;
  empty.hidden = Boolean(path);
}

function imagePathForKind(recipe, kind) {
  if (kind === "generated") return recipe.generatedImage || "";
  return getSourceImagePath(recipe);
}

function rotationKey(recipe, kind) {
  return `${recipe.id}:${kind}`;
}

function mediaRotation(recipe, kind) {
  return state.rotations.get(rotationKey(recipe, kind)) || 0;
}

function renderMediaPanel(scope, recipe) {
  const kind = state.activeMedia[scope];
  const isGenerated = kind === "generated";
  const path = imagePathForKind(recipe, kind);
  const img = scope === "view" ? els.viewActiveImage : els.displayActiveImage;
  const empty = scope === "view" ? els.viewMediaEmpty : els.displayMediaEmpty;
  const sourceTab = scope === "view" ? els.viewSourceTab : els.editSourceTab;
  const generatedTab = scope === "view" ? els.viewGeneratedTab : els.editGeneratedTab;

  sourceTab.classList.toggle("active", !isGenerated);
  generatedTab.classList.toggle("active", isGenerated);
  empty.textContent = isGenerated ? "未生成" : "画像なし";
  renderImage(img, empty, path);
  img.style.transform = `rotate(${mediaRotation(recipe, kind)}deg)`;
}

function setMediaKind(scope, kind) {
  state.activeMedia[scope] = kind;
  render();
}

function rotateMedia(scope, delta) {
  const recipe = state.recipes.find((item) => item.id === state.selectedId);
  if (!recipe) return;
  const kind = state.activeMedia[scope];
  const key = rotationKey(recipe, kind);
  const next = (mediaRotation(recipe, kind) + delta + 360) % 360;
  state.rotations.set(key, next);
  render();
}

function getFilteredRecipes() {
  const query = els.search.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  const status = els.statusFilter.value;

  return state.recipes.filter((recipe) => {
    const haystack = [
      recipe.title,
      recipe.category,
      recipe.notes,
      recipe.sourceImage,
      ...(recipe.tags || []),
      ...(recipe.ingredients || []),
      ...(recipe.steps || []),
    ].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!category || recipe.category === category)
      && (!status || recipe.status === status);
  });
}

function setMode(mode) {
  state.mode = mode;
  els.browseView.hidden = mode !== "browse";
  els.manageView.hidden = mode !== "manage";
  els.browseMode.classList.toggle("active", mode === "browse");
  els.manageMode.classList.toggle("active", mode === "manage");
  render();
}

function render() {
  renderBrowseMenu();
  renderFilters();
  renderStats();
  renderCards(els.cards, getFilteredRecipes());
  renderCards(els.editCards, state.recipes);
  renderViewer();
  renderEditor();
}

function renderBrowseMenu() {
  els.browseView.classList.toggle("menu-collapsed", !state.browseMenuOpen);
  els.toggleBrowseMenu.textContent = state.browseMenuOpen ? "メニューを隠す" : "メニューを表示";
  els.toggleBrowseMenu.setAttribute("aria-expanded", String(state.browseMenuOpen));
}

function renderFilters() {
  const current = els.categoryFilter.value;
  const categories = [...new Set(state.recipes.map((recipe) => recipe.category).filter(Boolean))].sort();
  els.categoryFilter.innerHTML = '<option value="">すべて</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.categoryFilter.append(option);
  }
  els.categoryFilter.value = categories.includes(current) ? current : "";
}

function renderStats() {
  els.totalCount.textContent = String(getFilteredRecipes().length);
  els.imageCount.textContent = String(new Set(state.recipes.map((recipe) => recipe.sourceImage).filter(Boolean)).size);
}

function renderCards(container, recipes) {
  container.innerHTML = "";
  if (container === els.cards && !recipes.some((recipe) => recipe.id === state.selectedId)) {
    state.selectedId = recipes[0]?.id ?? state.recipes[0]?.id ?? null;
  }

  for (const recipe of recipes) {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
    card.classList.toggle("active", recipe.id === state.selectedId);
    const img = card.querySelector("img");
    const title = card.querySelector("h3");
    const text = card.querySelector("p");
    const meta = card.querySelector(".card-meta");
    const imagePath = getImagePath(recipe);

    img.src = imagePath;
    img.alt = recipe.title ? `${recipe.title}の画像` : "レシピ画像";
    img.hidden = !imagePath;
    title.textContent = recipe.title || "無題";
    text.textContent = normalizeText(recipe.ingredients) || recipe.notes || recipe.sourceImage || "材料未登録";
    meta.innerHTML = "";
    for (const item of [recipe.category, recipe.status, ...(recipe.tags || []).slice(0, 2)].filter(Boolean)) {
      const chip = document.createElement("span");
      chip.textContent = item;
      meta.append(chip);
    }

    card.addEventListener("click", () => {
      state.selectedId = recipe.id;
      if (window.matchMedia("(max-width: 760px)").matches && container === els.cards) {
        state.browseMenuOpen = false;
      }
      render();
    });
    container.append(card);
  }
}

function renderViewer() {
  const recipe = state.recipes.find((item) => item.id === state.selectedId);
  if (!recipe) return;

  renderMediaPanel("view", recipe);
  els.viewTitle.textContent = recipe.title || "無題";
  els.viewCategory.textContent = [recipe.category, recipe.status].filter(Boolean).join(" / ");
  renderChips(els.viewTags, recipe.tags || []);
  renderList(els.viewIngredients, recipe.ingredients || [], "ul");
  renderList(els.viewSteps, recipe.steps || [], "ol");
  els.viewNotes.textContent = recipe.notes || "メモなし";
}

function renderChips(container, items) {
  container.innerHTML = "";
  for (const item of items) {
    const chip = document.createElement("span");
    chip.textContent = item;
    container.append(chip);
  }
}

function renderList(container, items) {
  container.innerHTML = "";
  const values = items.length ? items : ["未登録"];
  for (const item of values) {
    const li = document.createElement("li");
    li.textContent = item;
    container.append(li);
  }
}

function renderEditor() {
  const recipe = state.recipes.find((item) => item.id === state.selectedId);
  els.form.hidden = !recipe;
  if (!recipe) return;

  els.fields.title.value = recipe.title || "";
  els.fields.category.value = recipe.category || "";
  els.fields.status.value = recipe.status || "draft";
  els.fields.tags.value = (recipe.tags || []).join(", ");
  els.fields.sourceImage.value = recipe.sourceImage || "";
  els.fields.generatedImage.value = recipe.generatedImage || "";
  els.fields.ingredients.value = normalizeText(recipe.ingredients);
  els.fields.steps.value = normalizeText(recipe.steps);
  els.fields.notes.value = recipe.notes || "";

  renderMediaPanel("edit", recipe);
}

function saveSelectedRecipe(event) {
  event.preventDefault();
  const recipe = state.recipes.find((item) => item.id === state.selectedId);
  if (!recipe) return;

  Object.assign(recipe, {
    title: els.fields.title.value.trim(),
    category: els.fields.category.value.trim(),
    status: els.fields.status.value,
    tags: els.fields.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    sourceImage: els.fields.sourceImage.value.trim(),
    generatedImage: els.fields.generatedImage.value.trim(),
    ingredients: splitLines(els.fields.ingredients.value),
    steps: splitLines(els.fields.steps.value),
    notes: els.fields.notes.value.trim(),
    updatedAt: new Date().toISOString(),
  });

  persistDraft();
  render();
}

function addRecipesFromImages(files) {
  const created = [];
  for (const file of files) {
    const recipe = createRecipe({
      title: file.name.replace(/\.[^.]+$/, ""),
      status: "draft",
      sourceImage: `assets/source-images/${file.name}`,
      notes: "画像から作成した下書きです。LM Studioで抽出後に内容を確認してください。",
    });
    state.previewImages.set(recipe.id, URL.createObjectURL(file));
    state.recipes.unshift(recipe);
    created.push({ recipe, file });
  }

  if (created.length) {
    state.selectedId = created[0].recipe.id;
    renderSelectedImages(created);
    persistDraft();
    setMode("manage");
  }
}

function renderSelectedImages(items) {
  els.selectedImages.innerHTML = "";
  for (const { recipe, file } of items) {
    const chip = els.imageTemplate.content.firstElementChild.cloneNode(true);
    const img = chip.querySelector("img");
    const caption = chip.querySelector("figcaption");
    img.src = state.previewImages.get(recipe.id);
    img.alt = file.name;
    caption.textContent = file.name;
    els.selectedImages.append(chip);
  }
}

function persistDraft() {
  const recipes = state.recipes.map(({ id, title, category, status, tags, sourceImage, generatedImage, ingredients, steps, notes, createdAt, updatedAt }) => ({
    id,
    title,
    category,
    status,
    tags,
    sourceImage,
    generatedImage,
    ingredients,
    steps,
    notes,
    createdAt,
    updatedAt,
  }));
  localStorage.setItem("recipe-manager-draft", JSON.stringify({ recipes }, null, 2));
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  download("recipes.json", JSON.stringify({ recipes: state.recipes }, null, 2), "application/json");
}

function exportCsv() {
  const header = ["id", "title", "category", "status", "tags", "sourceImage", "generatedImage", "ingredients", "steps", "notes"];
  const rows = state.recipes.map((recipe) => header.map((key) => {
    const value = Array.isArray(recipe[key]) ? recipe[key].join("\n") : recipe[key] || "";
    return `"${String(value).replaceAll('"', '""')}"`;
  }).join(","));
  download("recipes.csv", [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

document.querySelector("#newRecipe").addEventListener("click", () => {
  const recipe = createRecipe({ title: "新しいレシピ" });
  state.recipes.unshift(recipe);
  state.selectedId = recipe.id;
  persistDraft();
  setMode("manage");
});

document.querySelector("#deleteRecipe").addEventListener("click", () => {
  state.recipes = state.recipes.filter((recipe) => recipe.id !== state.selectedId);
  state.selectedId = state.recipes[0]?.id ?? null;
  persistDraft();
  render();
});

document.querySelector("#editSelected").addEventListener("click", () => setMode("manage"));
els.toggleBrowseMenu.addEventListener("click", () => {
  state.browseMenuOpen = !state.browseMenuOpen;
  render();
});
els.browseMode.addEventListener("click", () => setMode("browse"));
els.manageMode.addEventListener("click", () => setMode("manage"));
els.viewSourceTab.addEventListener("click", () => setMediaKind("view", "source"));
els.viewGeneratedTab.addEventListener("click", () => setMediaKind("view", "generated"));
els.editSourceTab.addEventListener("click", () => setMediaKind("edit", "source"));
els.editGeneratedTab.addEventListener("click", () => setMediaKind("edit", "generated"));
els.viewRotateLeft.addEventListener("click", () => rotateMedia("view", -90));
els.viewRotateRight.addEventListener("click", () => rotateMedia("view", 90));
els.editRotateLeft.addEventListener("click", () => rotateMedia("edit", -90));
els.editRotateRight.addEventListener("click", () => rotateMedia("edit", 90));
els.imagePicker.addEventListener("change", (event) => addRecipesFromImages([...event.target.files]));
document.querySelector("#exportJson").addEventListener("click", exportJson);
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
els.form.addEventListener("submit", saveSelectedRecipe);
els.search.addEventListener("input", render);
els.categoryFilter.addEventListener("change", render);
els.statusFilter.addEventListener("change", render);

loadRecipes();
