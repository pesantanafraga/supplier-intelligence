// Adaptador: faz as funções da pasta functions/ rodarem em um Cloudflare Worker (endereço workers.dev).
import { onRequest as protegido } from '../functions/_middleware.js';
import { onRequestPost as pesquisar } from '../functions/api/search.js';
import { onRequestPost as investigar } from '../functions/api/inspect.js';

const rotas = { '/api/search': pesquisar, '/api/inspect': investigar };

export default {
  async fetch(request, env) {
    const rota = rotas[new URL(request.url).pathname];
    if (!rota) return env.ASSETS.fetch(request);
    if (request.method !== 'POST')
      return new Response(JSON.stringify({ erro: 'Use POST.' }), { status: 405, headers: { 'content-type': 'application/json' } });
    return protegido({ request, env, next: () => rota({ request, env }) });
  },
};
