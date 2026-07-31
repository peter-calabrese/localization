import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as core from "@actions/core";
//#region src/services/AzureTranslator.ts
var AzureTranslator = class AzureTranslator {
	static MAX_ITEMS_PER_REQUEST = 100;
	static MAX_CHARACTERS_PER_REQUEST = 5e4;
	targetLanguages;
	constructor(targetLanguages = ["es"]) {
		this.targetLanguages = [...new Set(targetLanguages)];
	}
	get languages() {
		return this.targetLanguages;
	}
	async translate(entries, languages = this.targetLanguages) {
		if (entries.length === 0 || languages.length === 0) return [];
		const results = [];
		for (const batch of this.createBatches(entries)) results.push(...await this.translateBatch(batch, languages));
		return results;
	}
	async translateBatch(entries, languages) {
		const key = process.env.AZURE_TRANSLATOR_KEY;
		if (!key) throw new Error("AZURE_TRANSLATOR_KEY is required");
		const url = new URL("https://api.cognitive.microsofttranslator.com/translate");
		url.searchParams.set("api-version", "3.0");
		url.searchParams.set("from", "en");
		languages.forEach((language) => {
			url.searchParams.append("to", language);
		});
		const headers = {
			"Content-Type": "application/json",
			"Ocp-Apim-Subscription-Key": key
		};
		const region = process.env.AZURE_TRANSLATOR_REGION;
		if (region) headers["Ocp-Apim-Subscription-Region"] = region;
		const response = await fetch(url, {
			body: JSON.stringify(entries.map((entry) => ({ text: entry.text }))),
			headers,
			method: "POST"
		});
		if (!response.ok) throw new Error(`Translation API request failed with status ${response.status}`);
		return await response.json();
	}
	createBatches(entries) {
		const batches = [];
		let batch = [];
		let characterCount = 0;
		for (const entry of entries) {
			if (entry.text.length > AzureTranslator.MAX_CHARACTERS_PER_REQUEST) throw new Error("A translation value exceeds Azure's request limit");
			if (batch.length >= AzureTranslator.MAX_ITEMS_PER_REQUEST || characterCount + entry.text.length > AzureTranslator.MAX_CHARACTERS_PER_REQUEST) {
				batches.push(batch);
				batch = [];
				characterCount = 0;
			}
			batch.push(entry);
			characterCount += entry.text.length;
		}
		if (batch.length > 0) batches.push(batch);
		return batches;
	}
};
//#endregion
//#region src/services/LocaleFileLoader.ts
var TranslationFileLoader = class {
	sourceRoot;
	constructor(sourceRoot = "src/locales/en") {
		this.sourceRoot = path.resolve(sourceRoot);
	}
	async load(filePath) {
		const absoluteFilePath = path.resolve(filePath);
		const relativePath = path.relative(this.sourceRoot, absoluteFilePath);
		if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) throw new Error(`Translation file must be inside ${this.sourceRoot}`);
		if (!relativePath.endsWith(".json")) throw new Error("Translation file must be a JSON file");
		const rawFile = await readFile(absoluteFilePath, "utf8");
		return {
			namespace: relativePath.replace(/\.json$/, "").split(path.sep).join("/"),
			data: JSON.parse(rawFile)
		};
	}
	async loadMany(filePaths) {
		return Promise.all(filePaths.map((filePath) => this.load(filePath)));
	}
};
//#endregion
//#region src/services/JsonFileCacheStore.ts
var JsonFileCacheStore = class {
	cachePath;
	constructor(cachePath = ".translation-cache/cache.json") {
		this.cachePath = path.resolve(cachePath);
	}
	async load() {
		try {
			const contents = await readFile(this.cachePath, "utf8");
			return JSON.parse(contents);
		} catch (error) {
			if (this.isFileNotFound(error)) return {};
			throw error;
		}
	}
	async save(data) {
		await mkdir(path.dirname(this.cachePath), { recursive: true });
		const temporaryPath = `${this.cachePath}.${process.pid}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
		await rename(temporaryPath, this.cachePath);
	}
	isFileNotFound(error) {
		return error instanceof Error && "code" in error && error.code === "ENOENT";
	}
};
//#endregion
//#region src/services/TranslationCache.ts
var TranslationCache = class {
	store;
	data = {};
	loaded = false;
	constructor(store) {
		this.store = store;
	}
	async load() {
		this.data = await this.store.load();
		this.loaded = true;
	}
	async save() {
		this.assertLoaded();
		await this.store.save(this.data);
	}
	languagesToTranslate(namespace, entry, requestedLanguages) {
		this.assertLoaded();
		const cached = this.data[namespace]?.[this.toCacheKey(entry.path)];
		const languages = [...new Set(requestedLanguages)];
		if (!cached || cached.source !== entry.text) return languages;
		return languages.filter((language) => !cached.languages.includes(language));
	}
	markTranslated(namespace, entry, language) {
		this.assertLoaded();
		this.data[namespace] ??= {};
		const key = this.toCacheKey(entry.path);
		const cached = this.data[namespace][key];
		if (!cached || cached.source !== entry.text) {
			this.data[namespace][key] = {
				source: entry.text,
				languages: [language]
			};
			return;
		}
		if (!cached.languages.includes(language)) cached.languages.push(language);
	}
	removeMissingKeys(namespace, currentEntries) {
		this.assertLoaded();
		const namespaceCache = this.data[namespace];
		if (!namespaceCache) return;
		const currentKeys = new Set(currentEntries.map((entry) => this.toCacheKey(entry.path)));
		for (const key of Object.keys(namespaceCache)) if (!currentKeys.has(key)) delete namespaceCache[key];
		if (Object.keys(namespaceCache).length === 0) delete this.data[namespace];
	}
	toCacheKey(path) {
		if (path.length === 0) return "$";
		return path.map((part) => part.replaceAll("\\", "\\\\").replaceAll(".", "\\.")).join(".");
	}
	assertLoaded() {
		if (!this.loaded) throw new Error("Cache Not Loaded!");
	}
};
//#endregion
//#region src/services/Translator.ts
var Translator = class {
	azureTranslator;
	cache;
	localesRoot;
	constructor(azureTranslator, cache = new TranslationCache(new JsonFileCacheStore()), localesRoot = path.resolve("src/locales")) {
		this.azureTranslator = azureTranslator;
		this.cache = cache;
		this.localesRoot = localesRoot;
	}
	async translate(locales) {
		await this.cache.load();
		for (const { namespace, data } of locales) {
			const flattened = this.flattener(data);
			for (const language of this.azureTranslator.languages) {
				this.validateLanguage(language);
				const outputPath = this.outputPath(language, namespace);
				const existing = await this.readJsonIfExists(outputPath);
				let output = this.copyExistingTranslations(data, existing, flattened);
				const entriesToTranslate = flattened.filter((entry) => {
					if (typeof (existing === void 0 ? void 0 : this.getAtPath(existing, entry.path)) !== "string") return true;
					return this.cache.languagesToTranslate(namespace, entry, [language]).length > 0;
				});
				if (entriesToTranslate.length > 0) {
					const response = await this.azureTranslator.translate(entriesToTranslate, [language]);
					if (response.length !== entriesToTranslate.length) throw new Error("Azure returned an unexpected number of translations");
					response.forEach((result, index) => {
						const translated = result.translations.find((translation) => translation.to.toLowerCase() === language.toLowerCase());
						if (!translated) throw new Error(`No translation returned for ${language}`);
						output = this.setAtPath(output, entriesToTranslate[index].path, translated.text);
					});
				}
				await mkdir(path.dirname(outputPath), { recursive: true });
				await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
				entriesToTranslate.forEach((entry) => {
					this.cache.markTranslated(namespace, entry, language);
				});
			}
			this.cache.removeMissingKeys(namespace, flattened);
			await this.cache.save();
		}
	}
	copyExistingTranslations(source, existing, flattened) {
		let result = structuredClone(source);
		if (existing === void 0) return result;
		for (const entry of flattened) {
			const currentTranslation = this.getAtPath(existing, entry.path);
			if (typeof currentTranslation === "string") result = this.setAtPath(result, entry.path, currentTranslation);
		}
		return result;
	}
	getAtPath(value, translationPath) {
		let current = value;
		for (const key of translationPath) {
			if (current === null || typeof current !== "object" || !(key in current)) return;
			current = current[key];
		}
		return current;
	}
	setAtPath(value, translationPath, translatedText) {
		if (translationPath.length === 0) return translatedText;
		let current = value;
		for (const key of translationPath.slice(0, -1)) current = current[key];
		current[translationPath.at(-1)] = translatedText;
		return value;
	}
	async readJsonIfExists(filePath) {
		try {
			const contents = await readFile(filePath, "utf8");
			return JSON.parse(contents);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	}
	outputPath(language, namespace) {
		const languageRoot = path.resolve(this.localesRoot, language);
		const outputPath = path.resolve(languageRoot, `${namespace}.json`);
		const relativePath = path.relative(languageRoot, outputPath);
		if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) throw new Error(`Invalid translation namespace: ${namespace}`);
		return outputPath;
	}
	validateLanguage(language) {
		if (!/^[A-Za-z0-9-]+$/.test(language)) throw new Error(`Invalid target language: ${language}`);
	}
	flattener(value, translationPath = []) {
		if (typeof value === "string") return [{
			path: translationPath,
			text: value
		}];
		if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, nestedValue]) => this.flattener(nestedValue, [...translationPath, key]));
		return [];
	}
};
//#endregion
//#region src/config/container.ts
function createContainer() {
	const localesRoot = path.resolve(process.env.LOCALES_ROOT ?? "src/locales");
	const sourceRoot = path.join(localesRoot, "en");
	const azureTranslator = new AzureTranslator(["es", "fr"]);
	return {
		azureTranslator,
		translationFileLoader: new TranslationFileLoader(sourceRoot),
		translator: new Translator(azureTranslator, void 0, localesRoot)
	};
}
//#endregion
//#region src/index.ts
async function main() {
	const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
	process.chdir(workspace);
	const { translationFileLoader, translator } = createContainer();
	const files = core.getMultilineInput("files", { required: true });
	const loadedFile = await translationFileLoader.loadMany(files);
	await translator.translate(loadedFile);
}
await main();
//#endregion
export {};

//# sourceMappingURL=index.mjs.map