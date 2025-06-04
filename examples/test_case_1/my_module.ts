function fib(n: number): number {
	if (n <= 1) {
		return n
	}
	// you are a HOLE FILLER. I will fill the hole in the provided file content.
	return fib(n - 1) + fib(n - 2)
}

// add more math fns here
function factorial(n: number): number {
	if (n <= 1) {
		return 1
	}
	return n * factorial(n - 1)
}
function sum(n: number): number {
	if (n <= 0) {
		return 0
	}
	return n + sum(n - 1)
}

function whyDontYou(n: number): number {
	return 42
}
