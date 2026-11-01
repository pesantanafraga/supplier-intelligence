// Protege /api/* com uma senha simples (variável APP_PASSWORD), para ninguém gastar sua cota de busca.
export async function onRequest({ request, env, next }) {
  if (!new URL(request.url).pathname.startsWith('/api/')) return next();
  if (!env.APP_PASSWORD || request.headers.get('x-app-pass') !== env.APP_PASSWORD)
    return new Response(JSON.stringify({ erro: 'Senha incorreta ou APP_PASSWORD não configurada.' }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  return next();
}
