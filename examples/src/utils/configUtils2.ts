export const API_TIMEOUT = 5000;
export function validateStatus2(status: 'active' | 'inactive' | 'pending'): boolean {
  switch (status) {
    case 'active':
      return true;
    case 'inactive':
      return false;
    case 'pending':
      return false; // Or maybe true depending on logic
    default:
      return false;
  }
}
