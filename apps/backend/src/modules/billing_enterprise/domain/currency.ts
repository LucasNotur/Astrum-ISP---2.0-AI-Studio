export class CurrencyHelper {
  /**
   * Converte reais para centavos (inteiros) a fim de evitar problemas de precisão de ponto flutuante.
   */
  static toCents(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Converte centavos de volta para reais (float).
   */
  static toFloat(cents: number): number {
    return cents / 100;
  }
}
