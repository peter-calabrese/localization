type TranslationEntry = {
    text: string;
};

type TranslationResult = {
    translations: {
        text: string;
        to: string;
    }[];
};

export class AzureTranslator {
    private languages: string[];

    constructor(languages: string[] = ['es']) {
        this.languages = languages;
    }

    async translate(text: TranslationEntry[]) {
        const response = await fetch(
            "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en" +
            this.languages.map((lang) => `&to=${lang}`).join(""),
            {
                body: JSON.stringify(text.map((entry) => ({text: entry.text}))),
                headers: {
                    "Content-Type": "application/json",
                    "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY || "",
                    "Ocp-Apim-Subscription-Region": process.env.AZURE_TRANSLATOR_REGION || "",
                },
                method: "POST",
            },
        );
        if (!response.ok) {
            throw new Error(
                `Translation API request failed with status ${response.status}`,
            );
        }
        return (await response.json()) as TranslationResult[];

    }
}