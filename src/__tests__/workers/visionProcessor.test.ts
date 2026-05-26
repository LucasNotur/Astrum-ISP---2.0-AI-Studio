import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processVisionMessage } from '../../workers/visionProcessor';
import redisClient from '../../lib/redis';

vi.mock('../../lib/redis', () => ({
    default: {
        incrbyfloat: vi.fn()
    }
}));

describe('Vision Processor Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        process.env.OPENAI_API_KEY = 'test_key';
    });

    it('1. imageMessage com vision_enabled=true → chama Vision API e injeta imageContext no system prompt', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Equipamento identificável: Modem XYZ. LEDs: Aceso' } }],
                usage: { total_tokens: 150 }
            })
        } as any);

        const result = await processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', true);
        
        expect(fetchSpy).toHaveBeenCalled();
        expect(result.systemPromptExtension).toBe('Equipamento identificável: Modem XYZ. LEDs: Aceso');
    });

    it('2. imageMessage com vision_enabled=false → processa sem Vision API, responde normalmente', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        
        const result = await processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', false);
        
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.systemPromptExtension).toBeNull();
    });

    it('3. Vision API retorna 500 → processa sem imageContext (degradação graciosa, não 500)', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 500
        } as any);

        const result = await processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', true);
        
        expect(fetchSpy).toHaveBeenCalled();
        expect(result.systemPromptExtension).toBeNull(); 
    });

    it('4. Vision API com timeout → não trava o worker (máximo 10s de espera)', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts: any) => {
            return new Promise((_, reject) => {
                opts.signal.addEventListener('abort', () => reject(new Error('AbortError')));
            });
        });

        vi.useFakeTimers();
        
        const promise = processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', true);
        
        vi.advanceTimersByTime(10000);
        
        const result = await promise;
        
        expect(result.systemPromptExtension).toBeNull();
        
        vi.useRealTimers();
    });

    it('5. imageContext gerado → contém identificação do equipamento e estado dos LEDs', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Identificação: Modem ABC. Estado dos LEDs: Power ON, PON piscando.' } }],
                usage: { total_tokens: 200 }
            })
        } as any);

        const result = await processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', true);
        
        expect(result.systemPromptExtension).toContain('Modem ABC');
        expect(result.systemPromptExtension).toContain('LEDs');
    });

    it('6. image.url vazia → pula Vision sem lançar erro', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');

        const result = await processVisionMessage({ url: '' }, 'tenant1', true);
        
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.systemPromptExtension).toBeNull();
    });

    it('7. Custo da Vision → registrado em Redis token_cost:{tenantId}:{YYYY-MM}', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Ok' } }],
                usage: { total_tokens: 100 }
            })
        } as any);

        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));

        await processVisionMessage({ url: 'http://img.com/a.jpg' }, 'tenant1', true);
        
        expect(redisClient!.incrbyfloat).toHaveBeenCalledWith('token_cost:tenant1:2026-05', expect.any(Number));
        
        vi.useRealTimers();
    });
});
