const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('const S=['), html.indexOf('// ponytail: one shared list'));
const values = new Map();
const context = vm.createContext({module: {exports: {}}, localStorage: {
  getItem: k => values.get(k), setItem: (k, v) => values.set(k, v)
}, document: {getElementById: () => null}, window: {addEventListener() {}},
  stopLiveSpeech() {}, renderSpeech() {}, voiceProvider: () => 'gemini'});
vm.runInContext(source + '\n' + fs.readFileSync('practice.js', 'utf8'), context);
const engine = context.module.exports;
assert.equal(engine.restore('{broken').index, 0);
assert.equal(engine.restore('{"version":1,"index":99999}').index, 0);
const first = engine.snapshot();
assert.equal(first.index, 0);
assert.equal(engine.transition({action: 'complete', revision: 0, heard: 'ไม่ครบ'}).index, 0);
assert.equal(engine.transition({action: 'complete', revision: 0, heard: first.current.expected}).index, 1);
assert.equal(engine.transition({action: 'complete', revision: 0, heard: first.current.expected}).index, 1, 'stale completion cannot advance twice');
assert.equal(engine.restore(values.get('openOrdinationConversationV1')).index, 1, 'resume across providers and reload');
let state = engine.snapshot();
engine.transition({action: 'retry', revision: state.revision, heard: 'ลองวรรคนี้ใหม่'});
assert.equal(engine.snapshot().index, 1, 'retry never resets progress');
state = engine.snapshot();
engine.transition({action: 'restart_ceremony', revision: state.revision, heard: ''});
assert.equal(engine.snapshot().index, 1, 'no implicit reset on silence');
engine.transition({action: 'restart_section', revision: state.revision, heard: 'เริ่มใหม่'});
assert.equal(engine.snapshot().index, 0);
// Complete the entire source sequence, including explicit repetitions.
let count = 0;
while (!engine.snapshot().finished && count++ < 300) {
  state = engine.snapshot();
  const heard = state.current.expected.replace('(ฉายาที่พระอุปัชฌาย์ตั้งให้)', 'สุเมโธ');
  engine.transition({action: 'complete', revision: state.revision, heard});
}
assert(engine.snapshot().finished);
assert(count === engine.steps.length);
assert.equal(engine.steps.filter(s => s.lesson === 2).length, 9, 'robe request repeats whole three-line block three times');
assert.equal(engine.steps.filter(s => s.lesson === 4).length, 10, 'meditation guided word by word');
assert.equal(engine.steps.filter(s => s.lesson === 10).length, 10, 'five questions are repeated in sangha');
assert.equal(engine.steps.filter(s => s.lesson === 11).length, 16);
assert(engine.steps.some(s => s.prompt === 'ยะมะหัง วะทามิตัง วะเทหิ'));
assert(engine.steps.some(s => s.prompt === 'ปฏิรูปัง' && s.expected === 'อุกาสะ สัมปฏิจฉามิ'));
state = engine.snapshot();
engine.transition({action: 'restart_ceremony', revision: state.revision, heard: 'เริ่มพิธีใหม่'});
assert.equal(engine.snapshot().index, 0);
assert(html.includes('./practice.js'));
assert(engine.withinScript('ถูกต้องครับ อามะ ภันเต', [...engine.COACH, 'อามะ ภันเต']));
assert(!engine.withinScript('อามะ ภันเต วันนี้อากาศดี', [...engine.COACH, 'อามะ ภันเต']));
assert(!engine.withinScript('อามะ ภันเต Here is unrelated advice', ['อามะ ภันเต']));
assert(!engine.withinScript('สัพพะทุกขะ', ['อามะ ภันเต']), 'a different verse is blocked');
assert(fs.readFileSync('sw.js', 'utf8').includes('./practice.js'));
console.log(`Shared practice: ${engine.steps.length} source steps, repeats, stale-event rejection, retry, restart and persistence passed`);
