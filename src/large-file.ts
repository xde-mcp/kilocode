export function formatUserName(firstName: string, lastName: string): string {
	return `${firstName} ${lastName}`
}

export function calculateTotalPrice(price: number, tax: number): number {
	return price + price * tax
}

export function validateEmail(email: string): boolean {
	return email.includes("@")
}

export class UserService {
	getName() {
		return "user"
	}
}

export class ProductService {
	getPrice() {
		return 100
	}
}
