// Fills the parts of the How to play guide (guide.html) that come from the game
// data, so the guide stays right when the CSV files change: rule numbers, the
// skills glossary, rarities, random events and the starter decks.
function fillGuide(root, data) {
  const h = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  root.querySelectorAll("[data-rule]").forEach(el => {
    const v = data.rules[el.dataset.rule];
    if (v != null) el.textContent = v;
  });
  const skills = root.querySelector("[data-fill=skills]");
  if (skills) {
    skills.innerHTML = data.skillOrder.map(name => {
      const sk = data.skills[name];
      return `<div class="g-skill"><span class="icon">${h(sk.icon)}</span><b>${h(name)}</b><p>${h(sk.desc)}</p></div>`;
    }).join("");
  }
  const rarities = root.querySelector("[data-fill=rarities]");
  if (rarities) {
    rarities.innerHTML = data.rarityOrder.map(id => {
      const r = data.rarities[id];
      return `<li><span class="swatch" style="background:${r.color}"></span><b>${h(r.name)}</b> · saved equipment costs ${r.attachCost} mana to attach</li>`;
    }).join("");
  }
  // The random events list: guide.html has no spot for it while events are off in normal play
  // (27 Nov 2026); a later shake-up mode's guide section can bring <ul data-fill="events"> back.
  const events = root.querySelector("[data-fill=events]");
  if (events) {
    events.innerHTML = data.eventOrder.map(id => `<li><b>${h(data.events[id].name)}</b>: ${h(data.events[id].desc)}</li>`).join("");
  }
  const decks = root.querySelector("[data-fill=decks]");
  if (decks) {
    decks.innerHTML = data.deckOrder.filter(id => data.decks[id].isPlayable).map(id => {
      const d = data.decks[id];
      return `<li><span class="swatch" style="background:${data.factions[d.faction]?.color || "#888"}"></span><b>${h(d.name)}</b>: ${h(d.description)}</li>`;
    }).join("");
  }
}
