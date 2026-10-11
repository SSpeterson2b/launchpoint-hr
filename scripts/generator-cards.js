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
    if (legs.length < 2 || legs.some(function (leg) { return used.has(identity(leg)); })) return;
    legs.forEach(function (leg) { used.add(identity(leg)); });
    output.push(Object.assign({}, card, {legs:legs}));
  });
  return output;
}
function localTime(value) {
  var date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", {timeZone:"America/Chicago", timeZoneName:"short"}) : "Unavailable";
}
function outcome(card, leg) {
  if (card.verification_status !== "VERIFIED PREGAME") return "UNVERIFIED";
  var value = String((leg || card).result || "PENDING").toUpperCase();
  return ["HIT", "MISS", "VOID", "PENDING", "UNAVAILABLE", "UNVERIFIED"].includes(value) ? value : "UNAVAILABLE";
}
var selected = null, latest = null, saved = [], loading = false;
function render(data, history) {
  var host = document.getElementById("generator-grid"), status = document.getElementById("generator-status");
  if (!host || !status) return;
  latest = data; saved = history || [];
  var byDate = new Map();
  if (data && data.slate_date) byDate.set(data.slate_date, data);
  saved.forEach(function (snapshot) { if (snapshot.slate_date) byDate.set(snapshot.slate_date, snapshot); });
  if (!selected || !byDate.has(selected)) selected = data.slate_date || Array.from(byDate.keys()).sort().reverse()[0];
  var snapshot = byDate.get(selected) || data;
  var cards = distinctCards(snapshot.cards);
  status.textContent = cards.length ? "SAVED MODEL CARDS" : "WAITING";
  status.classList.toggle("skip", !cards.length);
  var tabs = '<div class="history-tabs" aria-label="Saved model card dates">' + Array.from(byDate.keys()).sort().reverse().map(function (date) {
    return '<button class="history-tab' + (date === selected ? ' active' : '') + '" data-generator-date="' + esc(date) + '">' + esc(date) + '</button>';
  }).join("") + '</div>';
  var meta = '<p class="fine">Slate: ' + esc(snapshot.slate_date || "Unavailable") + ' · Saved feed: ' + esc(localTime(snapshot.generated_at_utc)) +
    (snapshot.graded_at_utc ? ' · Results checked: ' + esc(localTime(snapshot.graded_at_utc)) : '') + '</p>';
  if (!cards.length) { host.innerHTML = tabs + meta + '<div class="empty"><b>No distinct combination available</b><p>At least two different players or team selections are needed. Previous dates remain available above.</p></div>'; bindTabs(host); return; }
  host.innerHTML = tabs + meta + cards.map(function (card, index) {
    var result = outcome(card), games = new Set(card.legs.map(function (leg) { return String(leg.game_pk); }));
    var legs = card.legs.map(function (leg, i) {
      var value = outcome(card, leg);
      return '<div class="gen-leg"><span class="num">' + (i+1) + '</span><div><strong>' + esc(leg.label) + '</strong><small>' + esc(leg.type) + ' · ' + esc(leg.detail) + '</small>' +
        '<small class="leg-result ' + esc(value) + '">' + esc(value) + (leg.actual != null && value !== 'UNVERIFIED' ? ' · Actual: ' + esc(leg.actual) : '') + '</small>' +
        (leg.result_reason ? '<small>' + esc(leg.result_reason) + '</small>' : '') + '</div></div>';
    }).join("");
    var note = result === 'UNVERIFIED' ? 'No verified pregame card snapshot. Retained for reference; excluded from Hit/Miss grading.' :
      'Saved before first pitch: ' + localTime(card.locked_at_utc) + '. ' + (result === 'VOID' ? 'A leg was void; this is not an all-leg hit. ' : '') +
      'Required missing statistics stay unavailable and are not counted as misses.';
    return '<article class="gen-card"><div class="top"><div><div class="gen-style">MODEL COMBINATION</div><h2>' + (index ? "Distinct alternative " + index : "Main card") +
      '</h2></div><span class="decision ' + result.toLowerCase() + '">' + esc(result) + ' · ' + card.legs.length + ' LEGS</span></div>' + legs +
      '<div class="gen-foot">' + esc(note) + '</div><div class="gen-foot">' + (games.size < card.legs.length ? 'Same-game legs: outcomes may be correlated. ' : '') +
      'Combined hit probability has not been validated. Saved cards remain after games finish.</div></article>';
  }).join("") + '<div class="empty"><b>' + (cards.length === 1 ? 'No distinct alternative available' : 'Alternatives use different players and team selections') +
    '</b><p>Overlapping cards are hidden. Repeating a selection adds no supporting evidence.</p></div>';
  bindTabs(host);
}
function bindTabs(host) {
  host.querySelectorAll('[data-generator-date]').forEach(function (button) {
    button.addEventListener('click', function () { selected = button.getAttribute('data-generator-date'); render(latest, saved); });
  });
}
function getJSON(path) {
  return fetch(path + '?ts=' + Date.now(), {cache:'no-store'}).then(function (response) {
    if (!response.ok) throw Error('feed unavailable'); return response.json();
  });
}
function refresh() {
  if (loading) return; loading = true;
  Promise.allSettled([getJSON('data/parlay_generator.json'), getJSON('data/parlay_generator_history.json')]).then(function (results) {
    var current = results[0].status === 'fulfilled' ? results[0].value : latest;
    var history = results[1].status === 'fulfilled' ? results[1].value.snapshots || [] : saved;
    if (!current && !history.length) {
      document.getElementById('generator-status').textContent = 'FEED UNAVAILABLE';
      document.getElementById('generator-grid').innerHTML = '<div class="empty"><b>Saved cards are temporarily unavailable</b><p>Refresh to retry. This does not mean the cards were deleted.</p></div>';
      return;
    }
    render(current || history[0], history);
  }).finally(function () { loading = false; });
}
refresh();
window.addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
}());
