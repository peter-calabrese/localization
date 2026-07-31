import type {TranslationEntry} from "../constants/index.js";
import type {
    JsonValue,
    TranslationFile,
} from "./LocaleFileLoader.js";
import {AzureTranslator} from "./AzureTranslator.js";
import {JsonFileCacheStore} from "./JsonFileCacheStore.js";
import {TranslationCache} from "./TranslationCache.js";
import {
    mkdir,
    readFile,
    writeFile,
} from "node:fs/promises";
import path from "node:path";

export class Translator {
    constructor(
        private readonly azureTranslator: AzureTranslator,
        private readonly cache = new TranslationCache(
            new JsonFileCacheStore(),
        ),
        private readonly localesRoot = path.resolve("src/locales"),
    ) {}

    async translate(locales: TranslationFile[]): Promise<string[]> {
        await this.cache.load();
        const translatedPaths = new Set<string>();

        for (const {namespace, data} of locales) {
            const flattened = this.flattener(data);

            for (const language of this.azureTranslator.languages) {
                this.validateLanguage(language);

                const outputPath = this.outputPath(language, namespace);
                const existing = await this.readJsonIfExists(outputPath);
                let output = this.copyExistingTranslations(
                    data,
                    existing,
                    flattened,
                );

                const entriesToTranslate = flattened.filter((entry) => {
                    const existingTranslation = existing === undefined
                        ? undefined
                        : this.getAtPath(existing, entry.path);

                    if (typeof existingTranslation !== "string") {
                        return true;
                    }

                    return this.cache.languagesToTranslate(
                        namespace,
                        entry,
                        [language],
                    ).length > 0;
                });

                if (entriesToTranslate.length > 0) {
                    const response = await this.azureTranslator.translate(
                        entriesToTranslate,
                        [language],
                    );

                    if (response.length !== entriesToTranslate.length) {
                        throw new Error(
                            "Azure returned an unexpected number of translations",
                        );
                    }

                    response.forEach((result, index) => {
                        const translated = result.translations.find(
                            (translation) =>
                                translation.to.toLowerCase() ===
                                language.toLowerCase(),
                        );

                        if (!translated) {
                            throw new Error(
                                `No translation returned for ${language}`,
                            );
                        }

                        output = this.setAtPath(
                            output,
                            entriesToTranslate[index]!.path,
                            translated.text,
                        );
                    });
                }

                await mkdir(path.dirname(outputPath), {recursive: true});
                await writeFile(
                    outputPath,
                    `${JSON.stringify(output, null, 2)}\n`,
                    "utf8",
                );
                translatedPaths.add(
                    path.relative(process.cwd(), outputPath)
                        .split(path.sep)
                        .join("/"),
                );

                entriesToTranslate.forEach((entry) => {
                    this.cache.markTranslated(
                        namespace,
                        entry,
                        language,
                    );
                });
            }

            this.cache.removeMissingKeys(namespace, flattened);
            await this.cache.save();
        }

        return [...translatedPaths].sort();
    }

    private copyExistingTranslations(
        source: JsonValue,
        existing: JsonValue | undefined,
        flattened: TranslationEntry[],
    ): JsonValue {
        let result = structuredClone(source);

        if (existing === undefined) {
            return result;
        }

        for (const entry of flattened) {
            const currentTranslation = this.getAtPath(
                existing,
                entry.path,
            );

            if (typeof currentTranslation === "string") {
                result = this.setAtPath(
                    result,
                    entry.path,
                    currentTranslation,
                );
            }
        }

        return result;
    }

    private getAtPath(
        value: JsonValue,
        translationPath: string[],
    ): unknown {
        let current: unknown = value;

        for (const key of translationPath) {
            if (
                current === null ||
                typeof current !== "object" ||
                !(key in current)
            ) {
                return undefined;
            }

            current = (current as Record<string, unknown>)[key];
        }

        return current;
    }

    private setAtPath(
        value: JsonValue,
        translationPath: string[],
        translatedText: string,
    ): JsonValue {
        if (translationPath.length === 0) {
            return translatedText;
        }

        let current = value as Record<string, unknown>;
        for (const key of translationPath.slice(0, -1)) {
            current = current[key] as Record<string, unknown>;
        }

        current[translationPath.at(-1)!] = translatedText;
        return value;
    }

    private async readJsonIfExists(
        filePath: string,
    ): Promise<JsonValue | undefined> {
        try {
            const contents = await readFile(filePath, "utf8");
            return JSON.parse(contents) as JsonValue;
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return undefined;
            }

            throw error;
        }
    }

    private outputPath(
        language: string,
        namespace: string,
    ): string {
        const languageRoot = path.resolve(this.localesRoot, language);
        const outputPath = path.resolve(
            languageRoot,
            `${namespace}.json`,
        );
        const relativePath = path.relative(languageRoot, outputPath);

        if (
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw new Error(`Invalid translation namespace: ${namespace}`);
        }

        return outputPath;
    }

    private validateLanguage(language: string): void {
        if (!/^[A-Za-z0-9-]+$/.test(language)) {
            throw new Error(`Invalid target language: ${language}`);
        }
    }

    private flattener(
        value: unknown,
        translationPath: string[] = [],
    ): TranslationEntry[] {
        if (typeof value === "string") {
            return [{path: translationPath, text: value}];
        }

        if (value !== null && typeof value === "object") {
            return Object.entries(value).flatMap(([key, nestedValue]) =>
                this.flattener(
                    nestedValue,
                    [...translationPath, key],
                ),
            );
        }

        return [];
    }
}
