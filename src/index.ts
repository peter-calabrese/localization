import {createContainer} from "./config/container.js";
import * as core from '@actions/core'

async function main(){
    const workspace =
        process.env.GITHUB_WORKSPACE ?? process.cwd();

    process.chdir(workspace);

    const {translationFileLoader, translator} = createContainer();

    const files = core.getMultilineInput("files", {
        required: true,
    });


    const loadedFile = await translationFileLoader.loadMany(files)

    await translator.translate(loadedFile)

}


await main()
