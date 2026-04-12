const ENV = process.env.NEXT_PUBLIC_APP_ENV;

const ENV_CONFIG: Record<string, { label: string; classes: string }> = {
  local: {
    label: "⚠ AMBIENTE LOCAL — alterações aqui não afetam produção",
    classes: "bg-orange-500 text-white",
  },
  development: {
    label: "⚠ AMBIENTE DE DEV — não é produção",
    classes: "bg-amber-500 text-white",
  },
};

export default function EnvBanner() {
  if (!ENV || !ENV_CONFIG[ENV]) return null;

  const { label, classes } = ENV_CONFIG[ENV];

  return (
    <div className={`w-full text-center text-xs font-semibold py-1 tracking-wide ${classes}`}>
      {label}
    </div>
  );
}
