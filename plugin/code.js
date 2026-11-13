// Plugin "Tokens do Lab → n8n".
// Ler: lê as variáveis do arquivo aberto e entrega para a janela, que envia ao n8n.
// Prévia: mostra a proposta do n8n desenhada (cores, contraste, medidas, fontes) antes de mudar qualquer coisa.
// Aplicar: depois do seu clique, organiza o arquivo: Base, Semântica, grupos opcionais e linha Valor.
figma.showUI(__html__, { width: 452, height: 720 }); // largura do design (Portfólio, 324:21867)

function hex(c) {
  const p = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return ('#' + p(c.r) + p(c.g) + p(c.b)).toUpperCase();
}
function rgb(h) {
  const n = String(h).replace('#', '');
  return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255, a: 1 };
}
function tipoDe(t) {
  return t === 'COLOR' ? 'color' : t === 'FLOAT' ? 'number' : t === 'STRING' ? 'string' : 'boolean';
}
const ehAlias = v => v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS';
const limpo = s => String(s || '').trim().toLowerCase();

async function carregar() {
  const colecoes = await figma.variables.getLocalVariableCollectionsAsync();
  const variaveis = await figma.variables.getLocalVariablesAsync();
  const varPorId = new Map(variaveis.map(v => [v.id, v]));
  const colPorId = new Map(colecoes.map(c => [c.id, c]));
  const variavel = async id => varPorId.get(id) || (await figma.variables.getVariableByIdAsync(id));
  const colecao = async id => colPorId.get(id) || (await figma.variables.getVariableCollectionByIdAsync(id));
  // Segue a cadeia de referências até o valor final, no modo pedido (ou no padrão da coleção de destino)
  async function resolver(v, modeId, passos = 0) {
    if (!v || passos > 10) return null;
    const col = await colecao(v.variableCollectionId);
    const modo = col.modes.some(m => m.modeId === modeId) ? modeId : col.defaultModeId;
    const valor = v.valuesByMode[modo];
    if (ehAlias(valor)) return resolver(await variavel(valor.id), modeId, passos + 1);
    return valor;
  }
  return { colecoes, variaveis, colPorId, variavel, colecao, resolver };
}

async function lerVariaveis() {
  const { colecoes, variaveis, colPorId, variavel, colecao, resolver } = await carregar();
  const saida = {};
  for (const col of colecoes) {
    saida[limpo(col.name)] = {};
    for (const m of col.modes) saida[limpo(col.name)][limpo(m.name)] = {};
  }
  for (const v of variaveis) {
    const col = colPorId.get(v.variableCollectionId);
    if (!col) continue;
    for (const m of col.modes) {
      const bruto = v.valuesByMode[m.modeId];
      let ref = null, refColecao = null;
      if (ehAlias(bruto)) {
        const alvo = await variavel(bruto.id);
        if (alvo) {
          ref = alvo.name;
          const colAlvo = await colecao(alvo.variableCollectionId);
          refColecao = colAlvo ? limpo(colAlvo.name) : null;
        }
      }
      const final = await resolver(v, m.modeId);
      saida[limpo(col.name)][limpo(m.name)][v.name] = {
        tipo: tipoDe(v.resolvedType),
        valor: v.resolvedType === 'COLOR' && final && typeof final === 'object' ? hex(final) : final,
        ref,
        refColecao,
        descricao: v.description || '',
        escopos: v.scopes || [],
      };
    }
  }
  const primeiroModo = obj => (obj ? obj[Object.keys(obj)[0]] || {} : {});
  return {
    arquivo: figma.root.name,
    colecoes: Object.keys(saida),
    base: primeiroModo(saida.base),
    semantic: { light: (saida.semantic || {}).light || {}, dark: (saida.semantic || {}).dark || {} },
    specific: { light: (saida.specific || {}).light || {}, dark: (saida.specific || {}).dark || {} },
  };
}

async function listarEspecificos() {
  const colecoes = await figma.variables.getLocalVariableCollectionsAsync();
  const specific = colecoes.find(c => limpo(c.name) === 'specific');
  if (!specific) return [];
  const variaveis = await figma.variables.getLocalVariablesAsync();
  return variaveis.filter(v => v.variableCollectionId === specific.id).map(v => v.name).sort();
}

// ---------- Prévia e aplicação da proposta ----------
const PESOS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const virgula = v => String(+Number(v).toFixed(4)).replace('.', ',');
// Seção 05: na cor, "claro | escuro"; na medida, px e rem (border-width só px); no peso, o nome junto
function textoMedida(token, ref, v) {
  if (typeof v !== 'number') return ref;
  if (token.startsWith('border-width/')) return `${ref} (${virgula(v)} px)`;
  if (/font-weight/.test(token)) return `${ref} (${v}${PESOS[v] ? ' · ' + PESOS[v] : ''})`;
  if (token.startsWith('opacity/')) return `${ref} (${v})`;
  return `${ref} (${virgula(v)} px · ${virgula(v / 16)} rem)`;
}
function trocarLinhaValor(descricao, novo) {
  const linhas = String(descricao || '').split('\n');
  const i = linhas.findIndex(l => /^\s*Valor\s*:/.test(l));
  if (i === -1) return null;
  linhas[i] = `Valor: ${novo}`;
  return linhas.join('\n');
}
function lum(h) {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// Confere o plano contra o arquivo. Nada muda aqui: serve à prévia e ao aplicar.
async function preparar(plano) {
  if (!plano || plano.versao !== 2) throw new Error('A proposta recebida não está no formato esperado. Atualize o nó Montar ficha.');
  if (plano.arquivo && plano.arquivo !== figma.root.name) throw new Error(`Esta proposta é do arquivo "${plano.arquivo}", e o aberto é "${figma.root.name}". Abra o arquivo certo.`);
  const ctx = await carregar();
  const { colecoes, variaveis, variavel } = ctx;
  const col = nome => colecoes.find(c => limpo(c.name) === nome);
  const base = col('base'), semantic = col('semantic');
  if (!base || !semantic) throw new Error('O arquivo precisa das coleções base e semantic.');
  const modo = nome => (semantic.modes.find(m => limpo(m.name) === nome) || {}).modeId;
  const mLight = modo('light'), mDark = modo('dark'), mBase = base.defaultModeId;
  if (!mLight || !mDark) throw new Error('A coleção semantic precisa dos modos light e dark.');
  const daColecao = c => new Map(variaveis.filter(v => v.variableCollectionId === c.id).map(v => [v.name, v]));
  const B = daColecao(base), S = daColecao(semantic);

  const erros = [];
  for (const x of plano.base || []) {
    const v = B.get(x.token);
    if (!v) erros.push(`Base: ${x.token} não existe`);
    else if (v.resolvedType === 'COLOR' && !/^#[0-9A-F]{6}$/i.test(x.valor)) erros.push(`Base: ${x.token} recebeu "${x.valor}", que não é cor`);
  }
  for (const x of plano.semantic || []) {
    if (!S.get(x.token)) erros.push(`Semântica: ${x.token} não existe`);
    for (const ref of [x.claro, x.escuro]) if (!B.get(ref)) erros.push(`Semântica: ${x.token} aponta para ${ref}, que não está na Base`);
  }
  const apagaveis = (plano.apagar || []).filter(n => S.get(n) || B.get(n));
  const apagarSet = new Set(apagaveis);
  const trocados = new Set((plano.semantic || []).map(x => x.token));
  for (const x of plano.semantic || []) for (const ref of [x.claro, x.escuro]) if (apagarSet.has(ref)) erros.push(`Semântica: ${x.token} aponta para ${ref}, que vai ser apagado`);
  for (const v of variaveis) {
    if (apagarSet.has(v.name) && (B.get(v.name) === v || S.get(v.name) === v)) continue;
    for (const valor of Object.values(v.valuesByMode)) {
      if (!ehAlias(valor)) continue;
      const alvo = await variavel(valor.id);
      if (alvo && apagarSet.has(alvo.name) && !trocados.has(v.name)) erros.push(`${v.name} aponta para ${alvo.name}, que vai ser apagado`);
    }
  }
  return { ...ctx, B, S, semantic, mLight, mDark, mBase, apagaveis, apagarSet, erros: [...new Set(erros)] };
}

// Pares de contraste pelo Par de cada texto, ícone e limite de controle (WCAG 2.2 AA)
function minimoDe(nome) {
  return nome.startsWith('text/') ? 4.5 : nome.startsWith('icon/') || /^border\/(strong|selected|focus)/.test(nome) ? 3 : 0;
}
function fundosDoPar(v, existe) {
  const par = String(v.description).split('\n').find(l => /^\s*Par\s*:/.test(l)) || '';
  return [...new Set(par.match(/background\/[a-z0-9\-\/]+/g) || [])].filter(existe);
}

// Prévia: como o arquivo fica depois, sem mudar nada
async function simular(plano) {
  const p = await preparar(plano);
  const { B, S, mLight, mDark, mBase, apagarSet, variavel, resolver } = p;
  const baseDepois = new Map([...B].map(([n, v]) => [n, v.valuesByMode[mBase]]));
  for (const x of plano.base || []) baseDepois.set(x.token, B.get(x.token).resolvedType === 'COLOR' ? rgb(x.valor) : x.valor);
  const novo = new Map((plano.semantic || []).map(x => [x.token, x]));
  const fmt = v => (v && typeof v === 'object' && 'r' in v ? hex(v) : v);

  async function refAtual(v, m) {
    const bruto = v.valuesByMode[m];
    if (!ehAlias(bruto)) return null;
    const alvo = await variavel(bruto.id);
    return alvo ? alvo.name : null;
  }
  const valores = {};
  for (const [nome, v] of S) {
    if (apagarSet.has(nome)) continue;
    const linha = { tipo: v.resolvedType };
    for (const [m, k] of [[mLight, 'claro'], [mDark, 'escuro']]) {
      const antes = fmt(await resolver(v, m));
      const ref = novo.has(nome) ? novo.get(nome)[k] : await refAtual(v, m);
      const depois = ref && baseDepois.has(ref) ? fmt(baseDepois.get(ref)) : antes;
      linha[k] = { antes, depois, ref };
    }
    valores[nome] = linha;
  }
  const cores = Object.entries(valores).filter(([, l]) => l.tipo === 'COLOR' && (l.claro.antes !== l.claro.depois || l.escuro.antes !== l.escuro.depois))
    .map(([token, l]) => ({ token, claro: [l.claro.antes, l.claro.depois], escuro: [l.escuro.antes, l.escuro.depois] }));
  const medidas = (plano.semantic || []).filter(x => valores[x.token] && valores[x.token].tipo === 'FLOAT')
    .map(x => ({ token: x.token, antes: valores[x.token].claro.antes, depois: valores[x.token].claro.depois, ref: x.claro }));
  const fontes = (plano.base || []).filter(x => B.get(x.token).resolvedType === 'STRING')
    .map(x => ({ token: x.token, antes: B.get(x.token).valuesByMode[mBase], depois: x.valor }));
  const contrastes = [];
  for (const [nome, v] of S) {
    const min = minimoDe(nome);
    if (!min || !valores[nome]) continue;
    for (const f of fundosDoPar(v, n => !!valores[n])) for (const k of ['claro', 'escuro']) {
      const fr = valores[nome][k], fu = valores[f][k];
      if (![fr.antes, fr.depois, fu.antes, fu.depois].every(c => /^#[0-9A-F]{6}$/i.test(c || ''))) continue;
      contrastes.push({ frente: nome, fundo: f, modo: k, min, corFrente: fr.depois, corFundo: fu.depois,
        antes: +contraste(fr.antes, fu.antes).toFixed(2), depois: +contraste(fr.depois, fu.depois).toFixed(2) });
    }
  }
  const grupos = {};
  for (const n of p.apagaveis) {
    const acc = n.match(/accent-(\d)/);
    const g = acc ? `accent-${acc[1]} (Semântica)` : /^data-\d/.test(n) ? 'data-1 a data-6 (Base)' : n.startsWith('data/') ? 'data (Semântica)' : `${n.split('/')[0]} (Base)`;
    grupos[g] = (grupos[g] || 0) + 1;
  }
  // Componente de exemplo: os tokens que um cartão usa, hoje e na proposta, nos dois modos
  const usados = ['background/canvas', 'background/surface', 'border/subtle', 'radius/medium', 'radius/x-small', 'radius/xx-small', 'space/medium', 'space/small', 'space/x-small',
    'border-width/default', 'background/accent-1/subtle', 'text/primary', 'text/secondary', 'text/link', 'background/action/primary', 'text/on-action-primary',
    'typography/heading/small/font-size', 'typography/heading/small/line-height', 'typography/heading/small/font-weight', 'typography/heading/font-family',
    'typography/body/medium/font-size', 'typography/body/medium/line-height', 'typography/body/medium/font-weight', 'typography/body/font-family',
    'typography/label/medium/font-size', 'typography/label/medium/font-weight', 'typography/label/small/font-size', 'typography/label/font-family'];
  const fonteBase = (nome, quando) => fmt(quando === 'antes' ? B.get(nome)?.valuesByMode[mBase] : baseDepois.get(nome));
  const componente = {};
  for (const quando of ['antes', 'depois']) for (const k of ['claro', 'escuro']) {
    const t = {};
    for (const n of usados) if (valores[n]) t[n] = valores[n][k][quando];
    t['font-family/primary'] = fonteBase('font-family/primary', quando);
    t['font-family/secondary'] = fonteBase('font-family/secondary', quando);
    componente[`${quando}-${k}`] = t;
  }
  return { erros: p.erros, cores, medidas, fontes, contrastes, grupos, componente, pendencias: plano.pendencias || [], linhaProjetos: plano.linhaProjetos || '', projeto: plano.projeto };
}

async function aplicarPlano(plano) {
  const inicio = Date.now();
  const p = await preparar(plano);
  if (p.erros.length) return { aplicado: false, linhas: ['Nada mudou no arquivo. Antes, corrija:', ...p.erros.slice(0, 15)] };
  const { B, S, semantic, mLight, mDark, mBase, apagaveis } = p;

  figma.commitUndo();
  const semLinhaValor = [];
  // Base: valores novos (cores da marca, neutro, famílias de fonte)
  for (const x of plano.base || []) {
    const v = B.get(x.token);
    v.setValueForMode(mBase, v.resolvedType === 'COLOR' ? rgb(x.valor) : x.valor);
    const nova = trocarLinhaValor(v.description, v.resolvedType === 'COLOR' ? String(x.valor).toUpperCase() : x.valor);
    if (nova === null) { if (!v.description.trim()) v.description = `Valor: ${x.valor}`; else semLinhaValor.push(x.token); }
    else v.description = nova;
  }
  // Semântica: novas referências nos dois modos, e a linha Valor junto
  for (const x of plano.semantic || []) {
    const v = S.get(x.token), claro = B.get(x.claro), escuro = B.get(x.escuro);
    v.setValueForMode(mLight, figma.variables.createVariableAlias(claro));
    v.setValueForMode(mDark, figma.variables.createVariableAlias(escuro));
    const valorClaro = claro.valuesByMode[mBase], valorEscuro = escuro.valuesByMode[mBase];
    const texto = v.resolvedType === 'COLOR' ? `${x.claro} | ${x.escuro}`
      : x.claro === x.escuro ? textoMedida(x.token, x.claro, valorClaro)
      : `${textoMedida(x.token, x.claro, valorClaro)} | ${textoMedida(x.token, x.escuro, valorEscuro)}`;
    const nova = trocarLinhaValor(v.description, texto);
    if (nova === null) semLinhaValor.push(x.token); else v.description = nova;
  }
  // Grupos opcionais: primeiro a Semântica, depois a Base
  let apagadas = 0;
  for (const n of apagaveis) if (S.get(n)) { S.get(n).remove(); apagadas++; }
  for (const n of apagaveis) if (B.get(n)) { B.get(n).remove(); apagadas++; }
  figma.commitUndo();

  // Contraste depois de aplicar, lido do arquivo
  const depois = await carregar();
  const S2 = new Map(depois.variaveis.filter(v => v.variableCollectionId === semantic.id).map(v => [v.name, v]));
  const cor = async (v, m) => { const c = await depois.resolver(v, m); return c && typeof c === 'object' && 'r' in c ? hex(c) : null; };
  const falhas = [];
  let medidos = 0;
  for (const [nome, v] of S2) {
    const min = minimoDe(nome);
    if (!min) continue;
    for (const f of fundosDoPar(v, n => S2.has(n))) for (const [m, rotulo] of [[mLight, 'claro'], [mDark, 'escuro']]) {
      const a = await cor(v, m), b = await cor(S2.get(f), m);
      if (!a || !b) continue;
      medidos++;
      const r = contraste(a, b);
      if (r < min) falhas.push(`${rotulo}: ${nome} × ${f} = ${r.toFixed(2)}:1 (mínimo ${min}:1)`);
    }
  }

  const linhas = [
    `Aplicado em ${Math.max(1, Math.round((Date.now() - inicio) / 1000))} s. Ctrl+Z desfaz.`,
    `Base: ${(plano.base || []).length} valores · Semântica: ${(plano.semantic || []).length} referências · Apagadas: ${apagadas} variáveis`,
    `Contraste: ${medidos} pares medidos, ${falhas.length} abaixo do mínimo`,
    ...falhas.slice(0, 20),
  ];
  if (semLinhaValor.length) linhas.push('', `Sem linha "Valor:" na descrição (atualize à mão): ${semLinhaValor.join(', ')}`);
  if ((plano.semantic || []).some(x => x.token.startsWith('typography/'))) linhas.push('', 'Mudou tipografia: atualize a linha Valor dos estilos de texto afetados.');
  if ((plano.pendencias || []).length) linhas.push('', 'Fica para você:', ...plano.pendencias);
  if (plano.linhaProjetos) linhas.push('', 'Linha para a lista de projetos (quadro Registro):', plano.linhaProjetos);
  figma.notify(falhas.length ? `Aplicado, com ${falhas.length} pares abaixo do contraste` : 'Proposta aplicada');
  return { aplicado: true, linhas, falhas: falhas.length };
}

figma.ui.onmessage = async msg => {
  try {
    if (msg.tipo === 'pronto') {
      const urls = (await figma.clientStorage.getAsync('urls')) || {};
      const pedidos = (await figma.clientStorage.getAsync('pedidos')) || {};
      figma.ui.postMessage({ tipo: 'inicio', arquivo: figma.root.name, especificos: await listarEspecificos(), urls, pedido: pedidos[figma.root.name] || '' });
    }
    if (msg.tipo === 'salvarUrls') {
      await figma.clientStorage.setAsync('urls', msg.urls);
    }
    if (msg.tipo === 'salvarPedido') {
      const pedidos = (await figma.clientStorage.getAsync('pedidos')) || {};
      pedidos[figma.root.name] = msg.id;
      await figma.clientStorage.setAsync('pedidos', pedidos);
    }
    if (msg.tipo === 'coletar') {
      const pacote = await lerVariaveis();
      pacote.acao = msg.acao;
      pacote.pedidoId = msg.pedidoId || '';
      pacote.respostas = msg.respostas || {};
      pacote.pedido = msg.pedido || {};
      figma.ui.postMessage({ tipo: 'pacote', pacote });
    }
    if (msg.tipo === 'previa') {
      figma.ui.resize(452, 760);
      const previa = await simular(msg.plano);
      figma.ui.postMessage({ tipo: 'previa', previa });
    }
    if (msg.tipo === 'aplicar') {
      const relatorio = await aplicarPlano(msg.plano);
      figma.ui.postMessage({ tipo: 'relatorio', relatorio });
    }
  } catch (e) {
    figma.ui.postMessage({ tipo: 'erro', mensagem: String((e && e.message) || e) });
  }
};
