'use client';

interface MeterCardProps {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  willResetAt?: string | Date | null;
  unit?: string;
}

export function MeterCard({ label, used, limit, remaining, percent, willResetAt, unit = '' }: MeterCardProps) {
  const isUnlimited = limit < 0;

  const barColor =
    isUnlimited ? 'bg-blue-500' :
    percent >= 95 ? 'bg-red-500' :
    percent >= 80 ? 'bg-yellow-500' :
    'bg-green-500';

  const textColor =
    isUnlimited ? 'text-blue-600 dark:text-blue-400' :
    percent >= 95 ? 'text-red-600 dark:text-red-400' :
    percent >= 80 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-green-600 dark:text-green-400';

  const resetDate = willResetAt ? new Date(willResetAt) : null;
  const resetLabel = resetDate
    ? resetDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        {!isUnlimited && (
          <span className={`text-xs font-semibold ${textColor}`}>
            {percent}%
          </span>
        )}
      </div>

      {isUnlimited ? (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{used.toLocaleString('pt-BR')}</span>
          <span className="text-sm text-gray-500">usado{unit ? ` ${unit}` : ''}</span>
          <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Ilimitado</span>
        </div>
      ) : (
        <>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              <span className="font-semibold text-gray-900 dark:text-white">{used.toLocaleString('pt-BR')}</span>
              {' / '}{limit.toLocaleString('pt-BR')}{unit ? ` ${unit}` : ''}
            </span>
            <span>
              {remaining > 0 ? (
                <span>{remaining.toLocaleString('pt-BR')} restante{remaining !== 1 ? 's' : ''}</span>
              ) : (
                <span className="text-red-500 font-medium">Limite atingido</span>
              )}
            </span>
          </div>
          {resetLabel && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Renova em {resetLabel}
            </p>
          )}
        </>
      )}
    </div>
  );
}
