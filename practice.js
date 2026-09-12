/* Shared, provider-independent ceremony cursor. API keys remain browser-local. */
(function () {
  'use strict';
  const STORE = 'openOrdinationConversationV1';
  const clean = s => s.replace(/^\d+\.\s*/, '').replace(/\(3 จบ\)/g, '').trim();
  const normalize = s => s.normalize('NFC').replace(/[^\u0e00-\u0e7f]/g, '');
  const COACH = ['เริ่มซ้อมจากวรรคที่ค้างไว้นะครับ', 'เชิญท่องวรรคถัดไปครับ', 'ลองวรรคนี้ใหม่ไหมครับ',
    'ค่อย ๆ ครับ ไม่ต้องรีบ', 'ฟังไม่ชัด ลองวรรคเดิมอีกครั้งนะครับ', 'ถูกต้องครับ',
    'เริ่มบทนี้ใหม่ครับ', 'เริ่มพิธีใหม่ครับ', 'เราซ้อมตามต้นฉบับสามหน้านี้ก่อนนะครับ',
    'บันทึกไว้แล้ว กดพักเพื่อปิดไมค์ได้ครับ', 'ซ้อมครบแล้วครับ', 'กล่าวตามนะครับ'];
  function allowedPhrases() {
    const step = steps[state.index];
    return [...COACH, step?.prompt, step?.expected].filter(Boolean);
  }
  function withinScript(text, phrases) {
    const compact = s => s.normalize('NFC').replace(/[\p{P}\p{Z}\s]/gu, '');
    const target = compact(text), words = phrases.map(compact).filter(Boolean);
    const reachable = new Set([0]);
    for (let i = 0; i < target.length; i++) if (reachable.has(i))
      for (const word of words) if (target.startsWith(word, i)) reachable.add(i + word.length);
    return target.length > 0 && reachable.has(target.length);
  }
  function buildSteps() {
    const out = [];
    function section(lesson, phase = 'first') {
      const lines = S[lesson].p.split('\n').filter(s => s.trim());
      const notes = SOURCE_CONTEXT[lesson] || {};
      let context = [], lead = '';
      function add(text, prompt = '', round = 1, line = 0) {
        out.push({id: `${phase}:${lesson}:${out.length}`, lesson, line, round,
          title: S[lesson].t, page: lesson < 7 ? 1 : lesson < 10 ? 2 : 3,
          expected: clean(text), prompt, context: context.join('\n')});
        context = []; lead = '';
      }
      for (let n = 0; n <= lines.length; n++) {
        for (const [role, text] of notes[n] || []) {
          if (role === 'ผู้บวชตอบ') add(text, lead, 1, n);
          else if (role === 'พระพูด') lead = text;
          else context.push(`${role}: ${text}`);
        }
        if (n === lines.length) break;
        if ([2, 3].includes(lesson)) {
          // The complete robe request is repeated, not each line three times.
          for (let round = 1; round <= 3; round++)
            lines.forEach((line, i) => add(line, '', round, i));
          break;
        }
        const parts = lines[n].split(' — '), repeats = /\(3 จบ\)/.test(lines[n]) ? 3 : 1;
        if (lesson === 4) {
          clean(lines[n]).split(/\s+/).forEach(word => add(word, word, 1, n));
        } else {
          for (let round = 1; round <= repeats; round++) {
            const expected = parts.length === 2 ? parts[1] : lines[n];
            add(expected, parts.length === 2 ? parts[0] : [6, 7].includes(lesson) ? clean(expected) : lead, round, n);
          }
        }
      }
    }
    for (let i = 0; i < 14; i++) section(i);
    // Page 3 explicitly requires the same questions again before the sangha.
    [10, 11, 12].forEach(i => section(i, 'sangha'));
    section(14);
    return out;
  }
  const steps = buildSteps();
  function restore(raw) {
    try {
      const s = JSON.parse(raw);
      if (s?.version === 1 && Number.isInteger(s.index) && s.index >= 0 && s.index <= steps.length)
        return {...s, revision: Number.isInteger(s.revision) ? s.revision : 0};
    } catch (_) {}
    return {version: 1, index: 0, revision: 0, attempts: 0};
  }
  let state = restore(localStorage.getItem(STORE)), connection = null, messages = [];
  let notice = '', userText = '', teacherText = '';
  function snapshot() {
    return {revision: state.revision, index: state.index, total: steps.length,
      current: steps[state.index] || null, attempts: state.attempts, finished: state.index === steps.length};
  }
  function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
  function reset(scope) {
    if (scope === 'ceremony') state.index = 0;
    else if (scope === 'section') {
      const here = steps[Math.min(state.index, steps.length - 1)];
      while (state.index > 0 && steps[state.index - 1].lesson === here.lesson) state.index--;
    }
    state.attempts = 0; state.revision++; save();
  }
  function transition(args) {
    if (args.revision !== state.revision) return {...snapshot(), instruction: 'สถานะเก่า ห้ามข้ามบท ใช้ current ใหม่'};
    if (args.action === 'restart_ceremony' || args.action === 'restart_section') {
      if (!/เริ่ม|ใหม่|ย้อน|ตั้งแต่ต้น|อีกรอบ/.test(args.heard || ''))
        return {...snapshot(), instruction: 'ยังไม่ได้รับคำขอเริ่มใหม่ ให้ถามผู้ท่องก่อน'};
      reset(args.action === 'restart_ceremony' ? 'ceremony' : 'section');
    } else if (args.action === 'retry') {
      state.attempts++; state.revision++; save();
    } else if (args.action === 'complete' && steps[state.index]) {
      const expected = steps[state.index].expected;
      // Ignore spacing/punctuation only. Never advance because of an AI judgement alone.
      let matches = normalize(expected) === normalize(args.heard || '');
      if (expected.includes('(ฉายาที่พระอุปัชฌาย์ตั้งให้)')) {
        const heard = normalize(args.heard || '');
        matches = heard.startsWith('อะหังภันเต') && heard.endsWith('นามะ') && heard.length > 'อะหังภันเตนามะ'.length;
      }
      if (!matches) return {...snapshot(), instruction: 'ยังยืนยันว่าครบวรรคไม่ได้ อย่าบอกว่าผิดแน่นอน อาจฟังคลาดเคลื่อน ชวนลองวรรคเดิมช้า ๆ ไม่ข้ามไป'};
      state.index++; state.attempts = 0; state.revision++; save();
    }
    render();
    return {...snapshot(), allowed_speech: allowedPhrases(), instruction: 'ใช้สถานะนี้เท่านั้น กล่าว prompt ถ้ามี แล้วรอฟัง expected ห้ามอ่านคำตอบแทนผู้ท่อง'};
  }
  const tool = {name: 'practice_turn', description: 'Read authoritative progress or submit the actually heard CURRENT verse, retry, or explicit user restart. Never invent heard text or copy the expected answer. Always call before advancing.',
    parameters: {type: 'object', properties: {
      action: {type: 'string', enum: ['status', 'complete', 'retry', 'restart_section', 'restart_ceremony']},
      revision: {type: 'integer'}, heard: {type: 'string'}
    }, required: ['action', 'revision', 'heard']}};
  function instructions() {
    return `คุณเป็นผู้ช่วยซ้อมพิธี ไม่ใช่พระจริง สนทนาไทยด้วยเสียงอย่างใจเย็น
ขอบเขตตายตัว: ซ้อมเฉพาะข้อความจากต้นฉบับสามหน้าที่ให้ใน current เท่านั้น ห้ามแต่งบาลี ห้ามเล่าธรรมะ/ความรู้/ตอบเรื่องอื่น หากถามนอกบทให้พูดเพียง “เราซ้อมตามต้นฉบับสามหน้านี้ก่อนนะครับ” แล้วกลับวรรคเดิม ไม่มีเครื่องมือค้นหา
สถานะจาก practice_turn เท่านั้นเป็นความจริง คุณห้ามเปลี่ยนบท วรรค รอบ หรือตัดสินว่าจบเอง ต้องเรียก practice_turn พร้อม revision ปัจจุบันและข้อความที่ได้ยินจริง ห้ามกรอก expected แทนเสียงผู้ใช้
current.prompt คือบทพระ (ถ้ามี) ให้กล่าวตรงตามนั้น แล้วรอฟัง current.expected ที่ผู้ท่องต้องพูด บทให้กล่าวตามให้คุณกล่าวนำ ส่วนท่องเองห้ามเฉลยจนขอใบ้ ถ้า current.context เป็นคำบรรยาย ไม่ใช่บทบาลีที่ให้สวด อย่าแต่งสวดที่เอกสารไม่ได้ให้ไว้
เมื่อถูกและเครื่องมือยืนยัน ให้ไปวรรคถัดไป ไม่ต้องชมทุกคำ เมื่อไม่แน่ใจให้บอกว่าฟังไม่ชัด ไม่ตัดสินผิด เมื่อท่องติดขัด/พูดซ้ำหลายครั้งให้พูดว่า “ค่อย ๆ ครับ ลองวรรคนี้ใหม่ไหม” และรอคำตอบ เงียบชั่วคราวไม่ใช่ความผิด ห้ามรีเซ็ตเอง
“เริ่มใหม่” หมายถึง restart_section; “เริ่มพิธีใหม่/เริ่มทั้งหมด/ตั้งแต่ต้นพิธี” หมายถึง restart_ceremony; “วรรคนี้ใหม่” ใช้ retry ห้ามล้างความคืบหน้า เมื่อผู้ท่องตอบรับข้อเสนอเริ่มใหม่ให้ส่งคำขอจริงของเขา
พัก/จบการซ้อม ให้บอกว่าบันทึกไว้แล้วและชี้ปุ่มพัก ไม่เปลี่ยนตำแหน่ง หาก finished ให้แจ้งซ้อมครบแล้วและรอคำขอเริ่มใหม่ ห้ามวนเอง
เริ่ม/เชื่อมต่อใหม่: ซ้อมต่อจาก current ไม่กลับต้น อนุญาตคำใบ้เฉพาะ expected และคำบรรยายจาก current เท่านั้น ไม่มีบทอื่นอยู่ในบริบท ห้ามแต่งฉายา ให้ผู้ใช้กล่าวฉายาจริงเอง
ข้อบังคับเสียง: คุณพูดได้เฉพาะข้อความต่อไปนี้แบบตรงตัวหนึ่งข้อความหรือหลายข้อความต่อกัน ห้ามเติมคำอื่น ห้ามอ่าน JSON หรือชื่อเครื่องมือ รายการจะเปลี่ยนตาม current ในผลเครื่องมือ: ${JSON.stringify(allowedPhrases())}
คำบรรยายท่าทางแสดงให้ผู้ท่องอ่านบนหน้าจอ ไม่ต้องอ่านออกเสียง เพราะไม่ใช่บทพูด
สถานะเริ่มต้น: ${JSON.stringify(snapshot())}`;
  }
  function append(role, text) {
    if (!text.trim()) return;
    messages.push({role, text}); messages = messages.slice(-60); renderMessages();
  }
  function renderMessages() {
    const box = document.getElementById('practiceChat'); if (!box) return;
    box.replaceChildren();
    for (const m of messages) {
      const row = document.createElement('div'); row.className = 'chat-row' + (m.role === 'คุณ' ? ' user' : '');
      const bubble = document.createElement('div'); bubble.className = 'chat-bubble';
      const role = document.createElement('span'); role.className = 'chat-role'; role.textContent = m.role;
      bubble.append(role, document.createTextNode(m.text)); row.append(bubble); box.append(row);
    }
    box.scrollTop = box.scrollHeight;
  }
  function render() {
    const box = document.getElementById('speechQ'); if (!box) return;
    const provider = voiceProvider(), current = steps[state.index];
    const unlocked = geminiUnlocked && localStorage.getItem(provider === 'openai' ? openaiKeyStore : geminiKeyStore);
    box.innerHTML = `<p><b>${provider === 'openai' ? 'OpenAI' : 'Gemini'} · ซ้อมโต้ตอบตามต้นฉบับ</b></p>
      <p id="practicePosition"></p><p id="practiceContext" class="muted"></p><div class="progress"><div class="bar" style="width:${100 * state.index / steps.length}%"></div></div>
      <p class="muted">พูด “เริ่มใหม่” เพื่อเริ่มบทนี้ หรือ “เริ่มพิธีใหม่” เพื่อกลับต้น · ความคืบหน้าใช้ร่วมกันทั้งสองค่าย</p>
      <div class="actions"><button class="btn main" onclick="OrdinationPractice.start()" ${connection || !unlocked ? 'disabled' : ''}>${state.index ? 'ซ้อมต่อจากเดิม' : 'เริ่มซ้อมด้วยเสียง'}</button>
      <button class="btn" onclick="OrdinationPractice.stop()">พัก / ปิดไมค์</button>
      <button class="btn" onclick="OrdinationPractice.restart('section')">เริ่มบทนี้ใหม่</button>
      <button class="btn" onclick="OrdinationPractice.restart('ceremony')">เริ่มพิธีใหม่</button></div>
      ${!unlocked ? '<p>ไปที่ตั้งค่าเพื่อปลดล็อกและกรอก API key ของค่ายที่เลือกก่อน</p>' : ''}
      <p id="practiceStatus" role="status"></p><details><summary>ดูวรรคที่กำลังซ้อม</summary><p id="practiceExpected" class="pali"></p></details>
      <p class="muted">เสียงผู้ช่วยสร้างด้วย AI การฟังและออกเสียงบาลีอาจคลาดเคลื่อน ให้ยึดต้นฉบับเป็นหลัก</p><div id="practiceChat" class="voice-chat" role="log"></div>`;
    document.getElementById('practicePosition').textContent = current ? `หน้า ${current.page}/3 · ${current.title} · วรรค ${current.line + 1} · รอบ ${current.round} · ผ่าน ${state.index}/${steps.length}` : 'ซ้อมครบตามต้นฉบับแล้ว';
    document.getElementById('practiceExpected').textContent = current?.expected || 'จบพิธี';
    document.getElementById('practiceContext').textContent = current?.context || '';
    document.getElementById('practiceStatus').textContent = notice;
    renderMessages();
  }
  function stop(renderAgain = true) {
    const c = connection; connection = null;
    if (c) {
      clearTimeout(c.timer); c.abort.abort(); c.socket?.close(); c.peer?.close();
      c.stream?.getTracks().forEach(t => t.stop()); c.processor?.disconnect(); c.source?.disconnect();
      c.playing.forEach(s => {try {s.stop();} catch (_) {}});
      c.context?.close(); if (c.audio) {c.audio.pause(); c.audio.srcObject = null;}
    }
    userText = ''; teacherText = ''; notice = 'พักแล้ว — จำวรรคที่ค้างไว้ให้แล้ว';
    if (renderAgain) render();
  }
  function restart(scope) {
    const active = !!connection; stop(false); reset(scope); messages = [];
    notice = scope === 'ceremony' ? 'กลับต้นพิธีแล้ว' : 'กลับต้นบทนี้แล้ว'; render();
    if (active) start();
  }
  function fail(c, message) { if (connection !== c) return; stop(false); notice = message; render(); }
  function pcm(c, data, rate = 24000) {
    const bytes = Uint8Array.from(atob(data), x => x.charCodeAt(0));
    const view = new DataView(bytes.buffer), buffer = c.context.createBuffer(1, bytes.length / 2, rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = c.context.createBufferSource(); source.buffer = buffer; source.connect(c.context.destination);
    c.playing.add(source); source.onended = () => c.playing.delete(source);
    c.nextAudio = Math.max(c.nextAudio, c.context.currentTime); source.start(c.nextAudio); c.nextAudio += buffer.duration;
  }
  async function start() {
    if (connection) return;
    const provider = voiceProvider(), key = localStorage.getItem(provider === 'openai' ? openaiKeyStore : geminiKeyStore);
    if (!geminiUnlocked || !key) {notice = 'ปลดล็อก API key ในตั้งค่าก่อน'; render(); return;}
    const c = {provider, key, abort: new AbortController(), playing: new Set(), nextAudio: 0, calls: new Map(), allowed: allowedPhrases(), audioChunks: [], audioEpoch: 0};
    connection = c; notice = 'กำลังเชื่อมต่อ…'; render();
    c.timer = setTimeout(() => fail(c, 'เชื่อมต่อไม่สำเร็จภายใน 25 วินาที ลองใหม่ได้ ความคืบหน้ายังอยู่'), 25000);
    try {
      c.context = new AudioContext(); await c.context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, channelCount: 1}});
      if (connection !== c) {stream.getTracks().forEach(t => t.stop()); return;}
      c.stream = stream;
      if (provider === 'openai') await connectOpenAI(c, key); else connectGemini(c, key);
    } catch (_) {fail(c, 'เปิดการซ้อมไม่ได้ ตรวจสิทธิ์ไมโครโฟน อินเทอร์เน็ต และ API key ในตั้งค่า');}
  }
  function ready(c) {clearTimeout(c.timer); notice = 'เชื่อมต่อแล้ว — พูดได้เลย ระบบรอให้ท่องจบ'; render();}
  function result(c, id, args) {
    if (c.calls.has(id)) return c.calls.get(id);
    const r = transition(args); c.allowed = [...c.allowed, ...allowedPhrases()];
    c.calls.set(id, r); return {...r, allowed_speech: allowedPhrases()};
  }
  async function playApproved(c, text) {
    if (connection !== c || !text.trim()) {c.audioChunks = []; return;}
    if (!withinScript(text, c.allowed)) {
      c.audioChunks = []; c.allowed = allowedPhrases();
      notice = 'ระงับเสียงที่ไม่ตรงบท — กดพักแล้วซ้อมต่อได้ ตำแหน่งยังอยู่'; render(); return;
    }
    append('ผู้ช่วยซ้อม', text); c.allowed = allowedPhrases();
    if (c.provider === 'gemini') {c.audioChunks.forEach(chunk => pcm(c, chunk)); c.audioChunks = []; return;}
    const epoch = c.audioEpoch;
    try {
      // Only validated source/coach text reaches speech generation, never free-form model prose.
      const response = await fetch('https://api.openai.com/v1/audio/speech', {method: 'POST',
        headers: {Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json'}, signal: c.abort.signal,
        body: JSON.stringify({model: 'gpt-4o-mini-tts', voice: 'cedar', input: text,
          instructions: 'อ่านเฉพาะข้อความที่ให้เป็นไทยและบาลีอย่างชัดเจน ไม่เพิ่มคำใด ๆ'})});
      if (!response.ok) throw new Error('speech failed');
      const buffer = await c.context.decodeAudioData(await response.arrayBuffer());
      if (connection !== c || epoch !== c.audioEpoch) return;
      const source = c.context.createBufferSource(); source.buffer = buffer; source.connect(c.context.destination);
      c.playing.add(source); source.onended = () => c.playing.delete(source); source.start();
    } catch (_) {if (connection === c) {notice = 'สร้างเสียงไม่ได้ ข้อความที่ผ่านตรวจยังอยู่บนหน้าจอ'; render();}}
  }
  async function connectOpenAI(c, key) {
    c.peer = new RTCPeerConnection(); c.audio = new Audio(); c.audio.autoplay = true;
    // Never play unchecked model speech. Realtime listens; validated text is voiced separately.
    c.peer.ontrack = () => {};
    c.stream.getTracks().forEach(t => c.peer.addTrack(t, c.stream));
    c.channel = c.peer.createDataChannel('oai-events');
    const send = e => {if (connection === c && c.channel.readyState === 'open') c.channel.send(JSON.stringify(e));};
    c.channel.onmessage = event => {
      if (connection !== c) return;
      const e = JSON.parse(event.data);
      if (e.type === 'session.created') {ready(c); send({type: 'response.create'});}
      if (e.type === 'conversation.item.input_audio_transcription.completed') append('คุณ', e.transcript || '');
      if (['response.output_text.done', 'response.text.done'].includes(e.type)) playApproved(c, e.text || '');
      if (e.type === 'input_audio_buffer.speech_started') {c.audioEpoch++; c.playing.forEach(s => {try {s.stop();} catch (_) {}});}
      if (e.type === 'response.function_call_arguments.done') {
        let r;
        try {r = e.name === tool.name ? result(c, e.call_id, JSON.parse(e.arguments)) : {error: 'unknown tool'};}
        catch (_) {r = {error: 'invalid arguments', ...snapshot()};}
        send({type: 'conversation.item.create', item: {type: 'function_call_output', call_id: e.call_id, output: JSON.stringify(r)}});
        c.needsResponse = true;
      }
      if (e.type === 'response.done' && c.needsResponse) {c.needsResponse = false; send({type: 'response.create'});}
      if (e.type === 'error') fail(c, 'OpenAI แจ้งข้อผิดพลาด ตรวจ API key และสิทธิ์ใช้ Realtime');
    };
    c.peer.onconnectionstatechange = () => {if (['failed', 'closed', 'disconnected'].includes(c.peer.connectionState)) fail(c, 'การเชื่อมต่อขาด — กดซ้อมต่อจากวรรคเดิมได้');};
    const session = {type: 'realtime', model: 'gpt-realtime', instructions: instructions(),
      output_modalities: ['text'], tools: [{type: 'function', ...tool}],
      audio: {input: {transcription: {model: 'gpt-4o-mini-transcribe', language: 'th'}, turn_detection: {type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true}}, output: {voice: 'cedar'}}};
    const offer = await c.peer.createOffer(); await c.peer.setLocalDescription(offer);
    const form = new FormData(); form.set('sdp', offer.sdp); form.set('session', JSON.stringify(session));
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {method: 'POST', headers: {Authorization: 'Bearer ' + key}, body: form, signal: c.abort.signal});
    if (!response.ok) throw new Error('Realtime connection failed');
    const sdp = await response.text(); if (connection === c) await c.peer.setRemoteDescription({type: 'answer', sdp});
  }
  function connectGemini(c, key) {
    // OpenAI JSON Schema and Google's wire Schema use different type enums.
    const googleSchema = schema => ({...schema, type: schema.type.toUpperCase(),
      ...(schema.properties ? {properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, googleSchema(v)]))} : {})});
    const googleTool = {...tool, parameters: googleSchema(tool.parameters)};
    const detail = value => String(value || '').split(key).join('[redacted]').replace(/AIza[\w-]+/g, '[redacted]').slice(0, 400);
    c.socket = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(key));
    const send = e => {if (connection === c && c.socket.readyState === WebSocket.OPEN) c.socket.send(JSON.stringify(e));};
    c.socket.onopen = () => send({setup: {model: 'models/gemini-3.1-flash-live-preview',
      generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Kore'}}}},
      systemInstruction: {parts: [{text: instructions()}]}, tools: [{functionDeclarations: [googleTool]}],
      inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: {automaticActivityDetection: {silenceDurationMs: 1800}}}});
    c.socket.onmessage = async event => {
      const raw = typeof event.data === 'string' ? event.data : await event.data.text();
      if (connection !== c) return;
      const e = JSON.parse(raw);
      if (e.setupComplete) {
        ready(c);
        c.source = c.context.createMediaStreamSource(c.stream); c.processor = c.context.createScriptProcessor(4096, 1, 1);
        c.processor.onaudioprocess = e => send({realtimeInput: {audio: {data: pcmBase64(e.inputBuffer.getChannelData(0), c.context.sampleRate), mimeType: 'audio/pcm;rate=16000'}}});
        c.source.connect(c.processor); c.processor.connect(c.context.destination);
        send({realtimeInput: {text: 'เริ่มซ้อมจาก current ตามสถานะที่ให้ ไม่กลับต้น'}});
      }
      if (e.toolCall) send({toolResponse: {functionResponses: e.toolCall.functionCalls.map(f => ({id: f.id, name: f.name, response: f.name === tool.name ? result(c, f.id, f.args) : {error: 'unknown tool'}}))}});
      const content = e.serverContent;
      if (content?.interrupted) {c.playing.forEach(s => {try {s.stop();} catch (_) {}}); c.playing.clear(); c.nextAudio = 0; teacherText = ''; c.audioChunks = [];}
      for (const part of content?.modelTurn?.parts || []) if (part.inlineData?.data) c.audioChunks.push(part.inlineData.data);
      if (content?.inputTranscription?.text) userText += content.inputTranscription.text;
      if (content?.outputTranscription?.text) teacherText += content.outputTranscription.text;
      if (content?.turnComplete) {append('คุณ', userText); playApproved(c, teacherText); userText = ''; teacherText = '';}
      if (e.error) fail(c, `Gemini: ${detail(e.error.message || e.error.status || 'เกิดข้อผิดพลาด')}`);
    };
    // onerror precedes onclose; wait for the close reason rather than hiding it.
    c.socket.onerror = () => {c.transportError = true;};
    c.socket.onclose = event => fail(c, `Gemini ปิดการเชื่อมต่อ (${event.code})${event.reason ? ': ' + detail(event.reason) : ' — เซิร์ฟเวอร์ไม่ได้ส่งรายละเอียด'} · ความคืบหน้ายังอยู่`);
  }
  // Both provider choices now use exactly this view, state machine and policy.
  const previousStop = stopLiveSpeech;
  stopLiveSpeech = function(renderAgain = true) {previousStop(false); stop(renderAgain);};
  renderSpeech = render;
  window.addEventListener('pagehide', () => stop(false));
  window.OrdinationPractice = {start, stop, restart, snapshot};
  if (typeof module !== 'undefined') module.exports = {buildSteps, restore, transition, snapshot, reset, steps, withinScript, COACH};
})();
