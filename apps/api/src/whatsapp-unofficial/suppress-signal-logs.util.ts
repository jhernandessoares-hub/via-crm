// `libsignal` (dependência do Baileys) faz `console.info`/`console.warn` DIRETO em
// alguns pontos de `session_record.js`, dumpando o objeto de sessão inteiro — que
// carrega material criptográfico (privKey, chainKey, rootKey em Buffer) — para o
// stdout. Isso ignora completamente o `pino({ level: 'silent' })` que passamos pro
// Baileys (esse console.* não passa pelo logger configurado) e vazava chaves
// privadas do protocolo Signal pros logs de produção do Railway.
//
// Não dá pra configurar isso via API do Baileys/libsignal — as chamadas são
// hardcoded na lib. Em vez de fazer patch em node_modules (que não sobrevive a um
// `npm install` sem infra extra tipo patch-package), interceptamos aqui pelo
// prefixo exato da mensagem: só essas strings específicas (usadas somente nesses
// pontos da libsignal) são descartadas: o resto do console.info/warn do processo
// passa normalmente.
const SENSITIVE_LIBSIGNAL_PREFIXES = [
  'Closing session:',
  'Opening session:',
  'Session already closed',
  'Session already open',
  'Removing old closed session:',
];

let patched = false;

export function suppressLibsignalSecretLogs() {
  if (patched) return;
  patched = true;

  for (const method of ['info', 'warn'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string' && SENSITIVE_LIBSIGNAL_PREFIXES.some((p) => first.startsWith(p))) {
        return; // descarta — o próprio 1º argumento já indica que o resto tem chaves privadas
      }
      original(...args);
    };
  }
}
