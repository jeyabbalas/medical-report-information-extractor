import {OpenAI} from 'https://cdn.skypack.dev/openai@4.78.1?min';


const manageOpenAiApiKey = {
    async validateApiKey(baseUrl, apiKey) {
        try {
            const openai = new OpenAI({
                baseURL: baseUrl,
                apiKey: apiKey,
                dangerouslyAllowBrowser: true
            });
            await openai.models.list();
            return true;
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.error('Invalid API key:', error);
                return false;
            } else {
                console.error('Error checking API key:', error);
                return false;
            }
        }
    },

    setKey(apiKey) {
        localStorage.OPENAI_API_KEY = apiKey;
    },

    getKey() {
        return localStorage.OPENAI_API_KEY;
    },

    deleteKey() {
        delete localStorage.OPENAI_API_KEY;
    }
};


export { manageOpenAiApiKey };