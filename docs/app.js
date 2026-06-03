"use strict";

const NF = new Intl.NumberFormat("pt-BR");
const PCT = (x) => (x == null ? "—" : (x * 100).toFixed(1).replace(".", ",") + "%");
const PCT0 = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
const fmt = (x) => (x == null ? "—" : NF.format(x));
const sig = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + x.toFixed(1).replace(".", ",") + "%");
const sig0 = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + fmt(x));
const REPO_URL = "https://github.com/pablonora/transparencia-eleitoral-municipios";
function initChrome() {
  const gh = document.getElementById("ghLink");
  if (gh) gh.href = REPO_URL;
  const topo = document.getElementById("topoBtn");
  if (topo) {
    topo.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    const onScroll = () => topo.classList.toggle("show", window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}
const temaClaro = () => document.documentElement.dataset.theme === "light";
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById("temaBtn");
  if (btn) {
    btn.textContent = t === "light" ? "🌙" : "☀️";
    btn.setAttribute("aria-label", t === "light" ? "Mudar para tema escuro" : "Mudar para tema claro");
  }
}
function initTema() {
  aplicarTema(temaClaro() ? "light" : "dark");   // já definido pelo script do <head>
  const btn = document.getElementById("temaBtn");
  if (btn) btn.addEventListener("click", () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");                 // liga a transição suave
    const novo = temaClaro() ? "dark" : "light";
    aplicarTema(novo);
    try { localStorage.setItem("tema", novo); } catch (_) {}
    if (MAP && ufLayer) recolorMapa();                // repinta cores do mapa (calculadas em JS)
    setTimeout(() => root.classList.remove("theme-anim"), 250);
  });
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function dataEleit() {
  const s = (DADOS && DADOS.ano_eleitorado) || "";
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${MESES[+m[2] - 1]}/${m[3]}` : s;
}

const LIMITE_LINHAS = 800;
const NCOLS = 10;

let DADOS = null, META = null, LINHAS = [];
let ordenarPor = "razao_total", ordemDesc = true;
const flagsAtivas = new Set();
let busca = "", ufSel = "";

async function carregar() {
  // no-store: o JSON é regenerado pelo pipeline; sempre buscar a versão atual.
  const [a, b] = await Promise.all([
    fetch("data/brasil.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("data/meta.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
  ]);
  DADOS = a; META = b; LINHAS = a.municipios;
  document.getElementById("th-anopop").textContent = "(" + a.ano_populacao + ")";
  document.getElementById("nMun").textContent = fmt(a.resumo.n_municipios);
  initTema();
  initChrome();
  computeRanks();
  preencherTextos();
  renderHero();
  initBuscaCidade();
  initTicker();
  initMapa();
  renderHistograma();
  initRankTabs();
  renderRanking();
  initComparar();
  preencherUFs(a.ufs || []);
  renderFontes();
  bind();
  render();
  abrirDeepLink();
}

/* ---------------- TEXTOS EXPLICATIVOS ---------------- */
function preencherTextos() {
  const r = DADOS.resumo;
  const r16 = LINHAS.filter((m) => m.razao_16mais != null);
  const pct16 = Math.round(100 * r16.filter((m) => m.razao_16mais > 1).length / r16.length);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("ex-n100", fmt(r.n_mais_eleitores_que_pop));
  set("ex-r16pct", pct16 + "%");
  set("meto-anopop", DADOS.ano_populacao);
  set("meto-ger", DADOS.ano_eleitorado ? "(geração " + DADOS.ano_eleitorado + ")" : "");
}

/* ---------------- HERO ---------------- */
function renderHero() {
  const r = DADOS.resumo;
  const top = LINHAS[0]; // já vem ordenado por razão desc
  document.getElementById("lede").innerHTML =
    `<b>${fmt(r.n_mais_eleitores_que_pop)}</b> municípios têm mais eleitores registrados (TSE) ` +
    `do que habitantes estimados (IBGE). Veja o cruzamento oficial, município a município.`;

  const stats = [
    { v: fmt(r.n_mais_eleitores_que_pop), l: "municípios com >100% (mais eleitores que habitantes)", alt: false },
    { v: PCT0(r.razao_total_max), l: `maior razão do país (${top.nome}-${top.uf})`, alt: true },
    { v: fmt(r.n_outlier_nacional), l: "outliers estatísticos (acima do padrão nacional)", alt: false },
    { v: fmt(r.n_municipios), l: "municípios analisados, em 27 UFs", alt: true },
  ];
  document.getElementById("heroStats").innerHTML = stats.map((s) =>
    `<div class="stat ${s.alt ? "alt" : ""}"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join("");

  const txt = encodeURIComponent(
    `${fmt(r.n_mais_eleitores_que_pop)} municípios brasileiros têm mais eleitores registrados (TSE) que habitantes estimados (IBGE) — e quase sempre é legítimo. Veja o cruzamento oficial, município a município:`);
  document.getElementById("btnTweet").href =
    `https://twitter.com/intent/tweet?text=${txt}&url=${encodeURIComponent(location.href)}`;

  document.getElementById("anosRef").innerHTML =
    `Razão “atual” = eleitorado <b>TSE</b> (geração ${dataEleit()}) ÷ população <b>estimativa IBGE ${DADOS.ano_populacao}</b> ` +
    `— o mais recente de cada, com ~1 ano de diferença. O número mais rigoroso é a razão de 2022 (base Censo), no perfil de cada cidade.`;
}

/* ---------------- HISTOGRAMA ---------------- */
function renderHistograma() {
  const rs = LINHAS.map((m) => m.razao_total).filter((x) => x != null);
  const LO = 0.4, HI = 1.7, STEP = 0.05;
  const nb = Math.round((HI - LO) / STEP);
  const bins = new Array(nb + 1).fill(0); // último = overflow (>HI)
  rs.forEach((x) => {
    if (x >= HI) bins[nb]++;
    else bins[Math.max(0, Math.floor((x - LO) / STEP))]++;
  });
  const maxB = Math.max(...bins);
  const boundary = Math.round((1.0 - LO) / STEP);   // índice da 1ª barra ≥100%
  const el = document.getElementById("histograma");
  const barras = bins.map((c, i) => {
    const ini = LO + i * STEP;
    const hot = ini >= 1.0;
    const faixa = i === nb ? `≥ ${PCT0(HI)}` : `${PCT0(ini)}–${PCT0(ini + STEP)}`;
    const h = maxB ? (c / maxB) * 100 : 0;
    return `<div class="hbar ${hot ? "hot" : ""}" style="height:${h}%">
      <span class="tip">${faixa}: ${fmt(c)} municípios</span></div>`;
  });
  // linha divisória no 100%, encaixada entre as barras (alinhamento exato)
  barras.splice(boundary, 0, `<div class="hist-div"><span class="hd-tag">100%</span></div>`);
  el.innerHTML = barras.join("");

  const nGt = rs.filter((x) => x > 1).length, nLe = rs.length - nGt;
  document.getElementById("histLegenda").innerHTML =
    `<span><span class="sw" style="background:#46e0c0"></span><b>${fmt(nLe)}</b> cidades até 100% da população</span>
     <span><span class="sw" style="background:#ffd23f"></span><b>${fmt(nGt)}</b> acima de 100% (mais eleitores que habitantes)</span>`;
}

/* ---------------- RANKING (abas) ---------------- */
let rankAtual = "razao";
function rankDefs() {
  const ano = DADOS.ano_populacao, anoT = (LINHAS.find((m) => m.transferencias_ano) || {}).transferencias_ano;
  return {
    razao: { titulo: "Os 15 municípios com maior razão eleitores/população. A linha marca 100%.", val: (m) => m.razao_total, fmt: PCT0, linha100: true },
    saldo: { titulo: `Maior entrada líquida de eleitores por transferência em ${anoT} (entradas − saídas).`, val: (m) => m.transferencias_saldo, fmt: sig0 },
    idoso: { titulo: "Maior parcela do eleitorado com 70 anos ou mais (voto facultativo).", val: (m) => m.pct_70mais, fmt: PCT },
    jovem: { titulo: "Maior parcela de eleitores de 16–17 anos (voto facultativo).", val: (m) => m.pct_16_17, fmt: PCT },
    escol: { titulo: "Maior parcela do eleitorado com escolaridade até o ensino fundamental.", val: (m) => m.pct_ate_fundamental, fmt: PCT },
    facult: { titulo: "Maior parcela de voto facultativo (16–17 anos e 70+).", val: (m) => (m.eleitores ? m.eleitores_facultativo / m.eleitores : null), fmt: PCT },
    abst: { titulo: "Maior abstenção na eleição mais recente disponível (municipal 2024, ou geral 2022).", val: (m) => m._abst, fmt: PCT },
    margem: {
      titulo: "Municípios onde a entrada líquida de eleitores em 2024 superou a margem de vitória do prefeito. É um FATO (comparação de dois números) — não diz como esses eleitores votaram nem que decidiram a eleição.",
      val: (m) => (m.eleicao2024 && m.eleicao2024.entrada_maior_que_margem) ? m.eleicao2024.transf_saldo : null,
      fmt: (v) => "+" + fmt(v),
    },
    rev3: {
      titulo: "Municípios que atendem aos TRÊS critérios cumulativos da Res. TSE 23.659/2021 (art. 105) — o conjunto legalmente definido. Atender NÃO é irregularidade nem revisão: a revisão é discricionária do TSE.",
      val: (m) => (m.revisao && m.revisao.atende_3) ? m.razao_total : null,
      fmt: PCT,
    },
  };
}
function renderRanking() {
  const def = rankDefs()[rankAtual];
  let pool = LINHAS.filter((m) => def.val(m) != null);
  if (ufSel) pool = pool.filter((m) => m.uf === ufSel);
  pool.sort((a, b) => def.val(b) - def.val(a));
  const top = pool.slice(0, 15);
  const maxV = Math.max(...top.map((m) => Math.abs(def.val(m))), 1e-9);
  const sub = document.getElementById("rankSub");
  const sensivel = (rankAtual === "margem" || rankAtual === "rev3");
  sub.className = sensivel ? "sub rank-cuidado" : "sub";
  sub.innerHTML = (sensivel ? "⚠️ " : "") + def.titulo + (ufSel ? ` <strong>(${ufSel})</strong>` : "");
  document.getElementById("ranking").innerHTML = top.map((m) => {
    const v = def.val(m), w = (Math.abs(v) / maxV) * 100;
    const cem = def.linha100 && maxV > 1 ? `<div class="cem" style="left:${(1 / maxV) * 100}%"></div>` : "";
    return `<div class="rk" data-cd="${m.cd_ibge}">
      <div class="nm">${m.nome} <small>${m.uf}</small></div>
      <div class="track"><div class="fill" style="width:${w}%"></div>${cem}</div>
      <div class="val">${def.fmt(v)}</div>
    </div>`;
  }).join("");
}
function initRankTabs() {
  document.querySelectorAll("#rankTabs .tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll("#rankTabs .tab").forEach((x) => x.classList.remove("on"));
      t.classList.add("on"); rankAtual = t.dataset.rk; renderRanking();
    });
  });
  document.getElementById("ranking").addEventListener("click", (e) => {
    const rk = e.target.closest(".rk"); if (!rk) return;
    const m = munById && munById.get(rk.dataset.cd); if (m) abrirCidade(m);
  });
}

/* ---------------- DEMOGRAFIA ---------------- */
function demoGrid(m) {
  const items = [
    ["pct_16_17", "jovens 16–17"],
    ["pct_70mais", "70+ anos"],
    ["pct_feminino", "mulheres"],
    ["pct_superior", "ensino superior"],
    ["pct_ate_fundamental", "até fundamental"],
  ].filter(([k]) => m[k] != null);
  if (!items.length) return "";
  return `<div class="demo">${items.map(([k, l]) =>
    `<div class="d"><b>${PCT(m[k])}</b> <span>${l}</span></div>`).join("")}</div>`;
}
function compBlock(m) {
  const c = m.comparecimento || {};
  const anos = ["2022", "2024"].filter((y) => c[y]);
  if (!anos.length) return "";
  const rotulo = { "2022": "Eleição geral 2022", "2024": "Eleição municipal 2024" };
  return `<div class="comp-blk"><div class="cb-tit">Na época de cada eleição (1º turno)</div>
    <div class="cb-cols">${
      anos.map((y) => `<div class="cb-col">
        <div class="cb-ano-tit">${rotulo[y]}</div>
        <div class="cb-linha"><span title="eleitores ÷ população, em %">Eleitores ÷ população</span><b>${PCT(c[y].razao_epoca)}</b></div>
        <div class="cb-linha"><span>Compareceram</span><b>${PCT(c[y].comp_pct)}</b></div>
        <div class="cb-linha"><span>Abstenção</span><b class="ab">${PCT(c[y].abst_pct)}</b></div>
        <div class="cb-fonte">eleitorado apto ÷ população ${c[y].razao_epoca_fonte}</div>
      </div>`).join("")}</div></div>`;
}
function eleicaoBlock(m) {
  const e = m.eleicao2024;
  if (!e) return "";
  const turno = e.turno === "2" ? "2º turno" : "1º turno";
  let cruz = "";
  if (e.transf_saldo != null) {
    cruz = e.entrada_maior_que_margem
      ? `<div class="el-flag">A <b>entrada líquida</b> de eleitores em 2024 (${sig0(e.transf_saldo)}) foi <b>maior que a margem de vitória</b> (${fmt(e.margem)} votos). É um fato que merece contexto — <b>não</b> significa que esses eleitores decidiram a eleição: <b>o voto é secreto</b> e não se sabe em quem votaram.</div>`
      : `<div class="cb-row"><span class="cb-ano">Entrada líq. 2024</span>${sig0(e.transf_saldo)} eleitores (margem: ${fmt(e.margem)} votos)</div>`;
  }
  return `<div class="comp-blk"><div class="cb-tit">Eleição 2024 — prefeito (${turno})</div>
    <div class="cb-row"><span class="cb-ano">Vencedor</span><b>${e.vencedor}</b> · ${fmt(e.votos_venc)} votos</div>
    <div class="cb-row"><span class="cb-ano">Margem (1º−2º)</span><b>${fmt(e.margem)}</b> votos</div>
    ${cruz}</div>`;
}
function criteriosBlock(m) {
  const r = m.revisao;
  if (!r) return "";
  const item = (ok, txt) => `<div class="cr-item ${ok ? "ok" : "no"}"><span class="cr-ic">${ok ? "✓" : "✕"}</span> ${txt}</div>`;
  const verd = r.atende_3
    ? `<div class="cr-verd sim"><b>Atende aos 3 critérios.</b> Ainda assim, a revisão é <b>discricionária</b> do TSE — isto não é uma revisão nem indica irregularidade.</div>`
    : `<div class="cr-verd nao">Não atende aos 3 critérios cumulativos.</div>`;
  return `<div class="comp-blk"><div class="cb-tit">Critérios legais de revisão de eleitorado</div>
    ${item(r.crit1_transferencias, "Transferências do ano +10% vs. ano anterior")}
    ${item(r.crit2_jovens_idosos, "Eleitorado &gt; 2× (pop. 10–15 anos + 70+)")}
    ${item(r.crit3_acima_80, "Eleitorado &gt; 80% da população")}
    ${verd}
    <div class="cb-fonte">Res. TSE 23.659/2021, art. 105 — os três são cumulativos. Critério 1 compara transferências 2025 × 2024.</div>
  </div>`;
}

/* ---------------- RANKS / MEDIANAS ---------------- */
let MED_NAC = null, MED_UF = {}, RANK_NAC_TOT = 0, RANK_TOT_UF = {};
const abstMaisRecente = (m) => {
  const c = m.comparecimento || {};
  return (c["2024"] && c["2024"].abst_pct != null) ? c["2024"].abst_pct
    : (c["2022"] && c["2022"].abst_pct != null) ? c["2022"].abst_pct : null;
};
function computeRanks() {
  munById = new Map(LINHAS.map((m) => [m.cd_ibge, m]));
  LINHAS.forEach((m) => { m._abst = abstMaisRecente(m); });
  MED_NAC = DADOS.resumo.razao_total_mediana;
  const byUf = {};
  LINHAS.forEach((m) => { (byUf[m.uf] || (byUf[m.uf] = [])).push(m); });
  const nac = LINHAS.filter((m) => m.razao_total != null).slice().sort((a, b) => b.razao_total - a.razao_total);
  nac.forEach((m, i) => { m._rankNac = i + 1; });
  RANK_NAC_TOT = nac.length;
  for (const uf in byUf) {
    const arr = byUf[uf].filter((m) => m.razao_total != null).slice().sort((a, b) => b.razao_total - a.razao_total);
    arr.forEach((m, i) => { m._rankUf = i + 1; });
    RANK_TOT_UF[uf] = arr.length;
    MED_UF[uf] = mediana(byUf[uf].map((m) => m.razao_total));
  }
}

/* ---------------- AUTOCOMPLETE ---------------- */
const semAcento = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function attachAutocomplete(input, acEl, onPick) {
  let sel = -1, opts = [];
  const close = () => { acEl.hidden = true; acEl.innerHTML = ""; sel = -1; opts = []; };
  const hl = () => acEl.querySelectorAll(".opt").forEach((el, i) => el.classList.toggle("sel", i === sel));
  const pick = (i) => { if (opts[i]) { onPick(opts[i]); input.value = opts[i].nome; close(); } };
  input.addEventListener("input", () => {
    const q = semAcento(input.value.trim());
    if (q.length < 2) return close();
    opts = LINHAS.filter((m) => semAcento(m.nome).includes(q)).slice(0, 8);
    if (!opts.length) return close();
    acEl.innerHTML = opts.map((m, i) => `<div class="opt" data-i="${i}">${m.nome} <small>${m.uf}</small></div>`).join("");
    acEl.hidden = false; sel = -1;
    acEl.querySelectorAll(".opt").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); pick(+el.dataset.i); }));
  });
  input.addEventListener("keydown", (e) => {
    if (acEl.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(opts.length - 1, sel + 1); hl(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); hl(); e.preventDefault(); }
    else if (e.key === "Enter") { pick(sel >= 0 ? sel : 0); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

/* ---------------- PERFIL DA CIDADE (modal) ---------------- */
function initBuscaCidade() {
  attachAutocomplete(document.getElementById("buscaCidade"), document.getElementById("acCidade"), abrirCidade);
  document.getElementById("modalBg").addEventListener("click", fecharModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
  document.getElementById("btnGeo").addEventListener("click", localizar);
}

/* ---------------- GEOLOCALIZAÇÃO (tudo no navegador) ---------------- */
// ray casting num anel [[lng,lat],...]
function pontoNoAnel(x, y, ring) {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}
function pontoNaFeicao(x, y, geom) {
  if (!geom) return false;
  if (geom.type === "Polygon") return pontoNoAnel(x, y, geom.coordinates[0]);
  if (geom.type === "MultiPolygon") return geom.coordinates.some((p) => pontoNoAnel(x, y, p[0]));
  return false;
}
async function cidadePorCoord(lat, lng) {
  let ufs = UF_GEO;
  if (!ufs) ufs = (await fetch("data/malha/uf.json", { cache: "force-cache" }).then((r) => r.json())).features;
  const uf = ufs.find((f) => pontoNaFeicao(lng, lat, f.geometry));
  if (!uf) return null;
  const cod = String(uf.properties.codarea).padStart(2, "0");
  const gj = await fetch(`data/malha/mun_${cod}.json`, { cache: "force-cache" }).then((r) => r.json());
  const f = gj.features.find((ft) => pontoNaFeicao(lng, lat, ft.geometry));
  return f ? munById.get(String(f.properties.codarea)) || null : null;
}
function localizar() {
  const btn = document.getElementById("btnGeo");
  if (!navigator.geolocation) { toast("Geolocalização indisponível neste navegador."); return; }
  btn.disabled = true; btn.textContent = "Localizando…";
  const reset = () => { btn.disabled = false; btn.textContent = "📍 Mostrar minha cidade"; };
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const m = await cidadePorCoord(pos.coords.latitude, pos.coords.longitude);
      reset();
      if (m) abrirCidade(m);
      else toast("Não consegui identificar seu município no Brasil.");
    } catch (_) { reset(); toast("Falha ao identificar o município."); }
  }, () => { reset(); toast("Não foi possível obter sua localização."); },
    { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 });
}
function fecharModal() { document.getElementById("modal").hidden = true; }

function barRow(lab, v, max, cls) {
  const w = max ? Math.min(100, (v / max) * 100) : 0;
  return `<div class="row ${cls}"><span class="lab">${lab}</span><div class="track"><div class="fill" style="width:${w}%"></div></div><span>${PCT(v)}</span></div>`;
}
function cityCardHTML(m) {
  const medUf = MED_UF[m.uf], maxR = Math.max(m.razao_total || 0, medUf || 0, MED_NAC || 0) || 1;
  const per100 = Math.round((m.razao_total || 0) * 100);
  const saldoPct = m.eleitores && m.transferencias_saldo != null ? m.transferencias_saldo / m.eleitores : null;
  return `<button class="fechar" id="modalFechar" aria-label="Fechar">×</button>
  <div class="profile">
    <h3>${m.nome} <span class="uf-tag">${m.uf}</span></h3>
    <div class="big">${PCT(m.razao_total)}</div>
    <p class="frase">São <b>${per100}</b> eleitores registrados (TSE, ${dataEleit()}) para cada <b>100</b> habitantes estimados (IBGE, ${DADOS.ano_populacao}). ${badges(m) === "—" ? "" : badges(m)}</p>
    <div class="rankline">
      <div class="r"><b>#${m._rankNac || "—"}</b> de ${fmt(RANK_NAC_TOT)}<br>no país</div>
      <div class="r"><b>#${m._rankUf || "—"}</b> de ${fmt(RANK_TOT_UF[m.uf])}<br>no ${m.uf}</div>
      <div class="r" title="Eleitores ÷ população em idade de votar (16+) estimada. Passa de 100% com facilidade porque o divisor é menor — leia junto da razão total.">
        <b>${PCT(m.razao_16mais)}</b><br>razão 16+ ⓘ</div>
    </div>
    ${m.razao_16mais != null && m.razao_16mais > 1 ? `<p class="aviso16">A razão 16+ acima de 100% é <b>esperada</b> aqui: o denominador conta só quem tem idade de votar. A razão total (${PCT(m.razao_total)}) é a referência mais sólida.</p>` : ""}
    ${m.outlier_uf ? `<p class="ctx-uf">Contexto regional: também é <b>atípico para o próprio ${m.uf}</b> (acima de ${PCT((DADOS.limiares_estatisticos_por_uf || {})[m.uf])}, o limiar estatístico do estado). Leitura secundária — o padrão é fortemente regional.</p>` : ""}
    <div class="cmp-cap">Razão = <b>eleitores ÷ população</b> (em %). 100% = 1 eleitor por habitante.</div>
    <div class="cmpbar">
      ${barRow(m.nome, m.razao_total, maxR, "me")}
      ${barRow("Mediana " + m.uf, medUf, maxR, "")}
      ${barRow("Mediana Brasil", MED_NAC, maxR, "")}
    </div>
    <div class="demo">
      <div class="d"><b>${fmt(m.eleitores)}</b> <span>eleitores</span></div>
      <div class="d"><b>${fmt(m.pop_total_estimada)}</b> <span>população ${DADOS.ano_populacao}</span></div>
      ${m.crescimento_pop_pct != null ? `<div class="d"><b>${sig(m.crescimento_pop_pct)}</b> <span>crescimento pop. (${m.ano_pop_anterior}→${m.ano_pop})</span></div>` : ""}
      ${m.transferencias_qtd != null ? `<div class="d"><b>${fmt(m.transferencias_qtd)}</b> <span>entradas por transf. ${m.transferencias_ano}</span></div>` : ""}
      ${m.transferencias_saldo != null ? `<div class="d"><b>${sig0(m.transferencias_saldo)}</b> <span>saldo de transferências${saldoPct != null ? " (" + PCT(saldoPct) + ")" : ""}</span></div>` : ""}
    </div>
    ${demoGrid(m)}
    ${compBlock(m)}
    ${eleicaoBlock(m)}
    ${criteriosBlock(m)}
    <p class="frase" style="font-size:.8rem; color:#9aa3b2; margin-top:1rem">${DADOS.nota_neutra}</p>
    <div class="acts">
      <button class="btn" id="pf-share">Compartilhar esta cidade</button>
      <a class="btn ghost" id="pf-x" target="_blank" rel="noopener">Postar no X</a>
    </div>
  </div>`;
}
function linkCidade(m) {
  return location.origin + location.pathname + "?cidade=" + m.cd_ibge;
}
function abrirCidade(m) {
  document.getElementById("modalCard").innerHTML = cityCardHTML(m);
  document.getElementById("modal").hidden = false;
  document.getElementById("modalFechar").addEventListener("click", fecharModal);
  const per100 = Math.round((m.razao_total || 0) * 100);
  const link = linkCidade(m);
  document.getElementById("pf-x").href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Em ${m.nome}-${m.uf}: ${per100} eleitores registrados (TSE) para cada 100 habitantes estimados (IBGE). Razão alta é comum e não indica irregularidade — veja o contexto oficial:`)}&url=${encodeURIComponent(link)}`;
  document.getElementById("pf-share").addEventListener("click", async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `${m.nome}-${m.uf}`, url: link }); return; }
      await navigator.clipboard.writeText(link); toast();
    } catch (_) { /* cancelado */ }
  });
}
function abrirDeepLink() {
  const cd = new URLSearchParams(location.search).get("cidade");
  if (cd && munById.has(cd)) abrirCidade(munById.get(cd));
}

/* ---------------- DESTAQUES (ticker) ---------------- */
function gerarInsights() {
  const r = DADOS.resumo, by = (f) => [...LINHAS].filter((m) => f(m) != null).sort((a, b) => f(b) - f(a))[0];
  const top = LINHAS[0];
  const idoso = by((m) => m.pct_70mais), saldo = by((m) => m.transferencias_saldo), jovem = by((m) => m.pct_16_17);
  const met = ufMetrics(); let ufTop = null;
  for (const uf in met) if (!ufTop || met[uf].pct100 > met[ufTop].pct100) ufTop = uf;
  const out = [
    `Em <b>${top.nome}-${top.uf}</b> há <b>${PCT0(top.razao_total)}</b> de eleitores em relação à população estimada.`,
    `<b>${fmt(r.n_mais_eleitores_que_pop)}</b> municípios têm mais eleitores registrados que habitantes estimados.`,
    saldo ? `<b>${saldo.nome}-${saldo.uf}</b> teve a maior entrada líquida: <b>${sig0(saldo.transferencias_saldo)}</b> eleitores por transferência em ${saldo.transferencias_ano}.` : "",
    idoso ? `O eleitorado mais idoso está em <b>${idoso.nome}-${idoso.uf}</b>: <b>${PCT(idoso.pct_70mais)}</b> têm 70+ anos.` : "",
    ufTop ? `No <b>${ufTop}</b>, <b>${PCT(met[ufTop].pct100)}</b> dos municípios têm mais eleitores que habitantes.` : "",
  ].filter(Boolean);
  return out;
}
function initTicker() {
  const el = document.getElementById("ticker"), ins = gerarInsights();
  if (!ins.length) return;
  el.innerHTML = ins[0]; let i = 0;
  setInterval(() => {
    el.classList.add("fade");
    setTimeout(() => { i = (i + 1) % ins.length; el.innerHTML = ins[i]; el.classList.remove("fade"); }, 400);
  }, 5000);
}

/* ---------------- COMPARAR CIDADES ---------------- */
let cmpAsel = null, cmpBsel = null;
function initComparar() {
  attachAutocomplete(document.getElementById("cmpA"), document.getElementById("acA"), (m) => { cmpAsel = m; renderCompare(); });
  attachAutocomplete(document.getElementById("cmpB"), document.getElementById("acB"), (m) => { cmpBsel = m; renderCompare(); });
}
function renderCompare() {
  const out = document.getElementById("compareOut");
  if (!cmpAsel || !cmpBsel) { out.innerHTML = ""; return; }
  const A = cmpAsel, B = cmpBsel, ano = DADOS.ano_populacao;
  const rows = [
    ["Eleitores ÷ população", (m) => m.razao_total, PCT],
    ["Razão 16+", (m) => m.razao_16mais, PCT],
    ["Eleitores", (m) => m.eleitores, fmt],
    [`População (${ano})`, (m) => m.pop_total_estimada, fmt],
    ["% 16–17 anos", (m) => m.pct_16_17, PCT],
    ["% 70+ anos", (m) => m.pct_70mais, PCT],
    ["% mulheres", (m) => m.pct_feminino, PCT],
    ["% ensino superior", (m) => m.pct_superior, PCT],
    ["Saldo transferências", (m) => m.transferencias_saldo, sig0],
  ];
  out.innerHTML = `<table class="cmp-table"><thead><tr><th></th><th>${A.nome}<br><small>${A.uf}</small></th><th>${B.nome}<br><small>${B.uf}</small></th></tr></thead><tbody>${
    rows.map(([lab, f, fm]) => {
      const va = f(A), vb = f(B);
      const aw = va != null && vb != null && va > vb ? "win" : "";
      const bw = va != null && vb != null && vb > va ? "win" : "";
      return `<tr><td class="lab">${lab}</td><td class="${aw}">${fm(va)}</td><td class="${bw}">${fm(vb)}</td></tr>`;
    }).join("")}</tbody></table>`;
}

/* ---------------- MAPA ---------------- */
let MAP = null, ufLayer = null, munLayer = null, codToSigla = {};
let munById = null, loadedUFs = new Set(), labeled = new Set(), UF_GEO = null;
let zBrasil = 4, Z_MUNI = 5, Z_LABEL = 7;   // limiares de zoom (ajustados no init)

function mediana(xs) {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const i = a.length >> 1;
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}

function ufMetrics() {
  const g = {};
  LINHAS.forEach((m) => {
    const x = g[m.uf] || (g[m.uf] = { razoes: [], n: 0, cem: 0, atip: 0 });
    if (m.razao_total != null) x.razoes.push(m.razao_total);
    x.n++; if (m.mais_eleitores_que_pop) x.cem++; if (m.outlier_nacional) x.atip++;
  });
  const out = {};
  for (const uf in g) out[uf] = { pct100: g[uf].cem / g[uf].n, mediana: mediana(g[uf].razoes), atipicos: g[uf].atip };
  return out;
}

// gradiente: azul-escuro → teal → âmbar → laranja
const STOPS = [[29, 59, 74], [70, 224, 192], [255, 210, 63], [255, 123, 61]];
function cor(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(seg)), f = seg - i;
  const a = STOPS[i], b = STOPS[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* indicadores que o mapa pode mostrar (recolorem UF e município) */
let mapInd = "razao", destaque = "todos", UF_AGG = {};
const MAP_INDS = {
  razao:   { label: "Eleitores ÷ população", val: (m) => m.razao_total, div: [0.5, 1.0, 1.6], fmt: (v) => PCT(v), leg: ["50%", "100%", "≥160%"] },
  razao16: { label: "Razão 16+", val: (m) => m.razao_16mais, div: [0.6, 1.0, 2.0], fmt: (v) => PCT(v), leg: ["60%", "100%", "≥200%"] },
  idoso:   { label: "% eleitorado 70+", val: (m) => m.pct_70mais, seq: [0, 0.20], fmt: (v) => PCT(v), leg: ["0%", "≥20%"] },
  escol:   { label: "% até fundamental", val: (m) => m.pct_ate_fundamental, seq: [0.2, 0.8], fmt: (v) => PCT(v), leg: ["20%", "≥80%"] },
  saldo:   { label: "Saldo de transferências", val: (m) => (m.eleitores ? m.transferencias_saldo / m.eleitores : null), div: [-0.05, 0, 0.05], fmt: (v) => sig(v == null ? null : v * 100), leg: ["−5%", "0", "+5%"] },
  cresc:   { label: "Crescimento populacional", val: (m) => (m.crescimento_pop_pct != null ? m.crescimento_pop_pct / 100 : null), div: [-0.01, 0, 0.01], fmt: (v) => sig(v == null ? null : v * 100), leg: ["−1%", "0", "+1%"] },
  abst24:  { label: "% abstenção (2024)", val: (m) => (m.comparecimento && m.comparecimento["2024"] ? m.comparecimento["2024"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
  abst22:  { label: "% abstenção (2022)", val: (m) => (m.comparecimento && m.comparecimento["2022"] ? m.comparecimento["2022"].abst_pct : null), seq: [0, 0.4], fmt: (v) => PCT(v), leg: ["0%", "≥40%"] },
};
const _lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const DIV_LO = [56, 135, 255], DIV_MID = [232, 236, 245], DIV_HI = [255, 77, 61];
function corDiv(t) {
  t = Math.max(0, Math.min(1, t));
  return t <= 0.5 ? `rgb(${_lerp(DIV_LO, DIV_MID, t / 0.5).join(",")})` : `rgb(${_lerp(DIV_MID, DIV_HI, (t - 0.5) / 0.5).join(",")})`;
}
function corInd(ind, v) {
  if (v == null) return temaClaro() ? "#d4dae3" : "#262b36";   // sem dado
  if (ind.div) { const [lo, mid, hi] = ind.div; const t = v <= mid ? 0.5 * (v - lo) / (mid - lo) : 0.5 + 0.5 * (v - mid) / (hi - mid); return corDiv(t); }
  const [mn, mx] = ind.seq; return cor(Math.max(0, Math.min(1, (v - mn) / (mx - mn))));
}
const _pad = (f) => String(f.properties.codarea).padStart(2, "0");
function ufAggMap(ind) {
  const g = {}; LINHAS.forEach((m) => { const v = ind.val(m); if (v != null) (g[m.uf] || (g[m.uf] = [])).push(v); });
  const out = {}; for (const uf in g) out[uf] = mediana(g[uf]); return out;
}
function matchDestaque(m) {
  if (!m) return false;
  if (destaque === "cem") return !!m.mais_eleitores_que_pop;
  if (destaque === "atip") return !!m.outlier_nacional;
  return true;
}
function styleUF(f) { const ind = MAP_INDS[mapInd]; return { fillColor: corInd(ind, UF_AGG[codToSigla[_pad(f)]]), fillOpacity: 0.88, color: "#0a0b10", weight: 1 }; }
function styleMun(f) {
  const ind = MAP_INDS[mapInd], m = munById.get(String(f.properties.codarea));
  return { fillColor: corInd(ind, m ? ind.val(m) : null), fillOpacity: matchDestaque(m) ? 0.92 : 0.06, color: "#0a0b10", weight: 0.4 };
}
function popupHTML(m) {
  const cel = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  return `<div class="mapa-pop"><div class="pp-tit">${m.nome}-${m.uf}</div>
    <div class="pp-grid">
      ${cel(PCT(m.razao_total), "razão")}${cel(PCT(m.razao_16mais), "razão 16+")}
      ${cel(fmt(m.eleitores), "eleitores")}${cel(fmt(m.pop_total_estimada), "pop. " + DADOS.ano_populacao)}
      ${m.transferencias_saldo != null ? cel(sig0(m.transferencias_saldo), "saldo transf.") : ""}
      ${m._abst != null ? cel(PCT(m._abst), "abstenção") : ""}
      ${cel("#" + (m._rankNac || "—"), "no país")}
    </div>
    ${badges(m) === "—" ? "" : `<div class="pp-badges">${badges(m)}</div>`}
    <button class="pp-btn" onclick="abrirCidadeCod('${m.cd_ibge}')">Ver perfil completo →</button>
  </div>`;
}
function abrirCidadeCod(cd) { if (MAP) MAP.closePopup(); const m = munById.get(cd); if (m) abrirCidade(m); }

function initMapa() {
  if (typeof L === "undefined") { document.getElementById("mapaBloco").style.display = "none"; return; }
  for (const uf in DADOS.uf_codigos) codToSigla[DADOS.uf_codigos[uf]] = uf;
  munById = new Map(LINHAS.map((m) => [m.cd_ibge, m]));

  MAP = L.map("mapa", {
    zoomControl: true, attributionControl: false,
    scrollWheelZoom: true, wheelPxPerZoomLevel: 90,
    zoomSnap: 0.25, zoomDelta: 0.5,
  });

  munLayer = L.geoJSON(null, {
    style: styleMun,
    onEachFeature: (f, lyr) => {
      const m = munById.get(String(f.properties.codarea));
      if (!m) return;
      lyr.bindPopup(popupHTML(m), { maxWidth: 260 });
      lyr.on("mouseover", () => { lyr.setStyle({ weight: 1.6, color: temaClaro() ? "#111827" : "#fff", fillOpacity: 1 }); lyr.bringToFront(); });
      lyr.on("mouseout", () => munLayer.resetStyle(lyr));
    },
  }).addTo(MAP);

  MAP.on("moveend", atualizarDetalhe);

  fetch("data/malha/uf.json", { cache: "force-cache" }).then((r) => r.json()).then((gj) => {
    UF_GEO = gj.features;
    UF_AGG = ufAggMap(MAP_INDS[mapInd]);
    ufLayer = L.geoJSON(gj, {
      style: styleUF,
      onEachFeature: (f, lyr) => {
        const sg = codToSigla[_pad(f)];
        lyr.bindTooltip(`<b>${sg}</b> · ${MAP_INDS[mapInd].label.toLowerCase()} ${MAP_INDS[mapInd].fmt(UF_AGG[sg])}`, { sticky: true });
        lyr.on("mouseover", () => { lyr.setStyle({ weight: 2.5, color: temaClaro() ? "#111827" : "#fff", fillOpacity: 1 }); lyr.bringToFront(); });
        lyr.on("mouseout", () => ufLayer.resetStyle(lyr));
        lyr.on("click", () => zoomParaUF(_pad(f), sg));
      },
    }).addTo(MAP);
    ufLayer.bringToBack();

    const b = ufLayer.getBounds();
    zBrasil = MAP.getBoundsZoom(b, false, L.point(10, 10));
    Z_MUNI = zBrasil + 1.0;
    Z_LABEL = zBrasil + 3.0;
    MAP.setMinZoom(zBrasil);
    MAP.setMaxBounds(b.pad(0.35));
    MAP.fitBounds(b, { padding: [10, 10] });
    legend();
  });
}

// Troca o indicador / o destaque e recolore as duas camadas.
function recolorMapa() {
  const ind = MAP_INDS[mapInd];
  UF_AGG = ufAggMap(ind);
  if (ufLayer) {
    ufLayer.setStyle(styleUF);
    ufLayer.eachLayer((l) => l.setTooltipContent(`<b>${codToSigla[_pad(l.feature)]}</b> · ${ind.label.toLowerCase()} ${ind.fmt(UF_AGG[codToSigla[_pad(l.feature)]])}`));
  }
  if (munLayer) munLayer.setStyle(styleMun);
  legend();
}

// Carrega/descarta os municípios conforme o zoom e a área visível.
function atualizarDetalhe() {
  if (!ufLayer) return;
  const z = MAP.getZoom(), bounds = MAP.getBounds();
  if (z >= Z_MUNI) {
    ufLayer.eachLayer((uf) => {
      const cod = String(uf.feature.properties.codarea).padStart(2, "0");
      if (!loadedUFs.has(cod) && bounds.intersects(uf.getBounds())) {
        loadedUFs.add(cod);
        fetch(`data/malha/mun_${cod}.json`, { cache: "force-cache" })
          .then((r) => r.json())
          .then((gj) => { munLayer.addData(gj); atualizarRotulos(); })
          .catch(() => loadedUFs.delete(cod));
      }
    });
    document.getElementById("mapaDica").textContent =
      z >= Z_LABEL ? "Clique num município para detalhes." : "Aproxime mais para ver os nomes das cidades.";
  } else if (loadedUFs.size) {       // zoom-out: limpa para aliviar e voltar ao mapa de UFs
    munLayer.clearLayers(); loadedUFs.clear(); labeled = new Set();
    document.getElementById("mapaDica").textContent = "Dê zoom (scroll) ou clique num estado para ver os municípios.";
  }
  document.getElementById("mapaVoltar").hidden = z <= zBrasil + 0.05;
  atualizarRotulos();
}

// Mostra os nomes das cidades visíveis (com teto, pra não poluir).
function atualizarRotulos() {
  if (MAP.getZoom() < Z_LABEL) { labeled.forEach((l) => l.closeTooltip()); labeled = new Set(); return; }
  const bounds = MAP.getBounds(), keep = new Set();
  let n = 0;
  munLayer.eachLayer((l) => {
    if (n >= 140) return;
    if (!bounds.contains(l.getBounds().getCenter())) return;
    const m = munById.get(String(l.feature.properties.codarea));
    if (!m) return;
    if (!l.getTooltip()) l.bindTooltip(m.nome, { permanent: true, direction: "center", className: "city-label" });
    l.openTooltip(); keep.add(l); n++;
  });
  labeled.forEach((l) => { if (!keep.has(l)) l.closeTooltip(); });
  labeled = keep;
}

function zoomParaUF(cod, sg) {
  ufSel = sg; document.getElementById("uf").value = sg;
  render(); renderRanking();
  const alvo = [];
  ufLayer.eachLayer((uf) => { if (String(uf.feature.properties.codarea).padStart(2, "0") === cod) alvo.push(uf); });
  if (alvo.length) MAP.flyToBounds(alvo[0].getBounds(), { padding: [20, 20], duration: 0.6 });
  document.getElementById("mapaVoltar").hidden = false;
}

function voltarBrasil() {
  munLayer.clearLayers(); loadedUFs.clear(); labeled = new Set();
  ufSel = ""; document.getElementById("uf").value = "";
  render(); renderRanking();
  document.getElementById("mapaVoltar").hidden = true;
  document.getElementById("mapaDica").textContent = "Dê zoom (scroll) ou clique num estado para ver os municípios.";
  if (ufLayer) MAP.flyToBounds(ufLayer.getBounds(), { padding: [10, 10], duration: 0.6 });
}

function legend() {
  const ind = MAP_INDS[mapInd];
  const grad = ind.div
    ? "linear-gradient(90deg, rgb(56,135,255), rgb(232,236,245), rgb(255,77,61))"
    : "linear-gradient(90deg,#1d3b4a,#46e0c0,#ffd23f,#ff7b3d)";
  const fim = ind.div ? ind.leg[2] : ind.leg[1];
  const pivo = ind.div ? ` · vira em <b>${ind.leg[1]}</b>` : "";
  const realce = destaque === "todos" ? "" : ` · realçando ${destaque === "cem" ? ">100%" : "atípicos"}`;
  document.getElementById("mapaLegenda").innerHTML =
    `<span>${ind.leg[0]}</span><span class="grad" style="background:${grad}"></span><span>${fim}</span>` +
    ` &nbsp;·&nbsp; <b>${ind.label}</b>${pivo}${realce}`;
}

/* ---------------- TABELA ---------------- */
function preencherUFs(ufs) {
  const sel = document.getElementById("uf");
  ufs.forEach((u) => { const o = document.createElement("option"); o.value = u; o.textContent = u; sel.appendChild(o); });
}

function badges(m) {
  const limBR = DADOS.limiar_estatistico_nacional;
  let s = "";
  if (m.mais_eleitores_que_pop) s += `<span class="badge b100" title="Mais eleitores que habitantes estimados">&gt;100%</span>`;
  if (m.acima_limiar_tse) s += `<span class="badge btse" title="Eleitorado acima de 80% da população — apenas o 3º dos TRÊS critérios cumulativos da Res. TSE 23.659/2021 (art. 105). Sozinho NÃO enseja revisão de eleitorado.">&gt;80%</span>`;
  if (m.outlier_nacional) s += `<span class="badge bnac" title="Outlier estatístico nacional: acima de ${PCT(limBR)} (Tukey Q3+1,5·IQR no Brasil)">atípico</span>`;
  return s || "—";
}
const temFlag = (m) => m.mais_eleitores_que_pop || m.acima_limiar_tse || m.outlier_nacional || m.outlier_uf;

function filtrar() {
  return LINHAS.filter((m) => {
    if (ufSel && m.uf !== ufSel) return false;
    if (busca && !m.nome.toLowerCase().includes(busca)) return false;
    for (const f of flagsAtivas) if (!m[f]) return false;
    return true;
  });
}
function ordenar(linhas) {
  const k = ordenarPor;
  return linhas.slice().sort((a, b) => {
    let va = a[k], vb = b[k];
    if (k === "nome" || k === "uf") return ordemDesc ? String(vb).localeCompare(va) : String(va).localeCompare(vb);
    va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
    return ordemDesc ? vb - va : va - vb;
  });
}
function render() {
  const todas = ordenar(filtrar());
  const linhas = todas.slice(0, LIMITE_LINHAS);
  document.getElementById("corpo").innerHTML = linhas.map((m) => {
    const forte = m.razao_total != null && m.razao_total > 1 ? "razao-forte" : "";
    return `<tr class="clicavel" data-cd="${m.cd_ibge}">
        <td class="nome">${m.nome}</td><td>${m.uf}</td>
        <td class="num">${fmt(m.eleitores)}</td>
        <td class="num">${fmt(m.pop_total_estimada)}</td>
        <td class="num ${forte}">${PCT(m.razao_total)}</td>
        <td class="num">${PCT(m.razao_16mais)}</td>
        <td class="mk">${badges(m)}</td>
      </tr>`;
  }).join("");

  const trunc = todas.length > LIMITE_LINHAS ? ` (mostrando ${LIMITE_LINHAS} — refine)` : "";
  document.getElementById("contagem").textContent = `${todas.length} de ${LINHAS.length} municípios${trunc}`;
  document.querySelectorAll("th[data-k]").forEach((th) => {
    th.removeAttribute("aria-sort");
    if (th.dataset.k === ordenarPor) th.setAttribute("aria-sort", ordemDesc ? "descending" : "ascending");
  });
}

/* ---------------- EVENTOS ---------------- */
function bind() {
  document.getElementById("busca").addEventListener("input", (e) => { busca = e.target.value.trim().toLowerCase(); render(); });
  document.getElementById("uf").addEventListener("change", (e) => { ufSel = e.target.value; render(); renderRanking(); });
  document.getElementById("mapaInd").addEventListener("change", (e) => { mapInd = e.target.value; recolorMapa(); });
  document.querySelectorAll("#mapaFiltro button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mapaFiltro button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on"); destaque = b.dataset.f; recolorMapa();
  }));
  document.getElementById("mapaVoltar").addEventListener("click", voltarBrasil);
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      const f = c.dataset.flag;
      if (flagsAtivas.has(f)) { flagsAtivas.delete(f); c.setAttribute("aria-pressed", "false"); }
      else { flagsAtivas.add(f); c.setAttribute("aria-pressed", "true"); }
      render();
    });
  });
  document.querySelectorAll("th[data-k]").forEach((th) => {
    if (th.dataset.k === "_flags") return;
    th.addEventListener("click", () => {
      const k = th.dataset.k;
      if (k === ordenarPor) ordemDesc = !ordemDesc;
      else { ordenarPor = k; ordemDesc = k !== "nome" && k !== "uf"; }
      render();
    });
  });
  document.getElementById("corpo").addEventListener("click", (e) => {
    const tr = e.target.closest("tr.clicavel"); if (!tr) return;
    const m = munById && munById.get(tr.dataset.cd);
    if (m) abrirCidade(m);
  });
  document.getElementById("btnExplorar").addEventListener("click", () =>
    document.getElementById("explorar").scrollIntoView({ behavior: "smooth" }));
  document.getElementById("btnShare").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
      await navigator.clipboard.writeText(url); toast();
    } catch (_) { /* cancelado */ }
  });
}
let _toastT = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg || "Link copiado ✓";
  t.hidden = false;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

function renderFontes() {
  if (!META) return;
  const fontes = META.fontes || [];
  // agrupa por órgão e condensa famílias (as 28 malhas viram 1, anos juntos)
  const grupos = {};   // orgao -> { base -> Set(anos) }
  fontes.forEach((f) => {
    const org = (f.publisher || "").replace(/\s*—.*/, "").trim() || "Fonte";
    let base;
    if (/Malha/i.test(f.dataset)) base = "Malhas de UF e municípios (GeoJSON)";
    else if (/Códigos oficiais/i.test(f.dataset)) base = "Crosswalk oficial TSE↔IBGE";
    else base = f.dataset.replace(/\s*[-–]\s*\d{4}\s*$/, "").replace(/^IBGE\s+/, "").trim();
    const g = grupos[org] || (grupos[org] = {});
    const anos = g[base] || (g[base] = new Set());
    const ano = (/^\d{4}$/.test(f.periodo) ? f.periodo : (f.dataset.match(/[-–]\s*(\d{4})\s*$/) || [])[1]);
    if (ano) anos.add(ano);
  });
  let html = "";
  for (const org in grupos) {
    const itens = Object.entries(grupos[org]).map(([base, anos]) => {
      const a = [...anos].sort();
      return `<li>${base}${a.length ? ` <span class="quando">(${a.join(", ")})</span>` : ""}</li>`;
    }).join("");
    html += `<div class="fonte-grp"><b>${org}</b><ul>${itens}</ul></div>`;
  }
  const data = fontes.map((f) => f.extraido_em).filter(Boolean).sort().pop() || "";
  html += `<p class="fonte-nota">Extraído em ${data.replace("T", " ").slice(0, 16)} — URL, data e <b>hash SHA-256</b> de cada arquivo em <code>manifest/provenance.json</code>.</p>`;
  document.getElementById("fontes").innerHTML = html;
  const r16 = META.indicadores && META.indicadores.razao_16mais;
  document.getElementById("metanota").textContent = r16 ? r16.metodo : "";
}

carregar().catch((e) => {
  document.getElementById("lede").textContent = "Erro ao carregar os dados. Rode o pipeline (python -m eleitoral.build) para gerar docs/data/brasil.json.";
  console.error(e);
});
