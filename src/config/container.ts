import {AzureTranslator} from "../services/AzureTranslator.js";
import {TranslationFileLoader} from "../services/LocaleFileLoader.js";
import {Translator} from "../services/Translator.js";

const azureTranslator = new AzureTranslator(['es','fr']);
const translationFileLoader = new TranslationFileLoader()
const translator = new Translator(azureTranslator)

export const container ={
    azureTranslator,
    translationFileLoader,
    translator
}