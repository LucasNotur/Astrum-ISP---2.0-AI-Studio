export function sanitizeUserInput(text: string, tenantId?: string): { safe: boolean; sanitized: string; reason?: string } {
  if (!text) return { safe: true, sanitized: "" };

  // Limit to 2000 characters
  let sanitized = text.substring(0, 2000);

  // Remove control characters (except newline, carriage return, and tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  const jailbreakPatterns = [
    /ignore\s+instru[çc][õo]es/i,
    /esque[çc]a\s+tudo/i,
    /novo\s+papel/i,
    /voc[êe]\s+agora\s+[ée]/i,
    /ignore\s+previous/i,
    /ignore\s+todas\s+as\s+instru[çc][õo]es/i,
    /desconsidere\s+as\s+instru[çc][õo]es/i,
    /modo\s+desenvolvedor/i,
    /developer\s+mode/i,
    /dan\s+mode/i,
    /do\s+anything\s+now/i,
    /esque[çc]a\s+as\s+regras/i,
    /ignore\s+rules/i,
    /bypass\s+rules/i,
    /nova\s+diretriz/i,
    /sistema\s+informando:/i,
    /system\s+override/i,
    /voc[êe]\s+n[ãa]o\s+[ée]\s+mais/i,
    /finja\s+que/i,
    /aja\s+como\s+se/i,
  ];

  for (const pattern of jailbreakPatterns) {
    if (pattern.test(sanitized)) {
      return {
        safe: false,
        sanitized: sanitized,
        reason: "Padrão de jailbreak detectado",
      };
    }
  }

  return { safe: true, sanitized };
}
