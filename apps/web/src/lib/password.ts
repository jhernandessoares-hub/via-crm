export interface PasswordCheck {
  label: string;
  ok: boolean;
}

export function checkPassword(password: string): PasswordCheck[] {
  return [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Letra maiúscula (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "Letra minúscula (a-z)", ok: /[a-z]/.test(password) },
    { label: "Número (0-9)", ok: /[0-9]/.test(password) },
    { label: "Caractere especial (!@#$...)", ok: /[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(password) },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return checkPassword(password).every((c) => c.ok);
}
