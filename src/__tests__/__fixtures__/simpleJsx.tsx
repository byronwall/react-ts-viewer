const name = "test";
const handleMouseDown = () => {
  console.log("handleMouseDown");
};
const cn = (...args: (string | boolean)[]) => args.join(" ");
export function TimeBlock({
  block,
  isPreview = false,
  isClipped = false,
}: any) {
  return (
    <main data-time-block="true">
      <div
        className={cn(
          "group absolute z-10 rounded-md border",
          isPreview
            ? "border-dashed border-gray-400 bg-gray-100/50"
            : "border-solid bg-card shadow-sm hover:shadow-md",
          isClipped && "rounded-none border-dashed",
          block.isClippedStart && "rounded-t-none border-t-0",
          block.isClippedEnd && "rounded-b-none border-b-0"
        )}
        onMouseDown={handleMouseDown}
      >
        {name}
      </div>
    </main>
  );
}
