import {createContainer} from "./config/container.js";
import * as core from '@actions/core'

async function main(){
    const workspace =
        process.env.GITHUB_WORKSPACE ?? process.cwd();

    process.chdir(workspace);

    const localesRoot = core.getInput("locales-root") ||
        process.env.LOCALES_ROOT ||
        "src/locales";
    const languages = core.getMultilineInput("languages", {
        required: true,
    }).flatMap((value) => value.split(/[\s,]+/)).filter(Boolean);
    const {translationFileLoader, translator} = createContainer(
        localesRoot,
        languages,
    );

    const files = core.getMultilineInput("files", {
        required: true,
    });


    const loadedFile = await translationFileLoader.loadMany(files)

    const translatedPaths = await translator.translate(loadedFile)

    core.setOutput("translated-paths", translatedPaths.join("\n"));

}


await main()
