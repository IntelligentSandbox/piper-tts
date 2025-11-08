const cred = { credentials: "same-origin" };

function numOrNull(id) {
  const v = document.getElementById(id).value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function payload(text, voice) {
  return {
    text,
    voice: voice || null,
    preset: document.getElementById("preset").value || null,
    length_scale: numOrNull("length_scale"),
    noise_w: numOrNull("noise_w"),
    sentence_silence: numOrNull("sentence_silence"),
    speaker_id: numOrNull("speaker_id"),
  };
}

const autoBox = document.getElementById("autoplay");
const pollBox = document.getElementById("pollq");
autoBox.addEventListener("change", () => {
  if (autoBox.checked) pollBox.checked = false;
});
pollBox.addEventListener("change", () => {
  if (pollBox.checked) autoBox.checked = false;
});

async function getPanelStatus() {
  const s = await fetch("/api/panel/status", cred).then((r) => r.json());
  document.getElementById("auth_status").textContent = `admin=${
    s.admin ? "on" : "off"
  } | mod=${s.mod ? "on" : "off"}`;
  const canTts = !!(s.admin || s.mod || s.tts);
  document.getElementById("submit").disabled = !canTts;
  document.getElementById("alias_admin").style.display = s.admin
    ? "block"
    : "none";
  document.getElementById("pollq").disabled = !(s.admin || s.mod);
  if (document.getElementById("pollq").disabled) pollBox.checked = false;
  return s;
}

async function login(role) {
  const id = role === "admin" ? "key_admin" : "key_mod";
  const key = document.getElementById(id).value.trim();
  if (!key) return;
  const r = await fetch("/api/panel/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, key }),
    ...cred,
  });
  if (!r.ok) {
    alert("bad key");
    return;
  }
  document.getElementById(id).value = "";
  await getPanelStatus();
  await Promise.all([loadVoices(), loadSounds()]);
  await loadVoices();
}

document
  .getElementById("login_mod")
  .addEventListener("click", () => login("mod"));
document
  .getElementById("login_admin")
  .addEventListener("click", () => login("admin"));
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/panel/logout", { method: "POST", ...cred });
  await getPanelStatus();
  await Promise.all([loadVoices(), loadSounds()]);
  await loadVoices();
});

let ALIAS_SET = new Set();

async function loadVoices() {
  const sel = document.getElementById("voices");
  const keep = sel.value;
  sel.innerHTML = "";

  let voices = [];
  let aliases = {};

  const vr = await fetch("/api/voices", cred);
  if (vr.status === 200) voices = await vr.json();

  try {
    const ar = await fetch("/api/aliases", cred);
    if (ar.status === 200) aliases = await ar.json();
  } catch {}

  if (Object.keys(aliases).length) {
    const ogA = document.createElement("optgroup");
    ogA.label = "aliases";
    for (const [n, t] of Object.entries(aliases)) {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = `${n} → ${t}`;
      o.dataset.type = "alias";
      ogA.appendChild(o);
    }
    sel.appendChild(ogA);
  }

  if (voices.length) {
    const ogV = document.createElement("optgroup");
    ogV.label = "voices";
    for (const v of voices) {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.id;
      o.dataset.type = "voice";
      ogV.appendChild(o);
    }
    sel.appendChild(ogV);
  }

  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  else if (sel.options.length) sel.selectedIndex = 0;

  const tgt = document.getElementById("alias_target");
  if (tgt) {
    const keep2 = tgt.value;
    tgt.innerHTML = "";
    for (const v of voices) {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.id;
      tgt.appendChild(o);
    }
    if ([...tgt.options].some((o) => o.value === keep2)) tgt.value = keep2;
  }

  ALIAS_SET = new Set([
    ...Object.keys(aliases).map((s) => s.toLowerCase()),
    ...voices.map((v) => v.id.toLowerCase()),
  ]);
}

function parseParts(input, fallbackVoice) {
  const reVoice = /(^|\s)([a-z0-9_]+):\s*/gi;
  const reSfx = /\[sfx:([a-z0-9_]+)\]/gi;

  const parts = [];
  let curVoice = fallbackVoice || null;
  let i = 0,
    m,
    sfxCount = 0;

  function pushText(chunk) {
    if (!chunk) return;
    reSfx.lastIndex = 0; // reset for each chunk
    let pos = 0,
      sm;
    while ((sm = reSfx.exec(chunk)) !== null) {
      const t0 = chunk.slice(pos, sm.index);
      if (t0.trim())
        parts.push({ type: "tts", text: t0.trim(), voice: curVoice });
      const key = sm[1].toLowerCase();
      if (SFX_MAP[key] && sfxCount < 10) {
        parts.push({ type: "sfx", name: key });
        sfxCount += 1;
      } else {
        parts.push({ type: "tts", text: sm[0], voice: curVoice });
      }
      pos = reSfx.lastIndex;
    }
    const tail = chunk.slice(pos);
    if (tail.trim())
      parts.push({ type: "tts", text: tail.trim(), voice: curVoice });
  }

  while ((m = reVoice.exec(input)) !== null) {
    const segStart = m.index + m[1].length;
    if (segStart > i) pushText(input.slice(i, segStart));
    curVoice = m[2].toLowerCase();
    i = reVoice.lastIndex;
  }
  pushText(input.slice(i));
  return parts.length
    ? parts
    : [{ type: "tts", text: input, voice: fallbackVoice || null }];
}

document.getElementById("alias_add").addEventListener("click", async () => {
  const name = (document.getElementById("alias_name").value || "")
    .trim()
    .toLowerCase();
  const voice = document.getElementById("alias_target").value;
  if (!name || !voice) return;
  const btn = document.getElementById("alias_add");
  btn.disabled = true;
  try {
    const r = await fetch("/api/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, voice }),
      ...cred,
    });
    if (r.ok) {
      document.getElementById("alias_name").value = "";
      await loadVoices();
    } else {
      alert("failed to add alias");
    }
  } finally {
    btn.disabled = false;
  }
});

function splitScript(input, fallbackVoice) {
  const re = /(^|\s)([a-z0-9_]+):\s*/gi;
  const parts = [];
  let curVoice = fallbackVoice || null;
  let i = 0,
    m;

  while ((m = re.exec(input)) !== null) {
    const segStart = m.index + m[1].length;
    if (segStart > i) {
      const chunk = input.slice(i, segStart).trim();
      if (chunk) parts.push({ text: chunk, voice: curVoice });
    }
    const name = m[2].toLowerCase();
    curVoice = name;
    i = re.lastIndex;
  }
  const tail = input.slice(i).trim();
  if (tail) parts.push({ text: tail, voice: curVoice });

  return parts.length ? parts : [{ text: input, voice: fallbackVoice || null }];
}

async function ttsBlob(body) {
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...cred,
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return await r.blob();
}

async function playMerged(parts, statusEl) {
  statusEl.textContent = "rendering...";
  const payload = {
    parts: parts.map((p) =>
      p.type === "sfx"
        ? { sfx: p.name }
        : { text: p.text, voice: p.voice || null }
    ),
    format: "mp3",
  };
  const r = await fetch("/api/tts_batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...cred,
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  const url = URL.createObjectURL(await r.blob());
  const a = document.getElementById("player");
  a.src = url;
  statusEl.textContent = "playing...";
  await a.play();
  a.onended = () => {
    statusEl.textContent = "done";
  };
}

async function playOne(text, voice, statusEl) {
  statusEl.textContent = "playing...";
  const url = URL.createObjectURL(await ttsBlob(payload(text, voice)));
  const a = document.getElementById("player");
  a.src = url;
  await a.play();
  statusEl.textContent = "done";
}

async function playText(fullText, fallbackVoice, statusEl) {
  const a = document.getElementById("player");
  const parts = parseParts(fullText, fallbackVoice);
  const single = parts.length === 1 && parts[0].type !== "sfx";

  if (single) {
    statusEl.textContent = "playing...";
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(parts[0].text, parts[0].voice)),
      ...cred,
    });
    if (!r.ok) {
      statusEl.textContent = `http ${r.status}`;
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    a.src = url;
    await a.play();
    statusEl.textContent = "done";
    return;
  }

  statusEl.textContent = `rendering...`;
  const body = {
    parts: parts.map((p) =>
      p.type === "sfx"
        ? { sfx: p.name }
        : { text: p.text, voice: p.voice || null }
    ),
    format: "mp3",
    preset: document.getElementById("preset").value || null,
    length_scale: numOrNull("length_scale"),
    noise_w: numOrNull("noise_w"),
    sentence_silence: numOrNull("sentence_silence"),
    speaker_id: numOrNull("speaker_id"),
  };

  const r = await fetch("/api/tts_batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...cred,
  });
  if (!r.ok) {
    statusEl.textContent = `http ${r.status}`;
    return;
  }
  statusEl.textContent = "playing...";
  const url = URL.createObjectURL(await r.blob());
  a.src = url;
  await a.play();
  statusEl.textContent = "done";
}

async function addRow(text, voice, jobId, opts = {}) {
  const allowAutoplay = opts.allowAutoplay !== false;

  const tbody = document.getElementById("list");
  const tr = document.createElement("tr");

  const tdTime = document.createElement("td");
  tdTime.textContent = new Date().toLocaleTimeString();
  const tdText = document.createElement("td");
  tdText.textContent = text;
  const tdVP = document.createElement("td");
  tdVP.textContent = `${voice || "(auto)"} / ${
    document.getElementById("preset").value || "(none)"
  }`;
  const tdStat = document.createElement("td");
  tdStat.textContent = jobId ? "queued" : "ready";
  const tdAct = document.createElement("td");

  const btnPlay = document.createElement("button");
  btnPlay.type = "button";
  btnPlay.textContent = "play";
  btnPlay.addEventListener("click", () => playText(text, voice, tdStat));

  const btnRemove = document.createElement("button");
  btnRemove.type = "button";
  btnRemove.textContent = "remove";
  btnRemove.addEventListener("click", () => tr.remove());

  tdAct.appendChild(btnPlay);
  tdAct.appendChild(btnRemove);

  if (jobId) {
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.textContent = "delete";
    btnDelete.addEventListener("click", async () => {
      const r = await fetch(`/api/queue/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        ...cred,
      });
      if (r.ok) tr.remove();
    });
    tdAct.appendChild(btnDelete);
  }

  tr.appendChild(tdTime);
  tr.appendChild(tdText);
  tr.appendChild(tdVP);
  tr.appendChild(tdStat);
  tr.appendChild(tdAct);
  tbody.prepend(tr);

  if (allowAutoplay && document.getElementById("autoplay").checked) {
    playText(text, voice, tdStat);
  }
}

document.getElementById("submit").addEventListener("click", async () => {
  const t = document.getElementById("tts").value.trim();
  const v = document.getElementById("voices").value || null;
  if (!t || document.getElementById("submit").disabled) return;
  await addRow(t, v, null);
  document.getElementById("tts").value = "";
  document.getElementById("tts").focus();
});

document.getElementById("refresh").addEventListener("click", (e) => {
  e.preventDefault();
  Promise.all([loadVoices(), loadSounds()]).catch(console.error);
});

async function pollQueue() {
  if (!pollBox.checked) {
    setTimeout(pollQueue, 600);
    return;
  }
  try {
    const r = await fetch("/api/peek", cred);
    if (r.status === 200) {
      const job = await r.json();
      const v = job.voice || document.getElementById("voices").value || null;
      const t = job.text || "";
      const id = job.id || null;
      if (t) await addRow(t, v, id, { allowAutoplay: false });
    }
  } catch (_) {}
  setTimeout(pollQueue, 400);
}
pollQueue();

getPanelStatus()
  .then(() => Promise.all([loadVoices(), loadSounds()]))
  .catch(console.error);

let SFX_MAP = {}; // name -> URL (/sounds/...)
async function loadSounds() {
  SFX_MAP = {};
  const r = await fetch("/api/sounds", cred);
  if (r.status !== 200) return;
  const { index, aliases } = await r.json();
  // ids
  for (const [id, v] of Object.entries(index)) {
    SFX_MAP[id.toLowerCase()] = "/sounds/" + v.file;
  }
  // aliases
  for (const [name, target] of Object.entries(aliases || {})) {
    const tgt = index[target];
    if (tgt) SFX_MAP[name.toLowerCase()] = "/sounds/" + tgt.file;
  }
}
