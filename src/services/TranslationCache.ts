import { TranslationEntry } from "../constants/index.js";

export interface TranslationCacheEntry {
    source: string;
    languages: string[];
}

export type TranslationCacheData = Record<
    string,
    Record<string, TranslationCacheEntry>
>;

export interface TranslationCacheStore {
    load(): Promise<TranslationCacheData>;
    save(data: TranslationCacheData): Promise<void>;
}

export class TranslationCache {
    private data: TranslationCacheData = {};
    private loaded = false;

    constructor(private readonly store: TranslationCacheStore) { }

    async load(): Promise<void> {
        this.data = await this.store.load();
        this.loaded = true;
    }

    async save(): Promise<void> {
        this.assertLoaded();
        await this.store.save(this.data);
    }

    languagesToTranslate(
        namespace: string,
        entry: TranslationEntry,
        requestedLanguages: readonly string[]
    ) {
        this.assertLoaded();

        const cached = this.data[namespace]?.[
            this.toCacheKey(entry.path)
        ]
        const languages = [...new Set(requestedLanguages)];

        if (!cached || cached.source !== entry.text) {
            return languages;
        }

        return languages.filter((language) => !cached.languages.includes(language))
    }

    markTranslated(
        namespace: string,
        entry: TranslationEntry,
        language: string,
    ): void {
        this.assertLoaded();

        this.data[namespace] ??= {};
        const key = this.toCacheKey(entry.path);
        const cached = this.data[namespace]![key];

        if (!cached || cached.source !== entry.text) {
            this.data[namespace]![key] = {
                source: entry.text,
                languages: [language],
            };
            return;
        }

        if (!cached.languages.includes(language)) {
            cached.languages.push(language);
        }
    }

    removeMissingKeys(
        namespace: string,
        currentEntries: TranslationEntry[],
    ): void {
        this.assertLoaded();

        const namespaceCache = this.data[namespace];
        if (!namespaceCache) {
            return;
        }

        const currentKeys = new Set(
            currentEntries.map((entry) => this.toCacheKey(entry.path)),
        );

        for (const key of Object.keys(namespaceCache)) {
            if (!currentKeys.has(key)) {
                delete namespaceCache[key];
            }
        }

        if (Object.keys(namespaceCache).length === 0) {
            delete this.data[namespace];
        }
    }


    private toCacheKey(path: string[]) {
        if (path.length === 0) return "$"

        return path.map((part) => part.replaceAll("\\", "\\\\").replaceAll(".", "\\.")).join(".")

    }

    private assertLoaded(): void {
        if (!this.loaded) throw new Error("Cache Not Loaded!")
    }
}