const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('player-props.html', 'utf8');
const context = {};
vm.createContext(context);
for (const name of ['esc', 'odds', 'name', 'modelTarget', 'targetText', 'sourceText', 'signalScore', 'signalMetric', 'result', 'card', 'hero']) {
  const line = html.split('\n').find(line => line.startsWith('function ' + name + '('));
  assert.ok(line, 'Missing rendering helper: ' + name);
  vm.runInContext(line, context);
}
const model = {player: 'Test, Hitter', decision: 'PLAY', book: 'LAUNCHPOINT',
  target: 1, line: 1, side: '1+', odds: null, category: 'HITS', projection: 1.3};
const hero = context.hero(model);
assert.match(hero, /MODEL TARGET/);
assert.match(hero, /LAUNCHPOINT MODEL TARGET/);
assert.doesNotMatch(hero, /SPORTSBOOK|1\+ 1/);
assert.match(context.card(model), /TARGET/);
const historical = {...model, book: 'fanduel', target: undefined, odds: 120, line: 0.5, side: 'OVER'};
assert.match(context.hero(historical), /SPORTSBOOK/);
assert.match(context.hero(historical), /\+120/);
assert.match(context.hero(historical), /OVER 0.5/);
console.log('Model targets and historical sportsbook cards render with distinct labels.');

const scored = {...model, signal_score: 69, confidence: null};
assert.match(context.hero(scored), /MODEL SIGNAL/);
assert.match(context.hero(scored), /69 \/ 100/);
assert.match(context.hero(scored), /Not a hit probability/);
assert.doesNotMatch(context.hero(scored), /CONFIDENCE|69%/);
const legacy = {...model, confidence: 66};
assert.match(context.hero(legacy), /66 \/ 100/);
assert.doesNotMatch(context.hero(legacy), /66%/);
const pitcher = {...legacy, market: 'pitcher_strikeouts', category: 'STRIKEOUTS', confidence: 60};
assert.match(context.hero(pitcher), /HIT CHANCE/);
assert.match(context.hero(pitcher), /Not validated/);
assert.doesNotMatch(context.hero(pitcher), /60%|60 \/ 100/);
assert.match(context.hero({...model, signal_score: NaN}), /Not validated/);
console.log('New and historical heuristic scores are not displayed as hit probabilities.');

for (const file of ['player-props.html', 'index.html']) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1], {filename: file});
  }
}
assert.match(fs.readFileSync('index.html', 'utf8'), /<span>Model signals<\/span>/);
