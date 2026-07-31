import {createContainer} from "./config/container.js";
import * as core from '@actions/core'

async function main(){
    const workspace =
        process.env.GITHUB_WORKSPACE ?? process.cwd();

    process.chdir(workspace);

    const localesRoot = core.getInput("locales-root") ||
        process.env.LOCALES_ROOT ||
        "src/locales";
    const {translationFileLoader, translator} = createContainer(localesRoot);

    const files = core.getMultilineInput("files", {
        required: true,
    });


    const loadedFile = await translationFileLoader.loadMany(files)

    await translator.translate(loadedFile)

}


await main()
