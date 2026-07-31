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
    private readonly sourceRoot: string;

    constructor(sourceRoot = "src/locales/en") {
        this.sourceRoot = path.resolve(sourceRoot);
    }

    async load(filePath: string): Promise<TranslationFile> {
        const absoluteFilePath = path.resolve(filePath);
        const relativePath = path.relative(
            this.sourceRoot,
            absoluteFilePath,
        );

        if (
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw new Error(
                `Translation file ${absoluteFilePath} must be inside ` +
                `${this.sourceRoot}`,
            );
        }

        if (!relativePath.endsWith(".json")) {
            throw new Error("Translation file must be a JSON file");
        }

        const rawFile = await readFile(absoluteFilePath, "utf8");

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
