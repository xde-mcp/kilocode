def calculate_factorial(number: int) -> int:
    """
    Calculates the factorial of a non-negative integer.

    Args:
        number: The non-negative integer for which to calculate the factorial.

    Returns:
        The factorial of the number.

    Raises:
        ValueError: If the input number is negative.
    """
    if number < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    if number == 0:
        return 1
    
    factorial_result = 1
    for i in range(1, number + 1):
        factorial_result *= i
        
    return factorial_result

if __name__ == "__main__":
    # Example usage:
    try:
        num = 5
        print(f"The factorial of {num} is {calculate_factorial(num)}")

        num_zero = 0
        print(f"The factorial of {num_zero} is {calculate_factorial(num_zero)}")

        num_negative = -1
        print(f"The factorial of {num_negative} is {calculate_factorial(num_negative)}")
    except ValueError as e:
        print(f"Error: {e}")