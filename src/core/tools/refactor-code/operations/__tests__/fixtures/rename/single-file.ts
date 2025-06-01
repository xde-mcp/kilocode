// Sample file for rename testing

function oldFunction(param: string): string {
	return `Function result: ${param}`
}

function callOldFunction() {
	return oldFunction("test")
}

class TestClass {
	oldMethod() {
		return "Old method result"
	}

	callOldMethod() {
		return this.oldMethod()
	}
}

const instance = new TestClass()
instance.oldMethod()

export { oldFunction, callOldFunction, TestClass }
