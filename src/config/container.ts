import {AzureTranslator} from "../services/AzureTranslator.js";
import {TranslationFileLoader} from "../services/LocaleFileLoader.js";
import {Translator} from "../services/Translator.js";
import path from "node:path";

export function createContainer(
    configuredLocalesRoot = process.env.LOCALES_ROOT ?? "src/locales",
) {
    const localesRoot = path.resolve(configuredLocalesRoot);
    const sourceRoot = path.join(localesRoot, "en");
    const azureTranslator = new AzureTranslator(["es", "fr"]);
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
