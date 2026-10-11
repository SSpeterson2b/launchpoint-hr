(function () {
"use strict";
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function identity(leg) { return String(leg.game_pk || "") + ":" + String(leg.label || "").trim().toLowerCase(); }
function distinctCards(cards) {
  var used = new Set(), output = [];
  (cards || []).forEach(function (card) {
    var seen = new Set();
    var legs = (card.legs || []).filter(function (leg) {
      var key = identity(leg);
      if (!leg.game_pk || !leg.label || seen.has(key)) return false;
      seen.add(key); return true;
    });
    // A different market for the same player is not a distinct alternative.
    if (legs.length < 2 || legs.some(function (leg) { return used.has(identity(leg)); })) return;
    legs.forEach(function (leg) { used.add(identity(leg)); });
    output.push({legs:legs});
  });
  return output;
}
function render(data) {
  var host = document.getElementById("generator-grid"), status = document.getElementById("generator-status");
  if (!host || !status) return;
  var cards = distinctCards(data.cards), timestamp = new Date(data.generated_at_utc);
  status.textContent = cards.length ? "SAVED MODEL CARDS" : "WAITING";
  status.classList.toggle("skip", !cards.length);
  var meta = '<p class="fine">Slate: ' + esc(data.slate_date || "Unavailable") + ' · Feed updated: ' +
    esc(Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString("en-US", {timeZone:"America/Chicago", timeZoneName:"short"}) : "Unavailable") + '</p>';
  if (!cards.length) { host.innerHTML = meta + '<div class="empty"><b>No distinct combination available</b><p>At least two different players or team selections are needed. Repeated markets for one player are not separate opportunities.</p></div>'; return; }
  host.innerHTML = meta + cards.map(function (card, index) {
    var games = new Set(card.legs.map(function (leg) { return String(leg.game_pk); }));
    var legs = card.legs.map(function (leg, i) { return '<div class="gen-leg"><span class="num">' + (i+1) + '</span><div><strong>' + esc(leg.label) + '</strong><small>' + esc(leg.type) + ' · ' + esc(leg.detail) + '</small></div></div>'; }).join("");
    return '<article class="gen-card"><div class="top"><div><div class="gen-style">MODEL COMBINATION</div><h2>' + (index ? "Distinct alternative " + index : "Main card") + '</h2></div><span class="decision">' + card.legs.length + ' LEGS</span></div>' + legs +
      '<div class="gen-foot">' + (games.size < card.legs.length ? 'Same-game legs: outcomes may be correlated. ' : '') +
      'Risk and combined hit probability have not been validated. These saved selections are not new recommendations after first pitch.</div></article>';
  }).join("") + '<div class="empty"><b>' + (cards.length === 1 ? 'No distinct alternative available' : 'Alternatives use different players and team selections') + '</b><p>Overlapping cards are hidden. Repeating a selection adds no supporting evidence.</p></div>';
}
var loading = false;
function refresh() {
  if (loading) return; loading = true;
  fetch("data/parlay_generator.json?ts=" + Date.now(), {cache:"no-store"}).then(function (r) {
    if (!r.ok) throw Error("generator unavailable"); return r.json();
  }).then(render).catch(function () { render({cards:[]}); }).finally(function () { loading = false; });
}
refresh();
window.addEventListener("pageshow", refresh);
document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
}());
