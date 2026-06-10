import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

// AWS Region එක us-east-1 (N. Virginia) වලටම තියමු
const client = new BedrockRuntimeClient({ region: "us-east-1" });

async function askClaude() {
    const prompt = "Hello Claude! Can you confirm you are working?";

    // Converse API එකට අවශ්‍ය සරල Messages Structure එක
    const conversation = [
        {
            role: "user",
            content: [{ text: prompt }]
        }
    ];

    try {
        // InvokeModelCommand වෙනුවට අලුත්ම ConverseCommand එක පාවිච්චි කරනවා
        const command = new ConverseCommand({
            modelId: "anthropic.claude-3-5-sonnet-20241022-v3:0",
            messages: conversation,
            inferenceConfig: {
                maxTokens: 1000,
                temperature: 0.5
            }
        });

        console.log("Sending request using Bedrock Converse API...");
        const response = await client.send(command);
        
        // ලැබෙන Response එක Converse API එකේදී JSON parse කරන්න ඕනෙ නෑ, කෙලින්ම ගන්න පුළුවන්
        console.log("\n--- Claude's Response ---");
        console.log(response.output.message.content[0].text);

    } catch (error) {
        console.error("Error calling Bedrock Converse API:", error);
    }
}

askClaude();