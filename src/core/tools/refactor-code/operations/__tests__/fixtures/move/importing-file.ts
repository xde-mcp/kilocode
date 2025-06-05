// This file imports symbols from single-file.ts
import { moveableFunction, MoveableClass, moveableVariable, MoveableType, useClass, useType } from "./single-file"

// Using the imported symbols
export function consumeImports(): string {
	const instance = new MoveableClass("imported")
	const typeObj: MoveableType = {
		id: 123,
		name: "Imported Type",
	}

	return `
    Function: ${moveableFunction("imported")}
    Class: ${instance.method()}
    Variable: ${moveableVariable}
    Type: ${useType(typeObj)}
    UseClass: ${useClass()}
  `
}
