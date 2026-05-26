export const facebookClient = {
    async sendMessage(recipientId: string, text: string, pageAccessToken: string) {
        if (!pageAccessToken) {
            throw new Error('page_access_token omitted or invalid');
        }

        const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: { text }
                })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                // Ensure we don't leak the token in errors
                const safeUrl = url.split('?')[0] + '?access_token=***';
                throw new Error(`Facebook API error at ${safeUrl}: ${response.status} ${JSON.stringify(data)}`);
            }

            return await response.json();
        } catch (error: any) {
            if (error.message.includes(pageAccessToken)) {
                 throw new Error(error.message.replace(pageAccessToken, '***'));
            }
            throw error;
        }
    }
};
