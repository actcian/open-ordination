const assert=require('node:assert');
const html=require('node:fs').readFileSync('index.html','utf8');
const listen=html.match(/<main id="listen"[\s\S]*?<main id="test"/)[0];

assert(listen.includes('PLXRewNkdAh9XyUiNo8xRt365g09gb-nkz'));
assert(listen.includes('./trainer.html'));
assert(!listen.includes('onclick="speak('));
assert(html.includes('<main id="duo"'));
assert(html.includes('function resetDuo()'));
assert(html.includes('วรรคแรกคืออะไร?'));
assert(html.includes('สถานการณ์นี้ต้องใช้บทไหน?'));
assert(html.includes('วรรคถัดไปคืออะไร?'));
assert(html.includes('const duoOrderSteps='));
assert(html.includes('const duoChantSteps='));
assert(html.includes("setDuoMode('order')"));
assert(html.includes("setDuoMode('chant')"));
console.log('listen tab uses the YouTube playlist');
