import {AzureTranslator} from "../services/AzureTranslator.js";
import {TranslationFileLoader} from "../services/LocaleFileLoader.js";
import {Translator} from "../services/Translator.js";
import path from "node:path";

export function createContainer(
    configuredLocalesRoot = process.env.LOCALES_ROOT ?? "src/locales",
    targetLanguages: string[] = ["es", "fr"],
) {
    const localesRoot = path.resolve(configuredLocalesRoot);
    const sourceRoot = path.join(localesRoot, "en");
    const azureTranslator = new AzureTranslator(targetLanguages);
    const translationFileLoader = new TranslationFileLoader(sourceRoot);
    const translator = new Translator(
        azureTranslator,
        undefined,
        localesRoot,
    );

    return {
        azureTranslator,
        translationFileLoader,
        translator,
    };
}
