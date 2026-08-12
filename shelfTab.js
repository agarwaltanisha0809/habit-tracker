// Shelf tab: undated "someday" items — books, ideas, projects to start
// later. No schedule, no completion, no streaks; a pressure-free parking
// lot, separate from both habits (recurring) and tasks (dated). Swiping an
// item reveals "Promote to task" (opens the real add-task form pre-filled,
// see openAddTaskModal's prefill param in addTask.js) and Delete.

const SHELF_CATEGORY_ORDER = ["Books", "Ideas", "Projects", "Other"];
// No per-item emoji (it kept defaulting to a generic checkmark for
// anything the keyword guesser couldn't match, which was most book
// titles) — instead each category gets a thin colored accent bar, reusing
// existing habit accent colors for visual consistency with the rest of
// the app.
const SHELF_CATEGORY_COLORS = { Books: "#EF9F27", Ideas: "#378ADD", Projects: "#7F77DD", Other: "#8c8579" };

function renderShelfTab() {
  const state = getState();
  const scribbleEl = document.getElementById("shelfScribble");
  if (scribbleEl) scribbleEl.innerHTML = scribbleSvg(80);

  const listEl = document.getElementById("shelfList");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!state.shelf.length) {
    listEl.innerHTML = `<div class="app-footer" style="margin-top:24px;">Nothing on the shelf yet. Add a book, idea, or project above — no pressure, no dates.</div>`;
    return;
  }

  const byCategory = {};
  state.shelf
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((item) => {
      const cat = item.category || "Other";
      (byCategory[cat] = byCategory[cat] || []).push(item);
    });

  SHELF_CATEGORY_ORDER.filter((cat) => byCategory[cat]).forEach((cat) => {
    const header = document.createElement("div");
    header.className = "task-group-label";
    header.textContent = cat;
    listEl.appendChild(header);
    byCategory[cat].forEach((item) => listEl.appendChild(renderShelfCard(item)));
  });
}

function renderShelfCard(item) {
  const card = document.createElement("div");
  card.className = "bento-card shelf-card";
  card.style.setProperty("--shelf-accent", SHELF_CATEGORY_COLORS[item.category] || SHELF_CATEGORY_COLORS.Other);
  card.innerHTML = `<span class="shelf-card-accent"></span><span class="shelf-card-label">${item.label}</span>`;
  return wrapShelfSwipe(card, item);
}

// A small dedicated swipe wrapper (Promote + Delete) rather than reusing
// wrapWithSwipeToDelete — shelf items don't have a habit/date shape, so the
// tomorrow/edit-scope logic there doesn't apply.
const SHELF_SWIPE_REVEAL_WIDTH = 140;

function wrapShelfSwipe(card, item) {
  const wrapper = document.createElement("div");
  wrapper.className = "swipe-wrapper";
  wrapper.innerHTML = `
    <div class="swipe-actions">
      <button type="button" class="swipe-action-btn tomorrow" aria-label="Promote ${item.label} to a task">🚀<span>Promote</span></button>
      <button type="button" class="swipe-action-btn delete" aria-label="Delete ${item.label}">🗑️<span>Delete</span></button>
    </div>
  `;
  wrapper.appendChild(card);

  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let locked = null;
  let revealed = false;

  function setX(x, animated) {
    card.classList.toggle("snapping", !!animated);
    card.style.transform = x ? `translateX(${x}px)` : "";
  }
  function close(animated) {
    revealed = false;
    setX(0, animated !== false);
    if (closeOpenSwipe === close) closeOpenSwipe = null;
  }

  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input")) return;
    startX = e.clientX;
    startY = e.clientY;
    baseX = revealed ? -SHELF_SWIPE_REVEAL_WIDTH : 0;
    locked = null;
  });
  card.addEventListener("pointermove", (e) => {
    if (startX === 0 && startY === 0) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.abs(dx) < SWIPE_LOCK_THRESHOLD && Math.abs(dy) < SWIPE_LOCK_THRESHOLD) return;
      locked = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      if (locked === "horizontal") {
        if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe();
        card.classList.add("dragging");
        card.setPointerCapture(e.pointerId);
      }
    }
    if (locked !== "horizontal") return;
    setX(Math.max(-SHELF_SWIPE_REVEAL_WIDTH, Math.min(0, baseX + dx)), false);
  });
  function endDrag(e) {
    const wasHorizontal = locked === "horizontal";
    locked = null;
    if (!wasHorizontal) return;
    card.classList.remove("dragging");
    const endX = baseX + (e.clientX - startX);
    revealed = endX < -SHELF_SWIPE_REVEAL_WIDTH / 2;
    setX(revealed ? -SHELF_SWIPE_REVEAL_WIDTH : 0, true);
    closeOpenSwipe = revealed ? close : null;
  }
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);

  wrapper.querySelector(".swipe-action-btn.tomorrow").addEventListener("click", () => {
    close();
    openAddTaskModal({ label: item.label, promoteShelfId: item.id });
  });
  wrapper.querySelector(".swipe-action-btn.delete").addEventListener("click", () => {
    close();
    removeShelfItem(item.id);
    renderShelfTab();
  });

  return wrapper;
}

function initShelfTab() {
  const input = document.getElementById("shelfAddInput");
  const categorySelect = document.getElementById("shelfCategorySelect");
  if (!input) return;

  function addFromInput() {
    const label = input.value.trim();
    if (!label) return;
    addShelfItem({ label, category: categorySelect.value });
    input.value = "";
    renderShelfTab();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addFromInput();
  });

  document.getElementById("shelfList").addEventListener("pointerdown", (e) => {
    if (closeOpenSwipe && !e.target.closest(".swipe-actions")) closeOpenSwipe();
  });
}
