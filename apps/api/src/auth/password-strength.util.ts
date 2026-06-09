export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'A senha deve ter no mínimo 8 caracteres.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra maiúscula (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra minúscula (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'A senha deve conter pelo menos um número (0-9).';
  }
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(password)) {
    return 'A senha deve conter pelo menos um caractere especial (!@#$%...).';
  }
  return null;
}
