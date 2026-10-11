const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const leg = (name, type = 'HR', game = '849831') => ({label:name, type, game_pk:game, detail:'1+'});
async function render(cards, history = [], fail = false) {
  const buttons = [];
  const host = {innerHTML:'', querySelectorAll(){
    buttons.length = 0;
    for (const match of this.innerHTML.matchAll(/data-generator-date="([^"]+)"/g)) {
      const button = {date:match[1], getAttribute(){return this.date;}, addEventListener(name, callback){this.click = callback;}};
      buttons.push(button);
    }
    return buttons;
  }}, status = {classList:{toggle(){}}};
  const context = {Set, Date, Number, window:{addEventListener(){}},
    document:{getElementById(id){return id === 'generator-grid' ? host : status;}, addEventListener(){}},
    fetch:async(url)=>{
      if (fail) throw Error('offline');
      return {ok:true, json:async()=>url.includes('history') ? {snapshots:history} :
        {slate_date:'2026-10-11', generated_at_utc:'2026-10-11T07:00:00Z', cards}};
    }};
  vm.runInNewContext(fs.readFileSync('scripts/generator-cards.js','utf8'), context);
  await new Promise(resolve=>setImmediate(resolve));
  return {host, status, buttons};
}
(async()=>{
  const first = await render([
    {style:'SAFE', legs:[leg('A','RUNS'), leg('A','TOTAL BASES')]},
    {style:'AGGRESSIVE', legs:[leg('A'), leg('B')]},
    {style:'LONGSHOT', legs:[leg('A'), leg('B')]},
    {style:'BALANCED', legs:[leg('C','HITS','2'), leg('D','HITS','3')]}
  ]);
  assert.equal((first.host.innerHTML.match(/<article/g)||[]).length, 2);
  assert.match(first.host.innerHTML, /Main card/);
  assert.match(first.host.innerHTML, /Distinct alternative/);
  assert.match(first.host.innerHTML, /Same-game legs/);
  assert.match(first.host.innerHTML, /Saved feed/);
  assert.match(first.host.innerHTML, /UNVERIFIED/);
  assert.doesNotMatch(first.host.innerHTML, /SAFE|LONGSHOT|AGGRESSIVE|BALANCED/);
  assert.equal((first.host.innerHTML.match(/<strong>A<\/strong>/g)||[]).length, 1);
  const empty = await render([{legs:[leg('A'), leg('A','RUNS')]}]);
  assert.doesNotMatch(empty.host.innerHTML, /<article/);
  const archived = {slate_date:'2026-10-10', generated_at_utc:'2026-10-10T20:00:00Z', graded_at_utc:'2026-10-11T03:00:00Z',
    cards:[{verification_status:'VERIFIED PREGAME', locked_at_utc:'2026-10-10T20:00:00Z', result:'MISS',
      legs:[{...leg('Winner'), result:'HIT', actual:12}, {...leg('Other'), result:'MISS', actual:0}]}]};
  const page = await render([], [archived]);
  page.buttons.find(b=>b.date === '2026-10-10').click();
  assert.match(page.host.innerHTML, /HIT · Actual: 12/);
  assert.match(page.host.innerHTML, /MISS · Actual: 0/);
  assert.match(page.host.innerHTML, /MISS · 2 LEGS/);
  assert.match(page.host.innerHTML, /Results checked/);
  const missing = await render([{verification_status:'VERIFIED PREGAME', result:'UNAVAILABLE', legs:[{...leg('A'), result:'UNAVAILABLE'}, {...leg('B'), result:'PENDING'}]}]);
  assert.match(missing.host.innerHTML, /UNAVAILABLE · 2 LEGS/);
  assert.doesNotMatch(missing.host.innerHTML, /MISS/);
  const offline = await render([], [], true);
  assert.equal(offline.status.textContent, 'FEED UNAVAILABLE');
  assert.match(offline.host.innerHTML, /does not mean the cards were deleted/);
  console.log('Parlay display checks passed: distinct cards, legacy exclusion, preserved date history, leg and card grades, missing stats and unavailable feeds.');
})().catch(error=>{console.error(error);process.exit(1);});
