import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import type {
    TranslationCacheData,
    TranslationCacheStore,
} from "./TranslationCache.js";

export class JsonFileCacheStore implements TranslationCacheStore {
    private readonly cachePath: string;

    constructor(cachePath = ".translation-cache/cache.json") {
        this.cachePath = path.resolve(cachePath);
    }

    async load(): Promise<TranslationCacheData> {
        try {
            const contents = await readFile(this.cachePath, "utf8");
            return JSON.parse(contents) as TranslationCacheData;
        } catch (error) {
            if (this.isFileNotFound(error)) {
                return {};
            }

            throw error;
        }
    }

    async save(data: TranslationCacheData): Promise<void> {
        await mkdir(path.dirname(this.cachePath), {recursive: true});

        const temporaryPath = `${this.cachePath}.${process.pid}.tmp`;
        await writeFile(
            temporaryPath,
            `${JSON.stringify(data, null, 2)}\n`,
            "utf8",
        );
        await rename(temporaryPath, this.cachePath);
    }

    private isFileNotFound(
        error: unknown,
    ): error is NodeJS.ErrnoException {
        return (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        );
    }
}