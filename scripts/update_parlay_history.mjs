import fs from "node:fs";

const INPUT_PATH = "data/player_props.json";
const OUTPUT_PATH = "data/parlay_history.json";
const KEEP_SLATES = 14;

const slots = [
  { title: "Top 2-Leg Parlay", need: 2 },
  { title: "Same-Game Parlay", need: 2, same: true },
  { title: "Player Prop Parlay", need: 2, alternate: true },
  { title: "Long-Shot Parlay", need: 3, long: true },
];

function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function readInput() {
  if (!process.argv.includes("--stdin")) return readJson(INPUT_PATH, { games: [] });
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text);
}

function displayName(value) {
  const text = String(value || "");
  if (!text.includes(",")) return text;
  const parts = text.split(",");
  return `${parts.slice(1).join(",").trim()} ${parts[0].trim()}`.trim();
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function allLegs(data) {
  const legs = [];
  for (const game of data.games || []) {
    for (const prop of game.props || []) {
      const odds = number(prop.odds);
      if (prop.decision !== "PLAY" || odds === null || Number(prop.confidence || 0) < 60) continue;
      legs.push({
        game: String(game.game_pk),
        start: game.game_datetime_utc || "",
        player: displayName(prop.player),
        player_id: prop.player_id || null,
        team: prop.team || "",
        opponent: prop.opponent || "",
        market: prop.category || "",
        side: prop.side || "",
        line: number(prop.line),
        pick: `${prop.side || ""} ${prop.line ?? ""}`.trim(),
        odds,
        confidence: Number(prop.confidence || 0),
        result: prop.result || "",
        actual: prop.actual ?? "",
      });
    }
  }
  return legs.sort((a, b) => b.confidence - a.confidence);
}

function pick(pool, need, sameGame) {
  const selected = [];
  pool.some((leg) => {
    if (selected.some((item) => item.player === leg.player)) return false;
    if (!sameGame && selected.some((item) => item.game === leg.game)) return false;
    selected.push({ ...leg });
    return selected.length === need;
  });
  return selected;
}

function score(legs) {
  return legs.reduce((total, leg) => total + leg.confidence, 0);
}

function select(legs, slot, used) {
  let pool = legs.filter((leg) => !used || !used[`${leg.player}|${leg.market}`]);
  if (slot.long) pool = pool.filter((leg) => leg.odds > 0);
  if (slot.same) {
    const groups = {};
    for (const leg of pool) (groups[leg.game] ||= []).push(leg);
    return Object.values(groups)
      .map((group) => pick(group, slot.need, true))
      .filter((group) => group.length === slot.need)
      .sort((a, b) => score(b) - score(a))[0] || [];
  }
  return pick(pool, slot.need, false);
}

function buildCards(data) {
  const legs = allLegs(data);
  const used = {};
  return slots.map((slot) => {
    const selected = select(legs, slot, slot.alternate ? used : null);
    if (!slot.same && !slot.long) {
      for (const leg of selected) used[`${leg.player}|${leg.market}`] = true;
    }
    return { title: slot.title, legs: selected };
  });
}

function playableCount(cards) {
  return cards.filter((card, index) => card.legs.length === slots[index].need).length;
}

function firstStart(cards) {
  const starts = cards.flatMap((card) => card.legs.map((leg) => Date.parse(leg.start))).filter(Number.isFinite);
  return starts.length ? new Date(Math.min(...starts)).toISOString() : "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resultFor(actual, side, line) {
  if (!Number.isFinite(actual) || !Number.isFinite(line)) return "";
  if (actual === line) return "PUSH";
  const over = actual > line;
  return String(side).toUpperCase() === "UNDER" ? (over ? "MISS" : "HIT") : (over ? "HIT" : "MISS");
}

function playerFromFeed(feed, playerName) {
  const players = {
    ...(feed.liveData?.boxscore?.teams?.away?.players || {}),
    ...(feed.liveData?.boxscore?.teams?.home?.players || {}),
  };
  const target = normalize(playerName);
  return Object.values(players).find((player) => normalize(player.person?.fullName) === target) || null;
}

function actualFor(leg, player) {
  if (!player) return { value: null, display: "DNP", voided: true };
  if (leg.market === "STRIKEOUTS") {
    const pitching = player.stats?.pitching;
    if (!pitching || pitching.gamesPlayed === 0) return { value: null, display: "DNP", voided: true };
    const value = Number(pitching.strikeOuts || 0);
    return { value, display: String(value), voided: false };
  }
  const batting = player.stats?.batting;
  if (!batting || batting.gamesPlayed === 0) return { value: null, display: "DNP", voided: true };
  let value = null;
  if (leg.market === "RUNS") value = Number(batting.runs || 0);
  if (leg.market === "RBI") value = Number(batting.rbi || 0);
  if (leg.market === "TOTAL BASES") {
    const hits = Number(batting.hits || 0);
    const doubles = Number(batting.doubles || 0);
    const triples = Number(batting.triples || 0);
    const homers = Number(batting.homeRuns || 0);
    value = hits + doubles + (2 * triples) + (3 * homers);
  }
  return Number.isFinite(value)
    ? { value, display: String(value), voided: false }
    : { value: null, display: "", voided: false };
}

function isFinal(feed) {
  const abstract = feed.gameData?.status?.abstractGameState || "";
  const detailed = feed.gameData?.status?.detailedState || "";
  return abstract === "Final" || /final|game over|completed early/i.test(detailed);
}

async function gradeEntry(entry) {
  const previousCards = JSON.stringify(entry.cards);
  const games = [...new Set(entry.cards.flatMap((card) => card.legs.map((leg) => leg.game)))];
  const feeds = {};
  await Promise.all(games.map(async (gamePk) => {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      if (response.ok) feeds[gamePk] = await response.json();
    } catch (error) {
      console.warn(`Could not grade game ${gamePk}: ${error.message}`);
    }
  }));

  for (const card of entry.cards) {
    for (const leg of card.legs) {
      const feed = feeds[leg.game];
      if (!feed || !isFinal(feed)) continue;
      const actual = actualFor(leg, playerFromFeed(feed, leg.player));
      leg.actual = actual.display;
      leg.result = actual.voided ? "PUSH" : resultFor(actual.value, leg.side, Number(leg.line));
    }
  }

  const legs = entry.cards.flatMap((card) => card.legs);
  const graded = legs.filter((leg) => leg.result).length;
  entry.status = legs.length && graded === legs.length ? "GRADED" : graded ? "GRADING" : "LOCKED";
  if (graded && JSON.stringify(entry.cards) !== previousCards) entry.graded_at_utc = new Date().toISOString();
  else entry.graded_at_utc = entry.graded_at_utc || "";
}

function mergeInlineResults(entry, data) {
  const results = new Map();
  for (const game of data.games || []) {
    for (const prop of game.props || []) {
      if (!prop.player || !prop.result) continue;
      const key = [game.game_pk, normalize(displayName(prop.player)), prop.category, prop.side, prop.line].join("|");
      results.set(key, { result: prop.result, actual: prop.actual ?? "" });
    }
  }
  for (const card of entry.cards) {
    for (const leg of card.legs) {
      const key = [leg.game, normalize(leg.player), leg.market, leg.side, leg.line].join("|");
      const result = results.get(key);
      if (result) Object.assign(leg, result);
    }
  }
}

const data = await readInput();
if (!data.slate_date) throw new Error("player_props.json is missing slate_date");

const history = readJson(OUTPUT_PATH, { version: 1, slates: [] });
history.version = 1;
history.slates = Array.isArray(history.slates) ? history.slates : [];
const originalContent = JSON.stringify({ version: history.version, slates: history.slates });

const currentCards = buildCards(data);
let entry = history.slates.find((slate) => slate.slate_date === data.slate_date);
const now = Date.now();

if (!entry && playableCount(currentCards)) {
  entry = {
    slate_date: data.slate_date,
    generated_at_utc: data.generated_at_utc || new Date().toISOString(),
    locked_at_utc: new Date().toISOString(),
    first_game_start_utc: firstStart(currentCards),
    status: "LOCKED",
    cards: currentCards,
  };
  history.slates.push(entry);
} else if (entry && playableCount(currentCards)) {
  const lockTime = Date.parse(entry.first_game_start_utc || "");
  if (!Number.isFinite(lockTime) || now < lockTime) {
    entry.cards = currentCards;
    entry.generated_at_utc = data.generated_at_utc || entry.generated_at_utc;
    entry.locked_at_utc = new Date().toISOString();
    entry.first_game_start_utc = firstStart(currentCards);
  }
}

if (entry) {
  mergeInlineResults(entry, data);
  await gradeEntry(entry);
}

history.slates.sort((a, b) => String(b.slate_date).localeCompare(String(a.slate_date)));
history.slates = history.slates.slice(0, KEEP_SLATES);
const nextContent = JSON.stringify({ version: history.version, slates: history.slates });
if (nextContent !== originalContent || !history.updated_at_utc) history.updated_at_utc = new Date().toISOString();
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(history, null, 2)}\n`);
console.log(entry ? `${entry.slate_date}: ${entry.status} (${playableCount(entry.cards)} parlay cards preserved)` : `${data.slate_date}: no playable parlay to preserve`);
