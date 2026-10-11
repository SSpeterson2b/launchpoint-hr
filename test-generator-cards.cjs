const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
async function render(cards) {
 const host = {innerHTML:""}, status = {classList:{toggle(){}}};
 const context = {Set, Date, Number, window:{addEventListener(){}}, document:{getElementById(id){return id==="generator-grid"?host:status;},addEventListener(){}},
 fetch:async()=>({ok:true,json:async()=>({slate_date:"2026-10-10",generated_at_utc:"2026-10-11T00:51:59Z",cards})})};
 vm.runInNewContext(fs.readFileSync("scripts/generator-cards.js","utf8"),context);
 await new Promise(resolve=>setImmediate(resolve)); return host.innerHTML;
}
(async()=>{
 const leg=(name,type="HR",game="849831")=>({label:name,type,game_pk:game,detail:"1+"});
 const html=await render([
 {style:"SAFE",legs:[leg("A","RUNS"),leg("A","TOTAL BASES")]},
 {style:"AGGRESSIVE",legs:[leg("A"),leg("B")]},
 {style:"LONGSHOT",legs:[leg("A"),leg("B")]},
 {style:"BALANCED",legs:[leg("C","HITS","2"),leg("D","HITS","3")]}
 ]);
 assert.equal((html.match(/<article/g)||[]).length,2);
 assert.match(html,/Main card/); assert.match(html,/Distinct alternative/);
 assert.match(html,/Same-game legs/); assert.match(html,/2026-10-10/);
 assert.match(html,/Feed updated/); assert.doesNotMatch(html,/SAFE|LONGSHOT|AGGRESSIVE|BALANCED/);
 assert.equal((html.match(/<strong>A<\/strong>/g)||[]).length,1);
 const empty=await render([{legs:[leg("A"),leg("A","RUNS")]}]);
 assert.doesNotMatch(empty,/<article/); assert.match(empty,/No distinct combination/);
 console.log("Parlay overlap, repeated-player, risk-label, timestamp and empty-card checks passed.");
})().catch(e=>{console.error(e);process.exit(1)});
