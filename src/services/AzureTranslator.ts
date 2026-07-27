import type {TranslationEntry} from "../constants/index.js";

export type TranslationResult = {
    translations: {
        text: string;
        to: string;
    }[];
};

export class AzureTranslator {
    private static readonly MAX_ITEMS_PER_REQUEST = 100;
    private static readonly MAX_CHARACTERS_PER_REQUEST = 50_000;
    private readonly targetLanguages: string[];

    constructor(targetLanguages: string[] = ["es"]) {
        this.targetLanguages = [...new Set(targetLanguages)];
    }

    get languages(): readonly string[] {
        return this.targetLanguages;
    }

    async translate(
        entries: TranslationEntry[],
        languages: readonly string[] = this.targetLanguages,
    ): Promise<TranslationResult[]> {
        if (entries.length === 0 || languages.length === 0) {
            return [];
        }

        const results: TranslationResult[] = [];

        for (const batch of this.createBatches(entries)) {
            results.push(...await this.translateBatch(batch, languages));
        }

        return results;
    }

    private async translateBatch(
        entries: TranslationEntry[],
        languages: readonly string[],
    ): Promise<TranslationResult[]> {
        const key = process.env.AZURE_TRANSLATOR_KEY;
        if (!key) {
            throw new Error("AZURE_TRANSLATOR_KEY is required");
        }

        const url = new URL(
            "https://api.cognitive.microsofttranslator.com/translate",
        );
        url.searchParams.set("api-version", "3.0");
        url.searchParams.set("from", "en");
        languages.forEach((language) => {
            url.searchParams.append("to", language);
        });

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": key,
        };

        const region = process.env.AZURE_TRANSLATOR_REGION;
        if (region) {
            headers["Ocp-Apim-Subscription-Region"] = region;
        }

        const response = await fetch(url, {
            body: JSON.stringify(
                entries.map((entry) => ({text: entry.text})),
            ),
            headers,
            method: "POST",
        });

        if (!response.ok) {
            throw new Error(
                `Translation API request failed with status ${response.status}`,
            );
        }

        return await response.json() as TranslationResult[];
    }

    private createBatches(
        entries: TranslationEntry[],
    ): TranslationEntry[][] {
        const batches: TranslationEntry[][] = [];
        let batch: TranslationEntry[] = [];
        let characterCount = 0;

        for (const entry of entries) {
            if (
                entry.text.length >
                AzureTranslator.MAX_CHARACTERS_PER_REQUEST
            ) {
                throw new Error(
                    "A translation value exceeds Azure's request limit",
                );
            }

            const batchIsFull =
                batch.length >= AzureTranslator.MAX_ITEMS_PER_REQUEST ||
                characterCount + entry.text.length >
                AzureTranslator.MAX_CHARACTERS_PER_REQUEST;

            if (batchIsFull) {
                batches.push(batch);
                batch = [];
                characterCount = 0;
            }

            batch.push(entry);
            characterCount += entry.text.length;
        }

        if (batch.length > 0) {
            batches.push(batch);
        }

        return batches;
    }
}