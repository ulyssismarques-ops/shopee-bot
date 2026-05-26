/**
 * Calendário comercial brasileiro + tendências + estações.
 * Calcula um SCORE pra cada produto baseado em:
 *  - qualidade base (nota, shop rating, desconto)
 *  - palavras de tendência geral (skincare, ar fryer, fone bluetooth, etc.)
 *  - evento comercial próximo (Dia dos Namorados, Copa, Natal...)
 *  - estação atual (verão = ventilador, inverno = manta...)
 *
 * Substitui o sort aleatório por curadoria inteligente.
 * Atualize as listas conforme o tempo passa.
 */

// ─── CALENDÁRIO COMERCIAL BRASILEIRO ─────────────────────────────────────────
// Datas fixas (mês/dia) + palavras-chave pra dar boost em produtos relacionados.
// IMPORTANTE: Black Friday e Copa do Mundo precisam ser atualizadas anualmente.
const CALENDARIO_BR = [
  {
    mes: 1, dia: 6,  nome: 'Volta às aulas',
    palavras: ['mochila', 'caderno', 'estojo', 'lápis', 'caneta', 'agenda', 'lancheira', 'material escolar', 'organizador escolar'],
  },
  {
    mes: 2, dia: 17, nome: 'Carnaval',
    palavras: ['fantasia', 'glitter', 'brilho', 'biquíni', 'maiô', 'tiara', 'havaiana', 'óculos de sol', 'protetor solar', 'isopor', 'cooler'],
  },
  {
    mes: 3, dia: 8,  nome: 'Dia da Mulher',
    palavras: ['feminino', 'mulher', 'autoestima', 'autocuidado', 'beleza', 'kit beleza', 'maquiagem'],
  },
  {
    mes: 5, dia: 12, nome: 'Dia das Mães',
    palavras: ['mãe', 'mães', 'maternidade', 'presente mãe', 'feminino', 'kit beleza', 'porta-retrato', 'caixa presente', 'pijama feminino', 'roupão'],
  },
  {
    mes: 6, dia: 12, nome: 'Dia dos Namorados',
    palavras: ['casal', 'namorada', 'namorado', 'romântico', 'amor', 'coração', 'presente casal', 'pijama casal', 'chocolate', 'caneca casal', 'pelúcia', 'almofada coração', 'aliança', 'colar coração', 'porta-retrato casal', 'kit relacionamento', 'jogo casal'],
  },
  {
    mes: 6, dia: 11, nome: 'Copa do Mundo 2026',
    palavras: ['brasil', 'seleção brasileira', 'futebol', 'bandeira brasil', 'verde amarelo', 'camisa brasil', 'cbf', 'bola futebol', 'chuteira', 'cooler', 'churrasco', 'isopor', 'caixa térmica', 'taça', 'copo cervejaria', 'decoração brasil'],
  },
  {
    mes: 6, dia: 24, nome: 'São João / Festa Junina',
    palavras: ['junino', 'festa junina', 'caipira', 'xadrez', 'chapéu palha', 'bandeirinha', 'fogueira', 'pé de moleque', 'paçoca'],
  },
  {
    mes: 8, dia: 10, nome: 'Dia dos Pais',
    palavras: ['pai', 'pais', 'masculino', 'presente pai', 'churrasco', 'cerveja', 'kit cerveja', 'gadget', 'multiferramenta', 'navalha', 'barbeador', 'kit barbear', 'carteira masculina', 'mochila masculina', 'caneca pai', 'caneca cerveja'],
  },
  {
    mes: 9, dia: 7,  nome: 'Primavera / Independência',
    palavras: ['flor', 'vaso', 'planta', 'jardim', 'jardinagem', 'regador', 'verde'],
  },
  {
    mes: 9, dia: 15, nome: 'Dia do Cliente',
    palavras: ['oferta especial', 'super desconto'],
  },
  {
    mes: 10, dia: 12, nome: 'Dia das Crianças',
    palavras: ['criança', 'infantil', 'brinquedo', 'kids', 'bebê', 'baby', 'pelúcia', 'boneca', 'carrinho', 'jogo educativo', 'mochila infantil', 'lancheira infantil'],
  },
  {
    mes: 10, dia: 15, nome: 'Dia dos Professores',
    palavras: ['professor', 'professora', 'agenda', 'caneta especial', 'porta-caneta', 'caneca professor', 'kit escritório', 'organizador mesa'],
  },
  {
    mes: 11, dia: 27, nome: 'Black Friday',
    palavras: ['black friday', 'mega desconto', 'arrasador'],
  },
  {
    mes: 12, dia: 25, nome: 'Natal',
    palavras: ['natal', 'natalino', 'enfeite natal', 'pisca pisca', 'árvore natal', 'guirlanda', 'papai noel', 'panetone', 'amigo secreto', 'presente natal', 'meia natal', 'decoração natal'],
  },
  {
    mes: 12, dia: 31, nome: 'Ano Novo',
    palavras: ['ano novo', 'reveillon', 'branco', 'champagne', 'taça', 'espumante'],
  },
];

// ─── ESTAÇÕES NO BRASIL (hemisfério sul) ────────────────────────────────────
const ESTACOES_BR = {
  verao:    {
    meses: [12, 1, 2, 3],
    palavras: ['verão', 'praia', 'piscina', 'biquíni', 'maiô', 'sunga', 'protetor solar', 'óculos de sol', 'ventilador', 'ar condicionado', 'climatizador', 'cooler', 'gelo', 'churrasco', 'havaiana', 'rasteirinha', 'short praia', 'canga', 'boné', 'chapéu'],
  },
  outono:   {
    meses: [4, 5],
    palavras: ['outono', 'cardigan', 'manga longa leve', 'café especial', 'chá'],
  },
  inverno:  {
    meses: [6, 7, 8],
    palavras: ['inverno', 'manta', 'cobertor', 'edredom', 'casaco', 'jaqueta', 'gorro', 'cachecol', 'luva', 'meia', 'aquecedor', 'soprador ar quente', 'pantufa', 'roupão', 'chá', 'fondue', 'sopa', 'caneca térmica'],
  },
  primavera:{
    meses: [9, 10, 11],
    palavras: ['primavera', 'flor', 'planta', 'jardim', 'vaso', 'limpeza', 'organização', 'detox'],
  },
};

// ─── TENDÊNCIAS PERMANENTES (atualize semestralmente) ────────────────────────
// Palavras que indicam produto "trending" no Brasil agora — atrai engajamento.
const TENDENCIAS_GERAIS = [
  // Tech popular
  'fone bluetooth', 'fone sem fio', 'smartwatch', 'carregador rápido', 'powerbank',
  'cabo tipo c', 'cabo usb c', 'suporte celular', 'caixa de som', 'projetor portátil',
  'webcam', 'mouse sem fio',

  // Casa estética / decor
  'luminária', 'led', 'fita led', 'pendente', 'aromatizador ambiente',
  'difusor', 'vaso decorativo', 'porta-retrato', 'quadro decorativo',
  'cortina blackout', 'tapete sala', 'almofada',

  // Organização
  'organizador', 'cesto organizador', 'caixa organizadora', 'porta-objetos',
  'gancho parede', 'prateleira', 'cabide multifuncional',

  // Cozinha gourmet / utilidades
  'air fryer', 'acessório air fryer', 'forma silicone', 'jarra água',
  'garrafa térmica', 'tupperware', 'pote hermético', 'copo stanley',
  'copo personalizado', 'squeeze', 'garrafinha', 'lancheira térmica',
  'descascador', 'cortador legumes', 'utensílios cozinha',

  // Beleza tendência BR
  'sérum facial', 'skincare', 'ácido hialurônico', 'niacinamida', 'vitamina c',
  'esfoliante', 'máscara facial', 'cílios postiço', 'gloss labial',
  'pincel maquiagem', 'esponja maquiagem', 'beauty blender',
  'escova alisadora', 'modelador cachos', 'secador',

  // Fitness em casa
  'elástico fitness', 'colchonete', 'corda de pular', 'caneleira',
  'halter', 'roller', 'tapete yoga',

  // Pet (em alta no BR)
  'cama pet', 'arranhador', 'comedouro pet', 'bebedouro pet', 'caixa transporte',
  'brinquedo cachorro', 'brinquedo gato', 'coleira', 'guia',

  // Acessórios automotivos universais (não modelo específico)
  'suporte celular carro', 'carregador veicular', 'aromatizador automotivo',
  'organizador porta-malas', 'capa de volante', 'almofada pescoço carro',
  'cinto segurança pet',

  // Moda básica BR
  'vestido midi', 'vestido feminino', 'blusa cropped', 'cropped',
  'jeans destroyed', 'tênis branco', 'mochila feminina', 'bolsa transversal',
  'pochete', 'bone aba reta',

  // Bebê / infantil em alta
  'mordedor bebê', 'tapete bebê', 'mochila escolar', 'merendeira',
];

// ─── FUNÇÕES ─────────────────────────────────────────────────────────────────

function diasAteEvento(evento, hoje = new Date()) {
  const ano = hoje.getFullYear();
  let dataEvento = new Date(ano, evento.mes - 1, evento.dia);
  if (dataEvento < hoje) {
    dataEvento = new Date(ano + 1, evento.mes - 1, evento.dia);
  }
  return Math.floor((dataEvento - hoje) / (1000 * 60 * 60 * 24));
}

/** Retorna o evento comercial mais próximo (que ainda vai acontecer) */
function eventoMaisProximo(hoje = new Date()) {
  let melhor = null;
  let menorDias = Infinity;
  for (const ev of CALENDARIO_BR) {
    const d = diasAteEvento(ev, hoje);
    if (d < menorDias) {
      menorDias = d;
      melhor = { ...ev, diasAte: d };
    }
  }
  return melhor;
}

/** Retorna a estação atual (verão, outono, inverno, primavera) */
function estacaoAtual(hoje = new Date()) {
  const mes = hoje.getMonth() + 1;
  for (const [nome, info] of Object.entries(ESTACOES_BR)) {
    if (info.meses.includes(mes)) return { nome, palavras: info.palavras };
  }
  return null;
}

/**
 * Calcula um score 0-200 pro produto. Quanto maior, mais alta a chance de ser destacado.
 *
 * Composição:
 *  • 0-25 pontos: nota do produto (4.5 = 12, 5.0 = 25)
 *  • 0-25 pontos: shop rating (4.7 = 17, 5.0 = 25)
 *  • 0-30 pontos: desconto (20% = 10, 50%+ = 30)
 *  • +30 pontos: nome bate com lista de tendências gerais
 *  • +50 pontos: nome bate com evento ≤ 14 dias
 *  • +25 pontos: nome bate com evento 15-30 dias
 *  • +15 pontos: nome bate com estação atual
 */
function pontuarProduto(produto, hoje = new Date()) {
  let score = 0;
  const nome = (produto.nome || '').toLowerCase();

  // Score base de qualidade
  const ratingPts = Math.max(0, (produto.avaliacao - 4) * 25);
  const shopPts   = Math.max(0, (produto.shopRating - 4) * 25);
  const descPts   = Math.min(produto.desconto * 0.6, 30);
  score += ratingPts + shopPts + descPts;

  // Boost tendência geral
  if (TENDENCIAS_GERAIS.some(t => nome.includes(t))) {
    score += 30;
  }

  // Boost evento — checa TODOS os eventos ≤ 30d (não só o mais próximo)
  // e pega o maior boost. Assim Namorados (17d) ainda boosta produtos
  // mesmo com Copa (15d) sendo o evento mais próximo.
  let melhorBoostEvento = 0;
  for (const ev of CALENDARIO_BR) {
    const d = diasAteEvento(ev, hoje);
    if (d > 30) continue;
    const bate = ev.palavras.some(p => nome.includes(p));
    if (!bate) continue;
    const boost = d <= 14 ? 50 : 25;
    if (boost > melhorBoostEvento) melhorBoostEvento = boost;
  }
  score += melhorBoostEvento;

  // Boost estação
  const estacao = estacaoAtual(hoje);
  if (estacao && estacao.palavras.some(p => nome.includes(p))) {
    score += 15;
  }

  return Math.round(score);
}

/** Pra usar nos logs — descreve o contexto atual */
function descreverContexto(hoje = new Date()) {
  const ev = eventoMaisProximo(hoje);
  const est = estacaoAtual(hoje);
  const partes = [];
  if (ev) partes.push(`🎯 Próximo: ${ev.nome} em ${ev.diasAte}d`);
  if (est) partes.push(`🌡️ Estação: ${est.nome}`);
  return partes.join(' | ');
}

// ─── CHAMADAS CONTEXTUAIS POR CANAL ──────────────────────────────────────────
// Quando um produto bate com evento próximo, substituímos a abertura padrão da
// mensagem por uma "chamada" contextual. Cada canal tem um tom próprio.
// Canais: 'whatsapp' | 'geral' (IG @achadinhosdaroh01) | 'beleza' (IG @byrosanamatias)
const CHAMADAS_EVENTO = {
  'Volta às aulas': {
    whatsapp: '📚 Volta às aulas chegou! Achadinho indispensável 🔥',
    geral:    '📚 Volta às aulas! Achadinho que toda mãe ama:',
    beleza:   '✨ Volta às aulas com beleza — visual de outono:',
  },
  'Carnaval': {
    whatsapp: '🎭 Carnaval tá chegando! Confere essa promo 🔥',
    geral:    '🎭 Bloquinho na rua, achadinho na mão!',
    beleza:   '✨ Carnaval glow! Tudo pra você arrasar:',
  },
  'Dia da Mulher': {
    whatsapp: '👑 Dia da Mulher chegando — você merece 🔥',
    geral:    '👑 Pra toda mulher incrível — achadinho perfeito:',
    beleza:   '💄 Dia da Mulher chegando! Autocuidado é tudo:',
  },
  'Dia das Mães': {
    whatsapp: '💝 Dia das Mães em breve! Achei o presente 🔥',
    geral:    '💝 Surpreenda sua mãe — achadinho perfeito:',
    beleza:   '💖 Pro presente de Mãe — beleza com amor:',
  },
  'Dia dos Namorados': {
    whatsapp: '💕 Dia dos Namorados vem aí! Olha que ideia 🔥',
    geral:    '💕 Bora surpreender o amor — achadinho perfeito:',
    beleza:   '✨ Brilhar pro seu amor — kit beleza pra noite especial:',
  },
  'Copa do Mundo 2026': {
    whatsapp: '🏆 COPA DO MUNDO VEM AÍ! Achadinho de torcedor 🇧🇷',
    geral:    '🏆 Brasil na Copa 2026 — torça com estilo!',
    beleza:   '🟢🟡 Copa chegando — look verde-amarelo perfeito:',
  },
  'São João / Festa Junina': {
    whatsapp: '🌽 São João tá chegando! Olha essa 🔥',
    geral:    '🔥 Festa Junina à vista! Achadinho típico:',
    beleza:   '🌽 Look junino arretado! Beleza pra brilhar:',
  },
  'Dia dos Pais': {
    whatsapp: '👨 Dia dos Pais vem aí! Presente que arrasa 🔥',
    geral:    '👔 Pai merece — achadinho que vai surpreender:',
    beleza:   '✨ Pra ele se cuidar também — beleza masculina:',
  },
  'Primavera / Independência': {
    whatsapp: '🌸 Primavera chegando! Achadinho fresco 🔥',
    geral:    '🌸 Primavera no ar — bora florir tudo:',
    beleza:   '🌸 Pele radiante de primavera — confere:',
  },
  'Dia do Cliente': {
    whatsapp: '💸 Dia do Cliente! Desconto especial 🔥',
    geral:    '💸 É o seu dia! Achadinho com mega desconto:',
    beleza:   '💄 Dia do Cliente — beleza com super preço:',
  },
  'Dia das Crianças': {
    whatsapp: '🎁 Dia das Crianças em breve! Achei 🔥',
    geral:    '🎉 Bora alegrar a criançada — olha essa:',
    beleza:   '👧 Achadinho pra pequena diva — confira:',
  },
  'Dia dos Professores': {
    whatsapp: '🍎 Dia dos Professores vem aí! Presente especial 🔥',
    geral:    '🍎 Pro mestre que muda vidas — olha esse:',
    beleza:   '✨ Pra professora se cuidar — kit autocuidado:',
  },
  'Black Friday': {
    whatsapp: '🛒 BLACK FRIDAY CHEGANDO! Olha esse preço 🔥',
    geral:    '🛒 Black Friday Antecipada — não perde essa!',
    beleza:   '🛒 Black Friday começou! Beleza com mega desconto:',
  },
  'Natal': {
    whatsapp: '🎄 Natal vem aí! Presente perfeito 🔥',
    geral:    '🎄 Bora preparar o Natal — achadinho natalino:',
    beleza:   '🎄 Natal chegando — kit beleza pra brilhar:',
  },
  'Ano Novo': {
    whatsapp: '✨ Ano Novo vem aí! Bora começar bem 🔥',
    geral:    '🥂 Réveillon chegando — branco de arrasar:',
    beleza:   '💫 Ano Novo vem aí! Brilhar na virada:',
  },
};

const CHAMADAS_ESTACAO = {
  verao: {
    whatsapp: '☀️ Verão tá chegando! Achadinho fresquinho 🔥',
    geral:    '🏖️ Verão à vista — esse vai ser sucesso:',
    beleza:   '☀️ Verão chegou! Pele protegida e brilhante:',
  },
  outono: {
    whatsapp: '🍂 Outono no clima! Achadinho aconchegante 🔥',
    geral:    '🍂 Mudança de estação — bora se preparar:',
    beleza:   '🍂 Outono: pele precisa de hidratação extra:',
  },
  inverno: {
    whatsapp: '❄️ INVERNO VEM AÍ! Esquenta com essa promo 🔥',
    geral:    '❄️ Frio chegando — aconchego garantido:',
    beleza:   '❄️ Inverno seca a pele — hidrate-se com:',
  },
  primavera: {
    whatsapp: '🌸 Primavera vem aí! Achadinho fresco 🔥',
    geral:    '🌸 Primavera no ar — bora florir:',
    beleza:   '🌸 Primavera chegou! Pele radiante:',
  },
};

const CHAMADAS_TRENDING = {
  whatsapp: '🔥 Achadinho que tá BOMBANDO — corre 🔥',
  geral:    '✨ O achadinho que tá em todo lugar:',
  beleza:   '✨ O queridinho do momento:',
};

const CHAMADAS_DEFAULT = {
  whatsapp: '🔥 OFERTA IMPERDÍVEL 🔥',
  geral:    '🔥 OFERTA IMPERDÍVEL!',
  beleza:   '✨ Achado do dia!',
};

/**
 * Gera a linha de abertura ("chamada") contextual baseada no produto e canal.
 * Prioridade:
 *  1. Evento comercial ≤ 30 dias (se nome do produto bater com palavras do evento)
 *  2. Estação atual OU próxima (até 60 dias) — assim "manta inverno" em maio
 *     ainda dispara "INVERNO VEM AÍ" mesmo a estação atual sendo outono
 *  3. Tendência geral (se nome bate com TENDENCIAS_GERAIS)
 *  4. Fallback: chamada padrão do canal
 *
 * canal: 'whatsapp' | 'geral' | 'beleza'
 */
function gerarChamada(produto, canal = 'whatsapp', hoje = new Date()) {
  const nome = (produto.nome || '').toLowerCase();

  // 1. Evento ≤ 30 dias
  for (const ev of CALENDARIO_BR) {
    const d = diasAteEvento(ev, hoje);
    if (d > 30) continue;
    if (!ev.palavras.some(p => nome.includes(p))) continue;
    const chamada = CHAMADAS_EVENTO[ev.nome]?.[canal];
    if (chamada) return chamada;
  }

  // 2. Estação atual ou próxima (até 2 meses pra frente)
  const mes = hoje.getMonth() + 1;
  const mesesRelevantes = [mes, (mes % 12) + 1, ((mes + 1) % 12) + 1];
  for (const [estNome, info] of Object.entries(ESTACOES_BR)) {
    if (!info.palavras.some(p => nome.includes(p))) continue;
    if (!info.meses.some(m => mesesRelevantes.includes(m))) continue;
    const chamada = CHAMADAS_ESTACAO[estNome]?.[canal];
    if (chamada) return chamada;
  }

  // 3. Tendência geral
  if (TENDENCIAS_GERAIS.some(t => nome.includes(t))) {
    return CHAMADAS_TRENDING[canal];
  }

  // 4. Default
  return CHAMADAS_DEFAULT[canal];
}

module.exports = {
  pontuarProduto,
  eventoMaisProximo,
  estacaoAtual,
  descreverContexto,
  gerarChamada,
  CALENDARIO_BR,
  TENDENCIAS_GERAIS,
};
