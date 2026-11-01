// Etapa 2: investiga UM site (respeitando robots.txt), valida o CNPJ na base oficial e calcula notas explicáveis.
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (compatible; SupplierIntelLite/1.0; pesquisa comercial pessoal)';
const hoje = () => new Date().toISOString().slice(0, 10);

export function cnpjValido(c) { // aceita numérico e o novo CNPJ alfanumérico
  c = c.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
  const v = [...c].map(x => x.charCodeAt(0) - 48);
  const dig = n => { let s = 0, p = 2; for (let i = n - 1; i >= 0; i--) { s += v[i] * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dig(12) === v[12] && dig(13) === v[13];
}

export function extrair(html) {
  const texto = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const t = texto.toLowerCase(), uniq = a => [...new Set(a)];
  return {
    titulo: ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    cnpjs: uniq((texto.match(/\b[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-[0-9]{2}\b/g) || []).filter(cnpjValido)),
    emails: uniq((html.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).map(e => e.toLowerCase()).filter(e => !/\.(png|jpe?g|gif|webp|svg)$|sentry|example|wixpress/.test(e))).slice(0, 3),
    whatsapp: uniq([...html.matchAll(/(?:wa\.me\/|phone=)\+?(55\d{10,11})/g)].map(m => m[1])).slice(0, 3),
    telefones: uniq(texto.match(/\(\d{2}\)\s?9?\d{4}[-\s]?\d{4}|\b\d{2}\s9?\d{4}-\d{4}\b/g) || []).slice(0, 3),
    instagram: ((html.match(/instagram\.com\/([\w.]{2,30})/i) || [])[1] || '').replace(/^(p|reel|explore)$/, ''),
    sinais: {
      atacado: /atacado|atacadista/.test(t), pedido_minimo: /pedido m[ií]nimo|compra m[ií]nima|quantidade m[ií]nima/.test(t),
      nota_fiscal: /nota fiscal|nf-e|\bnfe\b/.test(t), dropshipping: /drop ?shipping/.test(t),
      revenda: /revend|lojista/.test(t), catalogo: /cat[aá]logo|tabela de pre/.test(t),
      anvisa: /anvisa|autoriza[cç][aã]o de funcionamento|\bafe\b/.test(t) },
  };
}

function urlOk(u) {
  try { const x = new URL(u), h = x.hostname;
    if (!/^https?:$/.test(x.protocol) || !h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /\.(local|internal)$/.test(h)) return null;
    return x; } catch { return null; }
}
async function pegar(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!/html|text/.test(r.headers.get('content-type') || '')) throw new Error('conteúdo não é HTML');
  return (await r.text()).slice(0, 500000);
}
async function robotsOk(origin) {
  try {
    const r = await fetch(origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return true;
    let todos = false, bloq = false;
    for (const l of (await r.text()).split(/\r?\n/)) {
      const m = l.match(/^\s*(user-agent|disallow)\s*:\s*(.*?)\s*$/i); if (!m) continue;
      if (m[1].toLowerCase() === 'user-agent') todos = m[2] === '*'; else if (todos && m[2] === '/') bloq = true;
    }
    return !bloq;
  } catch { return true; }
}
const nota = itens => {
  const tot = itens.reduce((a, i) => a + i[1], 0), ok = itens.filter(i => i[2] !== null);
  return { valor: Math.round(ok.reduce((a, i) => a + i[1] * i[2], 0) / tot), cobertura: Math.round(100 * ok.reduce((a, i) => a + i[1], 0) / tot),
    itens: itens.map(([nome, peso, valor, detalhe]) => ({ nome, peso, valor, detalhe })) };
};

export async function onRequestPost({ request }) {
  const { url } = await request.json().catch(() => ({}));
  const u = urlOk(url); if (!u) return J({ erro: 'URL inválida.' }, 400);
  const base = { url: u.origin, dominio: u.hostname.replace(/^www\./, '') };
  if (!(await robotsOk(u.origin))) return J({ ...base, bloqueado: true, avisos: ['O site pede (robots.txt) para não ser lido por robôs. Valide manualmente.'] });
  const fontes = [], avisos = []; let html;
  try { html = await pegar(u.origin + '/'); } catch (e) { return J({ ...base, falha: 'Não foi possível abrir o site: ' + e.message }); }
  fontes.push({ tipo: 'site da empresa', url: u.origin, data: hoje() });
  const link = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]).find(h => /contato|contact|quem-somos|sobre|fale-conosco/i.test(h));
  if (link) try { const cu = new URL(link, u.origin); if (cu.origin === u.origin) { html += ' ' + await pegar(cu.href); fontes.push({ tipo: 'site da empresa (contato)', url: cu.href, data: hoje() }); } } catch {}
  const d = extrair(html);
  let oficial = null; const num = (d.cnpjs[0] || '').replace(/[^0-9A-Z]/g, '');
  if (num) {
    const api = 'https://brasilapi.com.br/api/cnpj/v1/' + num;
    try { const r = await fetch(api, { signal: AbortSignal.timeout(8000) });
      if (r.ok) { const j = await r.json();
        oficial = { razao: j.razao_social, fantasia: j.nome_fantasia, situacao: j.descricao_situacao_cadastral, abertura: j.data_inicio_atividade, cnae: j.cnae_fiscal_descricao, cidade: j.municipio, uf: j.uf };
        fontes.push({ tipo: 'oficial: Receita Federal via BrasilAPI', url: api, data: hoje() }); }
      else avisos.push('Consulta do CNPJ não retornou dados (HTTP ' + r.status + ').');
    } catch { avisos.push('Consulta oficial do CNPJ indisponível agora.'); }
    if (d.cnpjs.length > 1) avisos.push(`O site cita ${d.cnpjs.length} CNPJs; foi consultado o primeiro.`);
  } else avisos.push('Nenhum CNPJ válido encontrado no site.');
  const anos = oficial?.abertura ? (Date.now() - new Date(oficial.abertura)) / 31557600000 : null, s = d.sinais;
  const sim = (c, det) => [c ? 100 : null, c ? det : 'não encontrado no site (não significa que não exista)'];
  const confiabilidade = nota([
    ['Regularidade cadastral', 25, oficial ? (/^ATIVA/i.test(oficial.situacao) ? 100 : 0) : null, oficial ? oficial.situacao : 'CNPJ não confirmado'],
    ['Reputação pública', 20, null, 'não verificada nesta versão: confira Reclame Aqui e Google'],
    ['Transparência comercial', 20, (d.cnpjs.length ? 40 : 0) + (d.emails.length ? 20 : 0) + (d.whatsapp.length || d.telefones.length ? 40 : 0), 'CNPJ, e-mail e telefone/WhatsApp visíveis no site'],
    ['Tempo de atividade', 15, anos == null ? null : anos < 1 ? 20 : anos < 3 ? 50 : anos < 5 ? 70 : 100, anos == null ? 'sem data oficial' : anos.toFixed(1) + ' anos desde a abertura'],
    ['Qualidade das fontes', 20, oficial ? 100 : 40, oficial ? 'site próprio + base oficial' : 'apenas o site próprio'] ]);
  const procedencia = nota([
    ['CNAE compatível com o produto', 35, oficial ? (/perfum|cosm|higiene|atacad|import|joia|bijut|rel[oó]gio/i.test(oficial.cnae) ? 100 : 30) : null, oficial ? oficial.cnae : 'sem CNPJ confirmado'],
    ['Menção a Anvisa/AFE', 25, ...sim(s.anvisa, 'site menciona regularização sanitária')],
    ['Nota fiscal', 20, ...sim(s.nota_fiscal, 'site menciona nota fiscal')],
    ['Distribuição autorizada pela marca', 20, null, 'peça a carta/comprovante ao fornecedor'] ]);
  const oportunidade = nota([
    ['Atuação no atacado', 25, ...sim(s.atacado, 'menciona atacado')], ['Pedido mínimo informado', 15, ...sim(s.pedido_minimo, 'informa pedido mínimo')],
    ['Nota fiscal', 15, ...sim(s.nota_fiscal, 'menciona nota fiscal')], ['Dropshipping', 15, ...sim(s.dropshipping, 'menciona dropshipping')],
    ['Catálogo ou tabela', 15, ...sim(s.catalogo, 'menciona catálogo/tabela')], ['Foco em revenda', 15, ...sim(s.revenda, 'fala com lojistas/revendedores')] ]);
  return J({ ...base, titulo: d.titulo, cnpj: d.cnpjs[0] || null, oficial, contatos: { emails: d.emails, whatsapp: d.whatsapp, telefones: d.telefones, instagram: d.instagram },
    sinais: s, notas: { confiabilidade, procedencia, oportunidade }, fontes, avisos });
}
