import { readFile } from "node:fs/promises";
import path from "node:path";

type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
    | JsonPrimitive
    | JsonValue[]
    | { [key: string]: JsonValue };

export interface TranslationFile {
    namespace: string;
    data: JsonValue;
}

export class TranslationFileLoader {
    private readonly sourceRoot = path.resolve(
        "src/locales/en",
    );

    async load(filePath: string): Promise<TranslationFile> {
        const absoluteFilePath = path.resolve(filePath);
        const relativePath = path.relative(
            this.sourceRoot,
            absoluteFilePath,
        );
        const rawFile = await readFile(filePath, "utf8");

        const namespace = relativePath
            .replace(/\.json$/, "")
            .split(path.sep)
            .join("/");

        const data = JSON.parse(rawFile) as JsonValue;

        return {
            namespace,
            data,
        };
    }

    async loadMany(
        filePaths: string[],
    ): Promise<TranslationFile[]> {
        return Promise.all(
            filePaths.map((filePath) => this.load(filePath)),
        );
    }
}