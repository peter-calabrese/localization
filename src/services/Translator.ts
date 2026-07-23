import type {TranslationEntry} from "../constants/index.js";
import type {TranslationFile} from "./LocaleFileLoader.js";
import {AzureTranslator} from "./AzureTranslator.js";
import * as fs from "node:fs";
import path from "node:path";

export class Translator {

    constructor(private readonly azureTranslator: AzureTranslator) {
    }

    async translate(locales: TranslationFile[]) {
       for (const { namespace, data } of locales) {

            const flatten = this.flattener(data)

            const res = await this.azureTranslator.translate(flatten)

            const translations = res.reduce<Record<string, string[]>>(
                (translationByLanguage, result) => {
                    for (const translation of result.translations) {
                        translationByLanguage[translation.to] ??= [];
                        translationByLanguage[translation.to]!.push(translation.text);
                    }
                    return translationByLanguage;
                },
                {},
            );


            const rebuilt = this.rebuild(translations, flatten);
            rebuilt.map(({result,translatedLanguage})=>{
                const outputPath = `src/locales/${translatedLanguage}/${namespace}.json`;
                fs.mkdirSync(path.dirname(outputPath), {
                    recursive: true,
                });
                fs.writeFileSync(
                    outputPath,
                    JSON.stringify(result, null, 2),
                    "utf8",
                );
            });
        }
    }

    private rebuild(translations: Record<string, string[]>, flattened: TranslationEntry[]) {
        return Object.entries(translations).map(([translatedLanguage, translations]) => {
            if (!translations) {
                throw new Error(`No translations found for language: ${translatedLanguage}`);
            }
            const result= translations.reduce<Record<string, unknown>>(
                (result, translatedText, index) => {
                    const originalPath = flattened[index]?.path || [];

                    let current = result;
                    for (const key of originalPath.slice(0, -1)) {
                        current[key] ??= {};
                        current = current[key] as Record<string, unknown>;
                    }
                    current[originalPath.at(-1)!] = translatedText;

                    return result;
                },
                {},
            )

            return {result, translatedLanguage};
        })
    }

    private flattener(value: unknown, path: string[] = []): TranslationEntry[] {
        if (typeof value === "string") {
            return [{path, text: value}];
        }

        if (value !== null && typeof value === "object") {
            return Object.entries(value).flatMap(([key, nestedValue]) =>
                this.flattener(nestedValue, [...path, key]),
            );
        }

        return [];
    }
}