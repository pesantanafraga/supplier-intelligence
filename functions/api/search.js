// Etapa 1: expande a busca em várias consultas e descobre empresas reais (Tavily).
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const BLOQ = /(mercadolivre|mercadolibre|shopee|amazon|aliexpress|instagram|facebook|youtube|tiktok|olx|wikipedia|pinterest|linkedin|kwai|shein|magazineluiza|americanas|casasbahia|reclameaqui|twitter|x\.com|whatsapp|google|alibaba|temu)\./i;
const MODS = ['distribuidor atacado', 'importadora', 'fornecedor para revenda lojistas', 'atacado site oficial CNPJ'];

async function tavily(key, query) {
  const body = { query, max_results: 10, search_depth: 'basic', country: 'brazil' };
  const chamar = () => fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  let r = await chamar();
  if (r.status === 400) { delete body.country; r = await chamar(); }
  if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
  return (await r.json()).results || [];
}

export async function onRequestPost({ request, env }) {
  const { q = '', regiao = '' } = await request.json().catch(() => ({}));
  if (q.trim().length < 3 || q.length > 200) return J({ erro: 'Descreva o produto (3 a 200 caracteres).' }, 400);
  if (!env.TAVILY_API_KEY) return J({ erro: 'TAVILY_API_KEY não configurada no Cloudflare.' }, 500);
  const consultas = MODS.map(m => `${q.trim()} ${m} ${regiao}`.replace(/\s+/g, ' ').trim());
  const res = await Promise.allSettled(consultas.map(c => tavily(env.TAVILY_API_KEY, c)));
  const avisos = [], mapa = new Map(), manuais = [];
  res.forEach((r, i) => {
    if (r.status === 'rejected') return avisos.push(`Consulta "${consultas[i]}" falhou: ${r.reason.message}`);
    for (const x of r.value) {
      let u; try { u = new URL(x.url); } catch { continue; }
      const dom = u.hostname.replace(/^www\./, '');
      if (BLOQ.test(dom + '.')) { if (!manuais.some(m => m.url === x.url)) manuais.push({ url: x.url, titulo: x.title }); continue; }
      const e = mapa.get(dom) || { dominio: dom, url: u.origin, titulo: x.title, trecho: (x.content || '').slice(0, 200), fonteBusca: x.url, termos: [] };
      if (!e.termos.includes(consultas[i])) e.termos.push(consultas[i]);
      mapa.set(dom, e);
    }
  });
  const empresas = [...mapa.values()].sort((a, b) => b.termos.length - a.termos.length);
  if (!empresas.length) avisos.push('Nenhuma empresa encontrada. Tente outros termos; nada foi inventado.');
  return J({ consultas, empresas, manuais: manuais.slice(0, 10), avisos, data: new Date().toISOString().slice(0, 10) });
}
