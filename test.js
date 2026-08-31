const assert=require('node:assert');
const html=require('node:fs').readFileSync('index.html','utf8');
const listen=html.match(/<main id="listen"[\s\S]*?<main id="test"/)[0];

assert(listen.includes('PLXRewNkdAh9XyUiNo8xRt365g09gb-nkz'));
assert(listen.includes('./trainer.html'));
assert(!listen.includes('onclick="speak('));
console.log('listen tab uses the YouTube playlist');
