const keys = ['SUPABASE_URL', 'FASTIFY_PORT', 'PORT', 'NODE_ENV'];
for (const k of keys) {
  console.log(k + ': ' + (process.env[k] ? ('Present (' + process.env[k] + ')') : 'MISSING'));
}
