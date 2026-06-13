// api/chat.ts
export const config = {
    runtime: 'edge', // vercel edge runtime
};

export default async function handler(req: Request) {
    try {
        const { messages, systemPrompt } = await req.json();

        // Server side groq api key
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.VITE_GROQ_API_KEY}`, // server side groq api key
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                stream: true,
                max_tokens: 2048,
                temperature: 0.8,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(`Groq API Error: ${errorText}`, { status: response.status });
        }

        //pass the stream from Groq to frontend
        return new Response(response.body);
    } catch (err) {
        return new Response(err instanceof Error ? err.message : 'Internal Server Error', { status: 500 });
    }
}