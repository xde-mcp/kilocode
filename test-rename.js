const path = require("path");
const { RefactorEngine } = require("./src/core/tools/refactor-code/engine");

async function testRenameRefactor() {
    console.log("Starting rename refactoring test...");

    // Initialize the refactor engine with the project root
    const engine = new RefactorEngine({
        projectRootPath: __dirname,
    });

    // Define the rename operation - rename formatUserName to formatFullName
    const renameOp = {
        id: "rename-format-user-name",
        operation: "rename",
        selector: {
            type: "identifier",
            kind: "function",
            name: "formatUserName",
            filePath: "examples/src/utils/formatting.ts",
        },
        newName: "formatFullName",
        scope: "project",
    };

    console.log("Executing rename operation...");

    try {
        // Execute the operation
        const result = await engine.executeOperation(renameOp);

        console.log(`Operation result: ${result.success ? "SUCCESS" : "FAILURE"}`);

        if (!result.success) {
            console.error(`Error: ${result.error}`);
        } else {
            console.log(`Affected files: ${result.affectedFiles.join(", ")}`);
        }
    } catch (error) {
        console.error("Error during refactoring:", error);
    }
}

// Run the test
testRenameRefactor().catch(console.error);