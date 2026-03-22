type MaterialBalanceStripProps = {
  advantage: number;
  capturedPieces: string[];
};

export function MaterialBalanceStrip({
  advantage,
  capturedPieces,
}: MaterialBalanceStripProps) {
  return (
    <div className="mt-1 flex min-h-[18px] items-center gap-1 text-xs font-semibold text-white/55">
      {capturedPieces.length > 0 ? (
        <div className="flex items-center gap-0.5">
          {capturedPieces.map((piece, index) => (
            <img
              key={`${piece}-${index}`}
              src={`/pieces/${piece}.svg`}
              alt={piece}
              className="h-4 w-4 object-contain opacity-90 sm:h-[18px] sm:w-[18px]"
            />
          ))}
        </div>
      ) : (
        <span className="block h-4 sm:h-[18px]" />
      )}
      {advantage > 0 ? <span>{`+${advantage}`}</span> : null}
    </div>
  );
}
