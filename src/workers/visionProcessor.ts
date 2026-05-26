import redisClient from '../lib/redis';

export interface ImageMessage {
    url?: string;
    text?: string;
}

export async function processVisionMessage(
    imageMessage: ImageMessage,
    tenantId: string,
    visionEnabled: boolean
): Promise<{ systemPromptExtension: string | null, textContent: string }> {
    const textContent = imageMessage.text || '';
    
    if (!visionEnabled || !imageMessage.url) {
        return { systemPromptExtension: null, textContent };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4-vision-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Analyze this equipment image. Identify the equipment and the state of its LEDs.' },
                            { type: 'image_url', image_url: { url: imageMessage.url } }
                        ]
                    }
                ],
                max_tokens: 300
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            return { systemPromptExtension: null, textContent };
        }

        const data = await response.json();
        
        const content = data.choices?.[0]?.message?.content;
        const tokens = data.usage?.total_tokens || 0;
        const cost = tokens * 0.01;

        if (redisClient) {
            const date = new Date();
            const yyyyMm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            await redisClient.incrbyfloat(`token_cost:${tenantId}:${yyyyMm}`, cost);
        }

        return { systemPromptExtension: content, textContent };

    } catch (e: any) {
        return { systemPromptExtension: null, textContent };
    }
}
