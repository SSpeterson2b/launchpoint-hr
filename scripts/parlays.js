(function () {
  "use strict";

  var slots = [
    { title: "Top 2-Leg Parlay", kicker: "BEST VERIFIED COMBINATION", need: 2 },
    { title: "Same-Game Parlay", kicker: "ONE MATCHUP · SEPARATE PLAYERS", need: 2, same: true },
    { title: "Player Prop Parlay", kicker: "CROSS-GAME PROP EDGE", need: 2, alternate: true },
    { title: "Long-Shot Parlay", kicker: "HIGHER RISK · SMALLER STAKE", need: 3, long: true },
  ];

  var liveData = { games: [] };
  var history = { slates: [] };
  var activeDate = "";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function numOdds(value) {
    if (value == null || value === "") return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function showOdds(value) {
    var parsed = numOdds(value);
    return parsed == null ? "—" : (parsed > 0 ? "+" : "") + parsed;
  }

  function decimal(odds) {
    return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
  }

  function combined(legs) {
    var value = legs.reduce(function (total, leg) { return total * decimal(leg.odds); }, 1);
    var odds = value >= 2 ? Math.round((value - 1) * 100) : Math.round(-100 / (value - 1));
    return (odds > 0 ? "+" : "") + odds;
  }

  function displayName(value) {
    var text = String(value || "");
    if (text.indexOf(",") < 0) return text;
    var parts = text.split(",");
    return parts.slice(1).join(",").trim() + " " + parts[0].trim();
  }

  function grade(legs) {
    if (legs.some(function (leg) { return !leg.result; })) return "";
    if (legs.some(function (leg) { return leg.result === "MISS"; })) return "MISS";
    if (legs.some(function (leg) { return leg.result === "PUSH"; })) return "PUSH";
    return "HIT";
  }

  function allLegs(data) {
    var output = [];
    (data.games || []).forEach(function (game) {
      (game.props || []).forEach(function (prop) {
        var odds = numOdds(prop.odds);
        if (prop.decision !== "PLAY" || odds == null || Number(prop.confidence || 0) < 60) return;
        output.push({
          game: String(game.game_pk),
          start: game.game_datetime_utc || "",
          player: displayName(prop.player),
          player_id: prop.player_id || null,
          team: prop.team || "",
          opponent: prop.opponent || "",
          market: prop.category || "",
          side: prop.side || "",
          line: Number(prop.line),
          pick: (prop.side || "") + " " + prop.line,
          odds: odds,
          confidence: Number(prop.confidence || 0),
          result: prop.result || "",
          actual: prop.actual == null ? "" : prop.actual,
        });
      });
    });
    return output.sort(function (a, b) { return b.confidence - a.confidence; });
  }

  function pick(pool, need, sameGame) {
    var selected = [];
    pool.some(function (leg) {
      if (selected.some(function (item) { return item.player === leg.player; })) return false;
      if (!sameGame && selected.some(function (item) { return item.game === leg.game; })) return false;
      selected.push(leg);
      return selected.length === need;
    });
    return selected;
  }

  function score(legs) {
    return legs.reduce(function (total, leg) { return total + leg.confidence; }, 0);
  }

  function select(legs, slot, used) {
    var pool = legs.filter(function (leg) { return !used || !used[leg.player + "|" + leg.market]; });
    if (slot.long) pool = pool.filter(function (leg) { return leg.odds > 0; });
    if (slot.same) {
      var groups = {};
      pool.forEach(function (leg) { (groups[leg.game] || (groups[leg.game] = [])).push(leg); });
      return Object.keys(groups)
        .map(function (game) { return pick(groups[game], slot.need, true); })
        .filter(function (group) { return group.length === slot.need; })
        .sort(function (a, b) { return score(b) - score(a); })[0] || [];
    }
    return pick(pool, slot.need, false);
  }

  function liveCards(data) {
    var legs = allLegs(data);
    var used = {};
    return slots.map(function (slot) {
      var selected = select(legs, slot, slot.alternate ? used : null);
      if (!slot.same && !slot.long) {
        selected.forEach(function (leg) { used[leg.player + "|" + leg.market] = true; });
      }
      return { title: slot.title, legs: selected };
    });
  }

  function orderedCards(cards) {
    return slots.map(function (slot) {
      return (cards || []).find(function (card) { return card.title === slot.title; }) || { title: slot.title, legs: [] };
    });
  }

  function renderCard(slot, legs, archived) {
    var playable = legs.length === slot.need;
    if (!playable) {
      return '<article class="card ' + (slot.long ? "long " : "") + 'skip"><div class="top"><div><div class="kicker">' + slot.kicker + '</div><h2>' + slot.title + '</h2></div><span class="decision skip">SKIP</span></div><div class="empty"><b>NO FORCED PARLAY</b><p>No qualifying combination was locked for this parlay type.</p></div></article>';
    }

    var result = grade(legs);
    var badge = result || (archived ? "LOCKED" : "PLAY");
    var badgeClass = result ? " " + result.toLowerCase() : "";
    var rows = legs.map(function (leg, index) {
      var actual = leg.actual !== "" && leg.actual != null ? " · " + esc(leg.actual) : "";
      var resultLine = leg.result ? '<span class="leg-result ' + esc(leg.result) + '">' + esc(leg.result) + actual + '</span>' : "";
      return '<div class="leg"><span class="num">' + (index + 1) + '</span><div><strong>' + esc(leg.player) + '</strong><small>' + esc(leg.team) + ' vs ' + esc(leg.opponent) + ' · ' + esc(leg.market) + '</small></div><div class="pick"><b>' + esc(leg.pick) + '</b><span>' + showOdds(leg.odds) + '</span>' + resultLine + '</div></div>';
    }).join("");
    var why = result ? "All legs were graded from final game statistics." : "These selections and prices are locked and will remain visible after the games.";
    return '<article class="card ' + (slot.long ? "long" : "") + '"><div class="top"><div><div class="kicker">' + slot.kicker + '</div><h2>' + slot.title + '</h2></div><span class="decision' + badgeClass + '">' + badge + '</span></div><div class="price"><span>COMBINED ODDS</span><b>' + combined(legs) + '</b>' + (result ? '<em class="' + result + '">' + result + '</em>' : "") + '</div><div class="legs">' + rows + '</div><div class="why">' + why + '</div></article>';
  }

  function selectedSlate() {
    return (history.slates || []).find(function (slate) { return slate.slate_date === activeDate; });
  }

  function labelDate(value) {
    var date = new Date(value + "T12:00:00Z");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
  }

  function renderTabs() {
    var dates = (history.slates || []).map(function (slate) { return slate.slate_date; });
    if (liveData.slate_date && dates.indexOf(liveData.slate_date) < 0) dates.unshift(liveData.slate_date);
    document.querySelector("#history-tabs").innerHTML = dates.slice(0, 7).map(function (date) {
      return '<button class="history-tab ' + (date === activeDate ? "active" : "") + '" data-date="' + esc(date) + '">' + labelDate(date) + '</button>';
    }).join("");
    Array.prototype.slice.call(document.querySelectorAll(".history-tab")).forEach(function (button) {
      button.onclick = function () {
        activeDate = button.dataset.date;
        render();
      };
    });
  }

  function render() {
    var slate = selectedSlate();
    var archived = Boolean(slate);
    var cards = orderedCards(slate ? slate.cards : liveCards(liveData));
    document.querySelector("#grid").innerHTML = cards.map(function (card, index) {
      return renderCard(slots[index], card.legs || [], archived);
    }).join("");

    var playable = cards.filter(function (card, index) { return (card.legs || []).length === slots[index].need; });
    var grades = playable.map(function (card) { return grade(card.legs || []); });
    var status = document.querySelector("#status");
    if (playable.length && grades.every(Boolean)) status.textContent = "RESULTS FINAL";
    else if (grades.some(Boolean)) status.textContent = "GRADING";
    else if (archived && playable.length) status.textContent = "PARLAYS LOCKED";
    else if (playable.length) status.textContent = "MODEL LIVE";
    else status.textContent = "MODEL SKIP";
    status.classList.toggle("skip", !playable.length);
    renderTabs();
  }

  Promise.all([
    fetch("data/player_props.json?ts=" + Date.now()).then(function (response) {
      if (!response.ok) throw Error("player props unavailable");
      return response.json();
    }),
    fetch("data/parlay_history.json?ts=" + Date.now()).then(function (response) {
      return response.ok ? response.json() : { slates: [] };
    }).catch(function () { return { slates: [] }; }),
  ]).then(function (values) {
    liveData = values[0];
    history = values[1] || { slates: [] };
    activeDate = liveData.slate_date || ((history.slates || [])[0] || {}).slate_date || "";
    render();
  }).catch(function () {
    render();
    document.querySelector("#status").textContent = "DATA PENDING";
  });
}());
