export type CommStyle = 'formal' | 'coloquial' | 'tecnico';

export interface CommStyleResult {
  style: CommStyle;
  confidence: number;
}

const INFORMAL_TOKENS = new Set([
  'vc', 'blz', 'pq', 'mn', 'td', 'tb', 'kk', 'haha', 'kkk',
  'tmj', 'vlw', 'flw', 'mds', 'pfv', 'obg', 'slk', 'plmdds',
  'cmg', 'oq', 'dps', 'ngc', 'ndp', 'qnd', 'msm', 'mto',
]);

const TECH_TOKENS = new Set([
  'pppoe', 'onu', 'latência', 'latencia', 'ip fixo', 'dns',
  'roteador', 'bridge', 'ssid', 'wan', 'lan', 'fibra',
  'throughput', 'downstream', 'upstream', 'firmware', 'ping',
  'traceroute', 'nat', 'vlan', 'ipv6', 'snmp', 'mikrotik',
  'ubiquiti', 'olt', 'splitter', 'cto', 'dbm', 'atenuação',
]);

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

export function inferCommStyle(messages: string[]): CommStyleResult {
  if (messages.length < 10) {
    return { style: 'formal', confidence: 0 };
  }

  const joined = messages.join(' ').toLowerCase();
  const words = joined.split(/\s+/);
  const totalWords = words.length || 1;

  let informalScore = 0;
  let techScore = 0;

  for (const w of words) {
    if (INFORMAL_TOKENS.has(w)) informalScore++;
    if (TECH_TOKENS.has(w)) techScore++;
  }

  const emojiCount = (joined.match(EMOJI_RE) || []).length;
  informalScore += emojiCount;

  const informalRatio = informalScore / totalWords;
  const techRatio = techScore / totalWords;

  if (techRatio > 0.02 && techRatio > informalRatio) {
    const confidence = Math.min(1, techRatio * 20);
    return { style: 'tecnico', confidence: Math.round(confidence * 100) / 100 };
  }

  if (informalRatio > 0.03) {
    const confidence = Math.min(1, informalRatio * 15);
    return { style: 'coloquial', confidence: Math.round(confidence * 100) / 100 };
  }

  return { style: 'formal', confidence: 0.6 };
}

export const STYLE_SUFFIXES: Record<CommStyle, string> = {
  coloquial: 'Tom da conversa: o cliente se comunica de forma informal; seja leve, use frases curtas, evite jargão.',
  tecnico: 'Tom da conversa: o cliente se comunica de forma técnica; pode usar termos de rede com precisão.',
  formal: 'Tom da conversa: o cliente se comunica de forma formal; trate por senhor/senhora e evite gírias.',
};
