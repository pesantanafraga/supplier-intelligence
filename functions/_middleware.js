// Protege /api/* com uma senha simples (variável APP_PASSWORD), para ninguém gastar sua cota de busca.
const J = (erro, s) => new Response(JSON.stringify({ erro }), { status: s, headers: { 'content-type': 'application/json' } });
export async function onRequest({ request, env, next }) {
  if (!new URL(request.url).pathname.startsWith('/api/')) return next();
  if (!env.APP_PASSWORD) return J('APP_PASSWORD não chegou ao servidor: ela não está configurada como variável de execução deste Worker.', 401);
  if (request.headers.get('x-app-pass') !== env.APP_PASSWORD.trim())
    return J('Senha digitada não confere com a APP_PASSWORD (confira maiúsculas e espaços).', 401);
  return next();
}
